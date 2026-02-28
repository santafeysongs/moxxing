import { getDriver, closeConnection } from './connection';

const CONSTRAINTS = [
  'CREATE CONSTRAINT artist_id IF NOT EXISTS FOR (n:Artist) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT photographer_id IF NOT EXISTS FOR (n:Photographer) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT director_id IF NOT EXISTS FOR (n:Director) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT stylist_id IF NOT EXISTS FOR (n:Stylist) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT designer_id IF NOT EXISTS FOR (n:Designer) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT brand_id IF NOT EXISTS FOR (n:Brand) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT city_id IF NOT EXISTS FOR (n:City) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT scene_id IF NOT EXISTS FOR (n:Scene) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT aesthetic_id IF NOT EXISTS FOR (n:Aesthetic) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT genre_id IF NOT EXISTS FOR (n:Genre) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT project_id IF NOT EXISTS FOR (n:Project) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT technique_id IF NOT EXISTS FOR (n:Technique) REQUIRE n.id IS UNIQUE',
  'CREATE CONSTRAINT influencer_id IF NOT EXISTS FOR (n:Influencer) REQUIRE n.id IS UNIQUE',
];

const INDEXES = [
  `CREATE FULLTEXT INDEX node_name_search IF NOT EXISTS
   FOR (n:Artist|Photographer|Director|Stylist|Designer|Brand|City|Scene|Aesthetic|Genre|Project|Technique|Influencer)
   ON EACH [n.name]`,
];

export async function initializeSchema(): Promise<void> {
  const driver = getDriver();
  const session = driver.session();

  try {
    console.log('Creating constraints...');
    for (const constraint of CONSTRAINTS) {
      await session.run(constraint);
      const name = constraint.match(/CONSTRAINT (\S+)/)?.[1];
      console.log(`  ✓ ${name}`);
    }

    console.log('Creating indexes...');
    for (const index of INDEXES) {
      await session.run(index);
      const name = index.match(/INDEX (\S+)/)?.[1];
      console.log(`  ✓ ${name}`);
    }

    // Verify
    const constraintResult = await session.run('SHOW CONSTRAINTS');
    console.log(`\nVerification: ${constraintResult.records.length} constraints found`);

    const indexResult = await session.run('SHOW INDEXES');
    console.log(`Verification: ${indexResult.records.length} indexes found`);

    console.log('\n✅ Schema initialization complete');
  } catch (error) {
    console.error('Schema initialization failed:', error);
    throw error;
  } finally {
    await session.close();
  }
}

// Run directly: npx tsx packages/graph-db/src/schema.ts
if (require.main === module) {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

  initializeSchema()
    .then(() => closeConnection())
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
