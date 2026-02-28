import { Session, DateTime as Neo4jDateTime } from 'neo4j-driver';
import { NodeLabel, RelationType, NodeProperties, ScoredNode, CreativeDirection } from '@cultural-graph/shared';

// ── HELPERS ──

function now(): string {
  return new Date().toISOString();
}

function sanitizeLabel(label: string): string {
  // Whitelist valid labels to prevent injection
  const valid: NodeLabel[] = [
    'Artist', 'Photographer', 'Director', 'Stylist', 'Designer',
    'Brand', 'City', 'Scene', 'Aesthetic', 'Genre', 'Project', 'Technique',
  ];
  if (!valid.includes(label as NodeLabel)) {
    throw new Error(`Invalid node label: ${label}`);
  }
  return label;
}

function sanitizeRelType(relType: string): string {
  const valid: RelationType[] = [
    'COLLABORATED_WITH', 'SHOT_BY', 'DIRECTED_BY', 'STYLED_BY',
    'BRAND_AFFILIATION', 'AESTHETIC_AFFINITY', 'GEOGRAPHIC_ANCHOR',
    'PART_OF_SCENE', 'GENRE_AFFINITY', 'USES_TECHNIQUE',
    'COLOR_SIMILARITY', 'SONIC_PROXIMITY', 'CULTURAL_BRIDGE',
  ];
  if (!valid.includes(relType as RelationType)) {
    throw new Error(`Invalid relationship type: ${relType}`);
  }
  return relType;
}

// ── NODE CRUD ──

export async function createNode(
  session: Session,
  label: NodeLabel,
  properties: NodeProperties
): Promise<NodeProperties> {
  sanitizeLabel(label);
  const props = {
    ...properties,
    created_at: now(),
    updated_at: now(),
  };

  const result = await session.run(
    `CREATE (n:${label} $props) RETURN n`,
    { props }
  );
  return result.records[0].get('n').properties;
}

export async function getNode(
  session: Session,
  label: NodeLabel,
  id: string
): Promise<NodeProperties | null> {
  sanitizeLabel(label);
  const result = await session.run(
    `MATCH (n:${label} {id: $id}) RETURN n`,
    { id }
  );
  if (result.records.length === 0) return null;
  return result.records[0].get('n').properties;
}

export async function updateNode(
  session: Session,
  label: NodeLabel,
  id: string,
  properties: Partial<NodeProperties>
): Promise<NodeProperties> {
  sanitizeLabel(label);
  const props = { ...properties, updated_at: now() };
  delete props.id; // Don't allow ID changes

  const result = await session.run(
    `MATCH (n:${label} {id: $id}) SET n += $props RETURN n`,
    { id, props }
  );
  if (result.records.length === 0) {
    throw new Error(`Node not found: ${label}/${id}`);
  }
  return result.records[0].get('n').properties;
}

export async function deleteNode(
  session: Session,
  label: NodeLabel,
  id: string
): Promise<void> {
  sanitizeLabel(label);
  await session.run(
    `MATCH (n:${label} {id: $id}) DETACH DELETE n`,
    { id }
  );
}

export async function searchNodes(
  session: Session,
  query: string,
  limit: number = 10
): Promise<{ node: NodeProperties; label: string; score: number }[]> {
  const result = await session.run(
    `CALL db.index.fulltext.queryNodes("node_name_search", $query)
     YIELD node, score
     RETURN node, labels(node) AS labels, score
     LIMIT $limit`,
    { query: `${query}~`, limit: Math.round(limit) }
  );

  return result.records.map((record) => ({
    node: record.get('node').properties,
    label: record.get('labels')[0],
    score: record.get('score'),
  }));
}

// ── RELATIONSHIP CRUD ──

export async function createRelationship(
  session: Session,
  fromLabel: NodeLabel,
  fromId: string,
  relType: RelationType,
  properties: Record<string, any>,
  toLabel: NodeLabel,
  toId: string
): Promise<Record<string, any>> {
  sanitizeLabel(fromLabel);
  sanitizeLabel(toLabel);
  sanitizeRelType(relType);

  const props = {
    ...properties,
    created_at: now(),
  };

  const result = await session.run(
    `MATCH (a:${fromLabel} {id: $fromId})
     MATCH (b:${toLabel} {id: $toId})
     CREATE (a)-[r:${relType} $props]->(b)
     RETURN r`,
    { fromId, toId, props }
  );

  if (result.records.length === 0) {
    throw new Error(`Could not create relationship: one or both nodes not found (${fromLabel}/${fromId} -> ${toLabel}/${toId})`);
  }
  return result.records[0].get('r').properties;
}

export async function getRelationships(
  session: Session,
  label: NodeLabel,
  id: string,
  relType?: RelationType
): Promise<{ type: string; properties: Record<string, any>; targetId: string; targetLabel: string }[]> {
  sanitizeLabel(label);
  const relPattern = relType ? `[r:${sanitizeRelType(relType)}]` : '[r]';

  const result = await session.run(
    `MATCH (n:${label} {id: $id})-${relPattern}-(other)
     RETURN type(r) AS type, r, other, labels(other) AS labels`,
    { id }
  );

  return result.records.map((record) => ({
    type: record.get('type'),
    properties: record.get('r').properties,
    targetId: record.get('other').properties.id,
    targetLabel: record.get('labels')[0],
  }));
}

// ── GRAPH TRAVERSAL ──

export async function getNeighbors(
  session: Session,
  label: NodeLabel,
  id: string,
  depth: number = 1,
  relTypes?: RelationType[],
  targetLabels?: NodeLabel[]
): Promise<{ node: NodeProperties; label: string }[]> {
  sanitizeLabel(label);
  const maxDepth = Math.min(depth, 3);

  let relPattern = '*1..';
  if (relTypes && relTypes.length > 0) {
    relTypes.forEach((r) => sanitizeRelType(r));
    relPattern = `:${relTypes.join('|')}*1..`;
  }

  let whereClause = 'WHERE other <> n';
  if (targetLabels && targetLabels.length > 0) {
    targetLabels.forEach((l) => sanitizeLabel(l));
    const labelChecks = targetLabels.map((l) => `other:${l}`).join(' OR ');
    whereClause += ` AND (${labelChecks})`;
  }

  const result = await session.run(
    `MATCH (n:${label} {id: $id})-[${relPattern}${maxDepth}]-(other)
     ${whereClause}
     RETURN DISTINCT other, labels(other) AS labels`,
    { id }
  );

  return result.records.map((record) => ({
    node: record.get('other').properties,
    label: record.get('labels')[0],
  }));
}

export async function findPath(
  session: Session,
  fromLabel: NodeLabel,
  fromId: string,
  toLabel: NodeLabel,
  toId: string,
  maxDepth: number = 4
): Promise<{ nodes: string[]; relationships: string[] }[]> {
  sanitizeLabel(fromLabel);
  sanitizeLabel(toLabel);

  const result = await session.run(
    `MATCH path = shortestPath(
       (a:${fromLabel} {id: $fromId})-[*..${Math.min(maxDepth, 6)}]-(b:${toLabel} {id: $toId})
     )
     RETURN [node IN nodes(path) | node.id] AS nodeIds,
            [rel IN relationships(path) | type(rel)] AS relTypes
     LIMIT 5`,
    { fromId, toId }
  );

  return result.records.map((record) => ({
    nodes: record.get('nodeIds'),
    relationships: record.get('relTypes'),
  }));
}

// ── CULTURAL QUERIES ──

export async function findSimilarNodes(
  session: Session,
  label: NodeLabel,
  id: string,
  dimension: 'color' | 'aesthetic' | 'sonic' | 'geographic' | 'overall',
  limit: number = 10
): Promise<ScoredNode[]> {
  sanitizeLabel(label);

  // Build scoring based on dimension
  let scoreExpression: string;
  switch (dimension) {
    case 'color':
      scoreExpression = `
        CASE WHEN n.color_temperature IS NOT NULL AND other.color_temperature IS NOT NULL
        THEN 1.0 - abs(n.color_temperature - other.color_temperature) / 2.0
        ELSE 0.5 END`;
      break;
    case 'aesthetic':
      scoreExpression = `
        CASE WHEN size(apoc.coll.intersection(n.aesthetic_tags, other.aesthetic_tags)) > 0
        THEN toFloat(size(apoc.coll.intersection(n.aesthetic_tags, other.aesthetic_tags))) /
             toFloat(size(apoc.coll.union(n.aesthetic_tags, other.aesthetic_tags)))
        ELSE 0.0 END`;
      break;
    case 'sonic':
      scoreExpression = `
        CASE WHEN n.sonic_energy IS NOT NULL AND other.sonic_energy IS NOT NULL
        THEN 1.0 - (abs(n.sonic_energy - other.sonic_energy) + abs(coalesce(n.sonic_valence,0.5) - coalesce(other.sonic_valence,0.5))) / 2.0
        ELSE 0.0 END`;
      break;
    case 'geographic':
      scoreExpression = `
        CASE WHEN n.origin_city = other.origin_city OR n.current_city = other.current_city
        THEN 0.8
        ELSE 0.2 END`;
      break;
    default: // overall
      scoreExpression = `
        CASE WHEN n.energy IS NOT NULL AND other.energy IS NOT NULL
        THEN 1.0 - abs(n.energy - other.energy)
        ELSE 0.5 END`;
  }

  const result = await session.run(
    `MATCH (n:${label} {id: $id})
     MATCH (other)
     WHERE other <> n AND other.id IS NOT NULL
     WITH n, other, labels(other)[0] AS lbl,
          ${scoreExpression} AS score
     WHERE score > 0
     RETURN other, lbl, score
     ORDER BY score DESC
     LIMIT $limit`,
    { id, limit: Math.round(limit) }
  );

  return result.records.map((record) => ({
    node: record.get('other').properties,
    label: record.get('lbl') as NodeLabel,
    score: record.get('score'),
  }));
}

export async function findCulturalTerritory(
  session: Session,
  anchors: { id: string; weight: number }[],
  radius: number = 2
): Promise<{ nodes: { node: NodeProperties; label: string }[]; edges: { from: string; to: string; type: string }[] }> {
  const anchorIds = anchors.map((a) => a.id);
  const maxRadius = Math.min(radius, 3);

  const result = await session.run(
    `UNWIND $anchorIds AS aid
     MATCH (anchor {id: aid})-[*1..${maxRadius}]-(connected)
     WHERE connected.id IS NOT NULL
     WITH DISTINCT connected, labels(connected)[0] AS lbl
     RETURN connected, lbl`,
    { anchorIds }
  );

  const nodes = result.records.map((record) => ({
    node: record.get('connected').properties,
    label: record.get('lbl'),
  }));

  // Get edges between found nodes
  const nodeIds = nodes.map((n) => n.node.id);
  const edgeResult = await session.run(
    `MATCH (a)-[r]-(b)
     WHERE a.id IN $nodeIds AND b.id IN $nodeIds AND a.id < b.id
     RETURN a.id AS from, b.id AS to, type(r) AS type`,
    { nodeIds }
  );

  const edges = edgeResult.records.map((record) => ({
    from: record.get('from'),
    to: record.get('to'),
    type: record.get('type'),
  }));

  return { nodes, edges };
}

export async function findTalentForDirection(
  session: Session,
  direction: CreativeDirection,
  talentTypes: ('Photographer' | 'Director' | 'Stylist')[],
  limit: number = 10
): Promise<ScoredNode[]> {
  const labels = talentTypes.map((t) => sanitizeLabel(t));
  const labelFilter = labels.map((l) => `n:${l}`).join(' OR ');
  const tags = direction.aesthetic_tags.map((t) => t.tag);
  const moods = direction.mood_tags.map((t) => t.tag);

  const result = await session.run(
    `MATCH (n)
     WHERE (${labelFilter}) AND n.id IS NOT NULL
     WITH n, labels(n)[0] AS lbl,
       CASE WHEN n.aesthetic_tags IS NOT NULL
         THEN toFloat(size([t IN n.aesthetic_tags WHERE t IN $tags])) / toFloat(size($tags) + 1)
         ELSE 0.0 END +
       CASE WHEN n.mood_tags IS NOT NULL
         THEN toFloat(size([t IN n.mood_tags WHERE t IN $moods])) / toFloat(size($moods) + 1)
         ELSE 0.0 END +
       CASE WHEN n.energy IS NOT NULL
         THEN 1.0 - abs(n.energy - $energy)
         ELSE 0.0 END
       AS score
     WHERE score > 0
     RETURN n, lbl, score / 3.0 AS normalizedScore
     ORDER BY normalizedScore DESC
     LIMIT $limit`,
    { tags, moods, energy: direction.energy, limit: Math.round(limit) }
  );

  return result.records.map((record) => ({
    node: record.get('n').properties,
    label: record.get('lbl') as NodeLabel,
    score: record.get('normalizedScore'),
  }));
}

// ── ANALYTICS ──

export async function getNodeCentrality(
  session: Session,
  label: NodeLabel,
  id: string
): Promise<number> {
  sanitizeLabel(label);
  const result = await session.run(
    `MATCH (n:${label} {id: $id})-[r]-()
     RETURN count(r) AS degree`,
    { id }
  );
  if (result.records.length === 0) return 0;
  const degree = result.records[0].get('degree').toNumber();

  // Normalize: get max degree in graph
  const maxResult = await session.run(
    `MATCH (n)-[r]-() RETURN max(count(r)) AS maxDeg`
  );
  const maxDeg = maxResult.records[0]?.get('maxDeg')?.toNumber() || 1;

  return degree / maxDeg;
}

export async function getClusterMembers(
  session: Session,
  dimension: 'color' | 'aesthetic' | 'geographic',
  clusterId: string
): Promise<NodeProperties[]> {
  // Simple cluster: find nodes sharing a key attribute
  let matchClause: string;
  switch (dimension) {
    case 'color':
      matchClause = `MATCH (n) WHERE $clusterId IN coalesce(n.color_palette, [])`;
      break;
    case 'aesthetic':
      matchClause = `MATCH (n) WHERE $clusterId IN coalesce(n.aesthetic_tags, [])`;
      break;
    case 'geographic':
      matchClause = `MATCH (n) WHERE n.origin_city = $clusterId OR n.current_city = $clusterId`;
      break;
    default:
      throw new Error(`Invalid dimension: ${dimension}`);
  }

  const result = await session.run(
    `${matchClause} RETURN n`,
    { clusterId }
  );

  return result.records.map((record) => record.get('n').properties);
}
