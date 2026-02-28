import * as path from 'path';
import * as fs from 'fs';
import dotenv from 'dotenv';
import neo4j from 'neo4j-driver';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
const user = process.env.NEO4J_USER || 'neo4j';
const password = process.env.NEO4J_PASSWORD || '';

const VALID_LABELS = [
  'Artist', 'Photographer', 'Director', 'Stylist', 'Designer',
  'Brand', 'City', 'Scene', 'Aesthetic', 'Genre', 'Project', 'Technique',
];

const VALID_REL_TYPES = [
  'COLLABORATED_WITH', 'SHOT_BY', 'DIRECTED_BY', 'STYLED_BY',
  'BRAND_AFFILIATION', 'AESTHETIC_AFFINITY', 'GEOGRAPHIC_ANCHOR',
  'PART_OF_SCENE', 'GENRE_AFFINITY', 'USES_TECHNIQUE',
  'COLOR_SIMILARITY', 'SONIC_PROXIMITY', 'CULTURAL_BRIDGE',
];

async function main() {
  const clean = process.argv.includes('--clean');

  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  const session = driver.session();

  try {
    if (clean) {
      console.log('🧹 Cleaning database...');
      await session.run('MATCH (n) DETACH DELETE n');
      console.log('  Done.');
    }

    // Load data
    const nodesPath = path.resolve(__dirname, '../data/seed/nodes.json');
    const relsPath = path.resolve(__dirname, '../data/seed/relationships.json');
    const nodes = JSON.parse(fs.readFileSync(nodesPath, 'utf-8'));
    const rels = JSON.parse(fs.readFileSync(relsPath, 'utf-8'));

    // Import nodes
    let created = 0;
    let skipped = 0;
    console.log(`\nImporting ${nodes.length} nodes...`);

    for (const node of nodes) {
      const label = node.label;
      if (!VALID_LABELS.includes(label)) {
        console.error(`  ✗ Invalid label: ${label} for ${node.id}`);
        continue;
      }

      // Check if exists
      const existing = await session.run(
        `MATCH (n:${label} {id: $id}) RETURN n LIMIT 1`,
        { id: node.id }
      );

      if (existing.records.length > 0 && !clean) {
        skipped++;
        continue;
      }

      const { label: _label, ...props } = node;
      props.created_at = new Date().toISOString();
      props.updated_at = new Date().toISOString();

      await session.run(
        `MERGE (n:${label} {id: $id}) SET n += $props`,
        { id: node.id, props }
      );
      created++;
      console.log(`  ✓ ${label}: ${node.name}`);
    }

    console.log(`\nNodes: ${created} created, ${skipped} skipped`);

    // Import relationships
    let relCreated = 0;
    let relErrors = 0;
    console.log(`\nImporting ${rels.length} relationships...`);

    for (const rel of rels) {
      if (!VALID_LABELS.includes(rel.from.label) || !VALID_LABELS.includes(rel.to.label)) {
        console.error(`  ✗ Invalid label in relationship`);
        relErrors++;
        continue;
      }
      if (!VALID_REL_TYPES.includes(rel.type)) {
        console.error(`  ✗ Invalid relationship type: ${rel.type}`);
        relErrors++;
        continue;
      }

      const props = {
        ...rel.properties,
        created_at: new Date().toISOString(),
      };

      try {
        await session.run(
          `MATCH (a:${rel.from.label} {id: $fromId})
           MATCH (b:${rel.to.label} {id: $toId})
           MERGE (a)-[r:${rel.type}]->(b)
           SET r += $props`,
          { fromId: rel.from.id, toId: rel.to.id, props }
        );
        relCreated++;
      } catch (e: any) {
        console.error(`  ✗ ${rel.from.id} -[${rel.type}]-> ${rel.to.id}: ${e.message}`);
        relErrors++;
      }
    }

    console.log(`\nRelationships: ${relCreated} created, ${relErrors} errors`);

    // Verify
    const nodeCount = await session.run('MATCH (n) RETURN count(n) AS count');
    const relCount = await session.run('MATCH ()-[r]->() RETURN count(r) AS count');
    console.log(`\n📊 Database totals:`);
    console.log(`  Nodes: ${nodeCount.records[0].get('count').toNumber()}`);
    console.log(`  Relationships: ${relCount.records[0].get('count').toNumber()}`);
    console.log('\n✅ Import complete');

  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((e) => {
  console.error('Import failed:', e);
  process.exit(1);
});
