/**
 * CLI tool to ingest entities into the Cultural Graph.
 *
 * Usage:
 *   npx tsx scripts/ingest.ts "Billie Eilish"
 *   npx tsx scripts/ingest.ts "Billie Eilish" --label Artist
 *   npx tsx scripts/ingest.ts "Billie Eilish" --depth 2
 *   npx tsx scripts/ingest.ts "Billie Eilish" "Bad Bunny" "Virgil Abloh"
 *   npx tsx scripts/ingest.ts --file data/seed/ingest-list.txt
 */

import * as path from 'path';
import * as fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { ingestEntity, ingestMultiple } from '@cultural-graph/analysis-engine/src/entity-ingestion';
import { closeConnection } from '@cultural-graph/graph-db/src/connection';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Cultural Graph — Entity Ingestion

Usage:
  npx tsx scripts/ingest.ts "Artist Name"
  npx tsx scripts/ingest.ts "Name" --label Artist|Photographer|Director|Stylist|Brand|...
  npx tsx scripts/ingest.ts "Name" --depth 2          (also ingest connected entities)
  npx tsx scripts/ingest.ts "Name1" "Name2" "Name3"   (batch)
  npx tsx scripts/ingest.ts --file list.txt            (one name per line)
    `);
    process.exit(0);
  }

  let label: string | undefined;
  let depth = 1;
  let names: string[] = [];
  let filePath: string | undefined;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--label' && args[i + 1]) {
      label = args[++i];
    } else if (args[i] === '--depth' && args[i + 1]) {
      depth = parseInt(args[++i]) || 1;
    } else if (args[i] === '--file' && args[i + 1]) {
      filePath = args[++i];
    } else if (!args[i].startsWith('--')) {
      names.push(args[i]);
    }
  }

  // Read from file if specified
  if (filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileNames = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    names.push(...fileNames);
  }

  if (names.length === 0) {
    console.error('No entity names provided');
    process.exit(1);
  }

  console.log(`\n🌐 Cultural Graph — Ingesting ${names.length} entit${names.length === 1 ? 'y' : 'ies'}\n`);

  if (names.length === 1) {
    const result = await ingestEntity(names[0], label, { depth });
    console.log(`\nResult: ${result.nodesCreated} nodes, ${result.relationshipsCreated} relationships`);
    if (result.errors.length) {
      console.log(`Errors: ${result.errors.join(', ')}`);
    }
  } else {
    const entities = names.map(name => ({ name, label }));
    const result = await ingestMultiple(entities, { depth });
    console.log(`\nTotal: ${result.total_nodes} nodes, ${result.total_relationships} relationships`);
  }

  await closeConnection();
  process.exit(0);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
