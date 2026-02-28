import Anthropic from '@anthropic-ai/sdk';
import { getDriver } from '@cultural-graph/graph-db/src/connection';
import { enrichEntity } from './data-enrichment';

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const INGESTION_PROMPT = `You are a cultural intelligence researcher. Given an entity name and type, produce a comprehensive profile for a cultural graph database.

Return ONLY valid JSON matching this schema:

{
  "entity": {
    "id": "kebab-case-id",
    "label": "Artist|Photographer|Director|Stylist|Designer|Brand|City|Scene|Aesthetic|Genre|Technique|Influencer",
    "name": "Display Name",
    "description": "1-3 sentence summary",
    "extended_description": "Full cultural context paragraph (100-200 words)",
    "color_palette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],
    "color_weights": [0.3, 0.25, 0.2, 0.15, 0.1],
    "color_temperature": -1.0 to 1.0,
    "color_saturation": 0.0-1.0,
    "color_value": 0.0-1.0,
    "aesthetic_tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
    "aesthetic_weights": [0.0-1.0, ...],
    "framing": ["type1", "type2"],
    "lighting": ["type1", "type2"],
    "texture": ["type1", "type2"],
    "medium": ["type1", "type2"],
    "density": 0.0-1.0,
    "negative_space": 0.0-1.0,
    "realism": 0.0-1.0,
    "post_processing": 0.0-1.0,
    "era_references": ["era1", "era2"],
    "mood_tags": ["mood1", "mood2", "mood3"],
    "mood_weights": [0.0-1.0, ...],
    "energy": 0.0-1.0,
    "attitude": ["trait1", "trait2"],
    "motifs": ["motif1", "motif2", "motif3"],
    "character_archetype": "the [archetype]",
    "world_setting": "evocative description of their visual world"
  },
  "artist_extras": {
    "genres": ["genre1", "genre2"],
    "bpm_range": [low, high],
    "sonic_energy": 0.0-1.0,
    "sonic_valence": 0.0-1.0,
    "sonic_tags": ["tag1", "tag2"],
    "spotify_id": "if known, otherwise null",
    "fashion_brands": ["brand1", "brand2"],
    "fashion_vocabulary": ["term1", "term2"],
    "fashion_price_tier": "luxury|contemporary|streetwear|fast",
    "origin_city": "kebab-case-city-id",
    "current_city": "kebab-case-city-id",
    "associated_cities": ["city-id1", "city-id2"],
    "known_for": ["music-video", "editorial", "live-performance", etc],
    "gaze_pattern": "confrontational|averted|intimate|obscured",
    "body_language": "performative|natural|sculptural|dynamic",
    "solo_vs_group": 0.0-1.0,
    "studio_vs_location": 0.0-1.0
  },
  "brand_extras": {
    "category": "fashion|luxury|streetwear|beauty|tech",
    "price_tier": "ultra-luxury|luxury|premium|mass",
    "founded_year": number,
    "headquarters_city": "city-id",
    "signature_elements": ["element1", "element2"]
  },
  "city_extras": {
    "country": "Country Name",
    "region": "Region",
    "population_tier": "megacity|major|mid|small",
    "cultural_scenes": ["scene1", "scene2"],
    "fashion_ecosystem": ["brand1", "brand2"]
  },
  "scene_extras": {
    "scene_type": "venue|festival|movement|subculture",
    "primary_city": "city-id",
    "active_era": "2010-present",
    "capacity_tier": "intimate|mid|large|massive"
  },
  "connected_entities": [
    {
      "name": "Entity Name",
      "id": "kebab-case-id",
      "label": "NodeLabel",
      "relationship_type": "COLLABORATED_WITH|SHOT_BY|DIRECTED_BY|STYLED_BY|BRAND_AFFILIATION|AESTHETIC_AFFINITY|GEOGRAPHIC_ANCHOR|PART_OF_SCENE|GENRE_AFFINITY|USES_TECHNIQUE",
      "relationship_properties": {
        "weight": 0.0-1.0,
        "project": "optional project name",
        "year": optional_year,
        "role": "optional role description"
      },
      "brief_description": "1 sentence about this entity if it doesn't exist in the graph yet"
    }
  ]
}

RULES:
- Include ONLY the extras object relevant to the entity label (artist_extras for Artists, brand_extras for Brands, etc). Set others to null.
- connected_entities should include 10-20 real, verifiable connections: photographers they've worked with, directors, stylists, brands they're affiliated with, cities they're connected to, scenes they're part of, aesthetics they embody.
- All color hex values must be valid 7-character strings.
- All weights/scores must be between 0.0 and 1.0.
- Be culturally accurate. These profiles inform creative decisions for real campaigns.
- For connected_entities, use existing graph IDs when referencing known entities. For new entities, create appropriate kebab-case IDs.
- Include at least 3 different relationship types in connected_entities.`;

export interface IngestionResult {
  entity: any;
  connectedEntities: any[];
  nodesCreated: number;
  relationshipsCreated: number;
  errors: string[];
}

export async function ingestEntity(
  name: string,
  label?: string,
  options?: {
    depth?: number; // 0 = just this entity, 1 = also ingest connected entities, 2 = two levels deep
    skipExisting?: boolean;
  }
): Promise<IngestionResult> {
  const depth = options?.depth ?? 1;
  const skipExisting = options?.skipExisting ?? true;
  const anthropic = getClient();
  const driver = getDriver();
  const session = driver.session();

  const result: IngestionResult = {
    entity: null,
    connectedEntities: [],
    nodesCreated: 0,
    relationshipsCreated: 0,
    errors: [],
  };

  try {
    // Check if entity already exists
    if (skipExisting) {
      const existing = await session.run(
        `MATCH (n) WHERE toLower(n.name) = toLower($name) RETURN n, labels(n)[0] AS label LIMIT 1`,
        { name }
      );
      if (existing.records.length > 0) {
        console.log(`Entity "${name}" already exists in graph, skipping profile generation`);
        result.entity = existing.records[0].get('n').properties;
        // Still proceed to check/create connections if depth > 0
      }
    }

    // Generate profile via Claude
    if (!result.entity) {
      console.log(`Researching: ${name}...`);
      const labelHint = label ? `\nThe entity type is: ${label}` : '\nDetermine the most appropriate entity type.';

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        system: INGESTION_PROMPT,
        messages: [{
          role: 'user',
          content: `Research and create a complete cultural profile for: "${name}"${labelHint}\n\nBe thorough and culturally accurate.`,
        }],
      });

      const textContent = response.content.find(c => c.type === 'text');
      if (!textContent || textContent.type !== 'text') throw new Error('No response from Claude');

      let jsonStr = textContent.text.trim();
      if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

      const profile = JSON.parse(jsonStr);
      const entity = profile.entity;

      // Merge extras into entity properties
      const extras = profile.artist_extras || profile.brand_extras || profile.city_extras || profile.scene_extras || {};
      const nodeProps = { ...entity, ...extras, source: 'automated', confidence: 0.8 };
      delete nodeProps.label;

      // Validate label
      const validLabels = ['Artist', 'Photographer', 'Director', 'Stylist', 'Designer', 'Brand', 'City', 'Scene', 'Aesthetic', 'Genre', 'Project', 'Technique', 'Influencer'];
      if (!validLabels.includes(entity.label)) {
        throw new Error(`Invalid label returned: ${entity.label}`);
      }

      // Create node
      nodeProps.created_at = new Date().toISOString();
      nodeProps.updated_at = new Date().toISOString();

      await session.run(
        `MERGE (n:${entity.label} {id: $id}) SET n += $props`,
        { id: entity.id, props: nodeProps }
      );

      console.log(`  ✓ Created ${entity.label}: ${entity.name}`);
      result.entity = nodeProps;
      result.nodesCreated++;

      // Process connected entities
      const connections = profile.connected_entities || [];
      result.connectedEntities = connections;

      for (const conn of connections) {
        try {
          if (!validLabels.includes(conn.label)) continue;

          // Check if connected entity exists
          const existingConn = await session.run(
            `MATCH (n {id: $id}) RETURN n LIMIT 1`,
            { id: conn.id }
          );

          if (existingConn.records.length === 0) {
            // Create a stub node for the connected entity
            const stubProps: any = {
              id: conn.id,
              name: conn.name,
              description: conn.brief_description || '',
              source: 'automated-stub',
              confidence: 0.5,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };

            await session.run(
              `MERGE (n:${conn.label} {id: $id}) SET n += $props`,
              { id: conn.id, props: stubProps }
            );
            console.log(`  + Stub ${conn.label}: ${conn.name}`);
            result.nodesCreated++;
          }

          // Create relationship
          const relProps = {
            ...conn.relationship_properties,
            source: 'automated',
            created_at: new Date().toISOString(),
          };

          const validRelTypes = [
            'COLLABORATED_WITH', 'SHOT_BY', 'DIRECTED_BY', 'STYLED_BY',
            'BRAND_AFFILIATION', 'AESTHETIC_AFFINITY', 'GEOGRAPHIC_ANCHOR',
            'PART_OF_SCENE', 'GENRE_AFFINITY', 'USES_TECHNIQUE',
            'COLOR_SIMILARITY', 'SONIC_PROXIMITY', 'CULTURAL_BRIDGE', 'SIMILAR_TO',
          ];

          if (!validRelTypes.includes(conn.relationship_type)) continue;

          await session.run(
            `MATCH (a {id: $fromId})
             MATCH (b {id: $toId})
             MERGE (a)-[r:${conn.relationship_type}]->(b)
             SET r += $props`,
            { fromId: entity.id, toId: conn.id, props: relProps }
          );
          result.relationshipsCreated++;

        } catch (e: any) {
          result.errors.push(`Connection ${conn.name}: ${e.message}`);
        }
      }

      // ── DATA ENRICHMENT: Cross-reference external sources ──
      try {
        const enrichment = await enrichEntity(entity.name, entity.label);

        if (enrichment.sources.length > 0) {
          // Update the main entity with enrichment metadata
          const enrichProps: Record<string, any> = {
            enrichment_sources: enrichment.sources.join(','),
            enriched_at: new Date().toISOString(),
          };

          // Add Wikidata description if richer than what Claude gave
          if (enrichment.wikidata?.description && enrichment.wikidata.description.length > (entity.description?.length || 0)) {
            enrichProps.wikidata_description = enrichment.wikidata.description;
            enrichProps.wikidata_id = enrichment.wikidata.id;
          }

          // Add MusicBrainz data
          if (enrichment.musicbrainz) {
            enrichProps.musicbrainz_id = enrichment.musicbrainz.id;
            if (enrichment.musicbrainz.country) enrichProps.musicbrainz_country = enrichment.musicbrainz.country;
            if (enrichment.musicbrainz.genres.length) enrichProps.musicbrainz_genres = enrichment.musicbrainz.genres.slice(0, 10).join(',');
          }

          // Add Discogs profile
          if (enrichment.discogs) {
            enrichProps.discogs_id = String(enrichment.discogs.id);
          }

          // Add TMDb data
          if (enrichment.tmdb) {
            enrichProps.tmdb_id = String(enrichment.tmdb.id);
            enrichProps.tmdb_known_for = enrichment.tmdb.knownFor;
          }

          // Add Last.fm tags as additional aesthetic/genre data
          if (enrichment.tags.length > 0) {
            enrichProps.lastfm_tags = enrichment.tags.slice(0, 15).join(',');
          }

          // Update entity node with enrichment data
          await session.run(
            `MATCH (n {id: $id}) SET n += $props`,
            { id: entity.id, props: enrichProps }
          );
          console.log(`  🔗 Enriched from: ${enrichment.sources.join(', ')}`);

          // Create SIMILAR_TO relationships from cross-referenced connections
          // These are connections discovered by external sources that Claude may have missed
          const existingConnIds = new Set(connections.map((c: any) => c.id));
          const newConnections = enrichment.allConnections.filter(name => {
            // Skip if Claude already found this connection
            const kebabId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            return !existingConnIds.has(kebabId);
          });

          let enrichRelCount = 0;
          for (const connName of newConnections.slice(0, 15)) {
            try {
              const kebabId = connName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

              // Check if this entity exists in the graph
              const existing = await session.run(
                `MATCH (n) WHERE n.id = $id OR toLower(n.name) = toLower($name) RETURN n.id AS id LIMIT 1`,
                { id: kebabId, name: connName }
              );

              if (existing.records.length > 0) {
                // Entity exists — create a SIMILAR_TO or COLLABORATED_WITH relationship
                const targetId = existing.records[0].get('id');
                await session.run(
                  `MATCH (a {id: $fromId})
                   MATCH (b {id: $toId})
                   WHERE a <> b
                   MERGE (a)-[r:SIMILAR_TO]->(b)
                   SET r.source = 'enrichment',
                       r.discovered_via = $sources,
                       r.weight = 0.6,
                       r.created_at = $now`,
                  {
                    fromId: entity.id,
                    toId: targetId,
                    sources: enrichment.sources.join(','),
                    now: new Date().toISOString(),
                  }
                );
                enrichRelCount++;
              } else {
                // Create stub node for the discovered entity
                await session.run(
                  `MERGE (n:Artist {id: $id})
                   ON CREATE SET n.name = $name,
                     n.source = 'enrichment-stub',
                     n.confidence = 0.4,
                     n.created_at = $now,
                     n.updated_at = $now`,
                  { id: kebabId, name: connName, now: new Date().toISOString() }
                );
                await session.run(
                  `MATCH (a {id: $fromId})
                   MATCH (b {id: $toId})
                   WHERE a <> b
                   MERGE (a)-[r:SIMILAR_TO]->(b)
                   SET r.source = 'enrichment',
                       r.discovered_via = $sources,
                       r.weight = 0.5,
                       r.created_at = $now`,
                  {
                    fromId: entity.id,
                    toId: kebabId,
                    sources: enrichment.sources.join(','),
                    now: new Date().toISOString(),
                  }
                );
                result.nodesCreated++;
                enrichRelCount++;
              }
            } catch (e: any) {
              // Non-critical — skip this connection
            }
          }

          if (enrichRelCount > 0) {
            console.log(`  🔗 Added ${enrichRelCount} enrichment connections`);
            result.relationshipsCreated += enrichRelCount;
          }
        }
      } catch (e: any) {
        console.log(`  ⚠️ Enrichment failed (non-critical): ${e.message}`);
      }

      // Recursively ingest connected entities at depth > 1
      if (depth > 1) {
        const stubEntities = connections.filter((c: any) => c.label === 'Artist' || c.label === 'Photographer' || c.label === 'Director' || c.label === 'Stylist' || c.label === 'Influencer');
        for (const stub of stubEntities.slice(0, 5)) { // Limit to 5 to avoid explosion
          try {
            const subResult = await ingestEntity(stub.name, stub.label, { depth: depth - 1, skipExisting: true });
            result.nodesCreated += subResult.nodesCreated;
            result.relationshipsCreated += subResult.relationshipsCreated;
            result.errors.push(...subResult.errors);
          } catch (e: any) {
            result.errors.push(`Deep ingestion ${stub.name}: ${e.message}`);
          }
        }
      }
    }

    console.log(`\n✅ Ingestion complete: ${result.nodesCreated} nodes, ${result.relationshipsCreated} relationships`);
    if (result.errors.length) console.log(`⚠️  ${result.errors.length} errors`);

  } catch (e: any) {
    result.errors.push(e.message);
    console.error('Ingestion failed:', e.message);
  } finally {
    await session.close();
  }

  return result;
}

// Batch ingest multiple entities
export async function ingestMultiple(
  entities: { name: string; label?: string }[],
  options?: { depth?: number; concurrency?: number }
): Promise<{ total_nodes: number; total_relationships: number; results: IngestionResult[] }> {
  const results: IngestionResult[] = [];
  let totalNodes = 0;
  let totalRels = 0;

  // Process sequentially to avoid overwhelming the API
  for (const entity of entities) {
    console.log(`\n── Ingesting: ${entity.name} ──`);
    const result = await ingestEntity(entity.name, entity.label, { depth: options?.depth ?? 1 });
    results.push(result);
    totalNodes += result.nodesCreated;
    totalRels += result.relationshipsCreated;
  }

  console.log(`\n═══ Batch complete: ${totalNodes} nodes, ${totalRels} relationships ═══`);
  return { total_nodes: totalNodes, total_relationships: totalRels, results };
}
