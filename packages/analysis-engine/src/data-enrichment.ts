/**
 * Data Enrichment Module
 * 
 * Cross-references multiple free data sources to build richer entity profiles.
 * Each source adds different dimensions:
 * 
 * - Wikidata: structured relationships, career facts, cultural connections
 * - MusicBrainz: music collaborations, labels, production credits
 * - Discogs: visual collaborators (photographers, designers), label history
 * - TMDb: film/video credits, director-artist connections
 * - Last.fm: similar artists, genre tags, cultural proximity
 * - YouTube: channel relationships, collaboration videos
 * - Spotify: related artists, genre classification
 */

import Anthropic from '@anthropic-ai/sdk';

// ── WIKIDATA ──────────────────────────────────────────────

interface WikidataEntity {
  id: string;
  label: string;
  description: string;
  claims: Record<string, any[]>;
}

export async function searchWikidata(name: string, type?: string): Promise<WikidataEntity | null> {
  try {
    // Search for entity
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&limit=5`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (!searchData.search?.length) return null;

    // Get full entity data
    const entityId = searchData.search[0].id;
    const entityUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${entityId}&languages=en&format=json`;
    const entityRes = await fetch(entityUrl);
    const entityData = await entityRes.json();
    const entity = entityData.entities?.[entityId];

    if (!entity) return null;

    return {
      id: entityId,
      label: entity.labels?.en?.value || name,
      description: entity.descriptions?.en?.value || '',
      claims: entity.claims || {},
    };
  } catch (e) {
    console.error(`Wikidata search failed for "${name}":`, e);
    return null;
  }
}

/**
 * Extract relationships from Wikidata claims.
 * Key properties:
 * P175 = performer, P86 = composer, P162 = producer,
 * P344 = director of photography, P57 = director,
 * P264 = record label, P136 = genre, P27 = country of citizenship,
 * P19 = place of birth, P1411 = nominated for, P166 = award received
 */
export async function getWikidataRelationships(entityId: string): Promise<{
  collaborators: string[];
  labels: string[];
  genres: string[];
  birthPlace: string | null;
  awards: string[];
}> {
  try {
    // Targeted SPARQL: get collaborators, labels, genres, awards
    const sparql = `
      SELECT ?related ?relatedLabel ?propLabel WHERE {
        {
          wd:${entityId} wdt:P175|wdt:P86|wdt:P162|wdt:P57|wdt:P344|wdt:P1431|wdt:P527|wdt:P1303 ?related .
        } UNION {
          ?related wdt:P175|wdt:P86|wdt:P162|wdt:P57|wdt:P344 wd:${entityId} .
        }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
      } LIMIT 50
    `;
    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql)}&format=json`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CultureAndContext/1.0' },
    });
    const data = await res.json();

    const results = data.results?.bindings || [];
    const collaborators = results
      .map((r: any) => r.relatedLabel?.value)
      .filter(Boolean)
      .filter((name: string) => !name.startsWith('Q')); // Filter out unresolved QIDs

    // Also get record labels and genres
    const sparql2 = `
      SELECT ?label ?labelLabel ?genre ?genreLabel ?birthPlace ?birthPlaceLabel WHERE {
        OPTIONAL { wd:${entityId} wdt:P264 ?label . }
        OPTIONAL { wd:${entityId} wdt:P136 ?genre . }
        OPTIONAL { wd:${entityId} wdt:P19 ?birthPlace . }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
      } LIMIT 30
    `;
    const url2 = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparql2)}&format=json`;
    const res2 = await fetch(url2, {
      headers: { 'User-Agent': 'CultureAndContext/1.0' },
    });
    const data2 = await res2.json();
    const results2 = data2.results?.bindings || [];

    const labels = [...new Set(results2.map((r: any) => r.labelLabel?.value).filter(Boolean))];
    const genres = [...new Set(results2.map((r: any) => r.genreLabel?.value).filter(Boolean))];
    const birthPlace = results2.find((r: any) => r.birthPlaceLabel?.value)?.birthPlaceLabel?.value || null;

    return {
      collaborators: [...new Set(collaborators)] as string[],
      labels: labels as string[],
      genres: genres as string[],
      birthPlace,
      awards: [],
    };
  } catch (e) {
    console.error(`Wikidata relationships failed for ${entityId}:`, e);
    return { collaborators: [], labels: [], genres: [], birthPlace: null, awards: [] };
  }
}


// ── MUSICBRAINZ ───────────────────────────────────────────

interface MusicBrainzArtist {
  id: string;
  name: string;
  type: string;
  country: string;
  genres: string[];
  relations: Array<{
    type: string;
    targetName: string;
    targetType: string;
  }>;
}

export async function searchMusicBrainz(name: string): Promise<MusicBrainzArtist | null> {
  try {
    const url = `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(name)}&fmt=json&limit=3`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CultureAndContext/1.0 (contact@cultureandcontext.com)' },
    });
    const data = await res.json();

    if (!data.artists?.length) return null;

    const artist = data.artists[0];

    // Get full artist with relationships
    const detailUrl = `https://musicbrainz.org/ws/2/artist/${artist.id}?inc=artist-rels+label-rels+url-rels&fmt=json`;
    const detailRes = await fetch(detailUrl, {
      headers: { 'User-Agent': 'CultureAndContext/1.0 (contact@cultureandcontext.com)' },
    });
    const detail = await detailRes.json();

    return {
      id: artist.id,
      name: artist.name,
      type: artist.type || 'Unknown',
      country: artist.country || '',
      genres: (artist.tags || []).map((t: any) => t.name),
      relations: (detail.relations || []).map((r: any) => ({
        type: r.type,
        targetName: r.artist?.name || r.label?.name || r.url?.resource || '',
        targetType: r['target-type'] || '',
      })),
    };
  } catch (e) {
    console.error(`MusicBrainz search failed for "${name}":`, e);
    return null;
  }
}


// ── DISCOGS ───────────────────────────────────────────────

interface DiscogsArtist {
  id: number;
  name: string;
  profile: string;
  members: string[];
  urls: string[];
}

export async function searchDiscogs(name: string): Promise<DiscogsArtist | null> {
  // Note: Discogs requires a user token for higher rate limits
  // Free: 25 req/min unauthenticated, 60 req/min with token
  const token = process.env.DISCOGS_TOKEN || '';
  try {
    const url = `https://api.discogs.com/database/search?q=${encodeURIComponent(name)}&type=artist&per_page=3${token ? `&token=${token}` : ''}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CultureAndContext/1.0' },
    });
    const data = await res.json();

    if (!data.results?.length) return null;

    // Get full artist profile
    const artistUrl = data.results[0].resource_url;
    const detailRes = await fetch(`${artistUrl}${token ? `?token=${token}` : ''}`, {
      headers: { 'User-Agent': 'CultureAndContext/1.0' },
    });
    const detail = await detailRes.json();

    return {
      id: detail.id,
      name: detail.name,
      profile: detail.profile || '',
      members: (detail.members || []).map((m: any) => m.name),
      urls: detail.urls || [],
    };
  } catch (e) {
    console.error(`Discogs search failed for "${name}":`, e);
    return null;
  }
}


// ── TMDB (Film/Video) ─────────────────────────────────────

interface TMDbPerson {
  id: number;
  name: string;
  knownFor: string;
  credits: Array<{ title: string; role: string; year: string }>;
}

export async function searchTMDb(name: string): Promise<TMDbPerson | null> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://api.themoviedb.org/3/search/person?api_key=${apiKey}&query=${encodeURIComponent(name)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.results?.length) return null;

    const person = data.results[0];
    const creditsUrl = `https://api.themoviedb.org/3/person/${person.id}/combined_credits?api_key=${apiKey}`;
    const creditsRes = await fetch(creditsUrl);
    const credits = await creditsRes.json();

    return {
      id: person.id,
      name: person.name,
      knownFor: person.known_for_department || '',
      credits: [...(credits.crew || []), ...(credits.cast || [])].slice(0, 20).map((c: any) => ({
        title: c.title || c.name || '',
        role: c.job || c.character || c.department || '',
        year: (c.release_date || c.first_air_date || '').slice(0, 4),
      })),
    };
  } catch (e) {
    console.error(`TMDb search failed for "${name}":`, e);
    return null;
  }
}


// ── LAST.FM ───────────────────────────────────────────────

export async function getLastFmSimilar(artistName: string): Promise<string[]> {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) return [];

  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=artist.getsimilar&artist=${encodeURIComponent(artistName)}&api_key=${apiKey}&format=json&limit=20`;
    const res = await fetch(url);
    const data = await res.json();

    return (data.similarartists?.artist || []).map((a: any) => a.name);
  } catch (e) {
    console.error(`Last.fm similar failed for "${artistName}":`, e);
    return [];
  }
}

export async function getLastFmTags(artistName: string): Promise<string[]> {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) return [];

  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=${encodeURIComponent(artistName)}&api_key=${apiKey}&format=json`;
    const res = await fetch(url);
    const data = await res.json();

    return (data.toptags?.tag || []).slice(0, 10).map((t: any) => t.name);
  } catch (e) {
    return [];
  }
}


// ── SPOTIFY (metadata only, no audio features) ────────────

export async function getSpotifyRelated(artistName: string): Promise<string[]> {
  // Requires OAuth token — implement token flow if SPOTIFY_CLIENT_ID is set
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];

  try {
    // Get access token
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
    });
    const tokenData = await tokenRes.json();
    const token = tokenData.access_token;

    // Search for artist
    const searchRes = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName)}&type=artist&limit=1`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const searchData = await searchRes.json();
    const artistId = searchData.artists?.items?.[0]?.id;
    if (!artistId) return [];

    // Get related artists
    const relatedRes = await fetch(
      `https://api.spotify.com/v1/artists/${artistId}/related-artists`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const relatedData = await relatedRes.json();

    return (relatedData.artists || []).slice(0, 15).map((a: any) => a.name);
  } catch (e) {
    console.error(`Spotify related failed for "${artistName}":`, e);
    return [];
  }
}


// ── UNIFIED ENRICHMENT ────────────────────────────────────

export interface EnrichmentResult {
  sources: string[];
  wikidata: WikidataEntity | null;
  musicbrainz: MusicBrainzArtist | null;
  discogs: DiscogsArtist | null;
  tmdb: TMDbPerson | null;
  similarArtists: string[];
  tags: string[];
  spotifyRelated: string[];
  allConnections: string[]; // deduplicated names from all sources
}

/**
 * Enrich an entity by cross-referencing all available data sources.
 * Returns combined data that can be merged into the graph.
 */
export async function enrichEntity(name: string, label: string): Promise<EnrichmentResult> {
  console.log(`  🔍 Enriching "${name}" across data sources...`);

  const sources: string[] = [];

  // Run all lookups in parallel
  const [wikidata, musicbrainz, discogs, tmdb, similar, tags, spotifyRelated] = await Promise.all([
    searchWikidata(name).then(r => { if (r) sources.push('wikidata'); return r; }),
    ['Artist', 'Genre'].includes(label) ? searchMusicBrainz(name).then(r => { if (r) sources.push('musicbrainz'); return r; }) : Promise.resolve(null),
    ['Artist', 'Genre'].includes(label) ? searchDiscogs(name).then(r => { if (r) sources.push('discogs'); return r; }) : Promise.resolve(null),
    ['Director', 'Photographer', 'Artist'].includes(label) ? searchTMDb(name).then(r => { if (r) sources.push('tmdb'); return r; }) : Promise.resolve(null),
    label === 'Artist' ? getLastFmSimilar(name).then(r => { if (r.length) sources.push('lastfm'); return r; }) : Promise.resolve([]),
    label === 'Artist' ? getLastFmTags(name) : Promise.resolve([]),
    label === 'Artist' ? getSpotifyRelated(name).then(r => { if (r.length) sources.push('spotify'); return r; }) : Promise.resolve([]),
  ]);

  // Pull Wikidata relationships if we got a Wikidata entity
  let wikidataRels = { collaborators: [] as string[], labels: [] as string[], genres: [] as string[], birthPlace: null as string | null, awards: [] as string[] };
  if (wikidata) {
    try {
      wikidataRels = await getWikidataRelationships(wikidata.id);
      if (wikidataRels.collaborators.length) console.log(`    Wikidata: ${wikidataRels.collaborators.length} collaborators, ${wikidataRels.labels.length} labels, ${wikidataRels.genres.length} genres`);
    } catch (e) { /* non-critical */ }
  }

  // Collect all connection names from every source
  const connectionSet = new Set<string>();

  // From Wikidata SPARQL
  wikidataRels.collaborators.forEach(c => connectionSet.add(c));
  wikidataRels.labels.forEach(l => connectionSet.add(l));

  // From MusicBrainz relationships — artists, labels, and other entities
  musicbrainz?.relations.forEach(r => {
    if (r.targetName && (r.targetType === 'artist' || r.targetType === 'label')) {
      connectionSet.add(r.targetName);
    }
  });

  // From Discogs members
  discogs?.members.forEach(m => connectionSet.add(m));

  // From TMDb credits (directors/crew)
  tmdb?.credits.forEach(c => {
    // We'd need to cross-ref, but the title itself is useful
  });

  // From Last.fm similar
  similar.forEach(s => connectionSet.add(s));

  // From Spotify related
  spotifyRelated.forEach(s => connectionSet.add(s));

  // Remove self
  connectionSet.delete(name);

  console.log(`  ✓ Found data from ${sources.length} sources: ${sources.join(', ')} | ${connectionSet.size} connections`);

  return {
    sources,
    wikidata,
    musicbrainz,
    discogs,
    tmdb,
    similarArtists: similar,
    tags,
    spotifyRelated,
    allConnections: Array.from(connectionSet),
  };
}
