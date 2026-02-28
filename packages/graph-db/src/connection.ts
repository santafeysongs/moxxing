import neo4j, { Driver } from 'neo4j-driver';

let driver: Driver | null = null;

export function getDriver(): Driver {
  if (!driver) {
    const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const user = process.env.NEO4J_USER || 'neo4j';
    const password = process.env.NEO4J_PASSWORD || '';

    driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  }
  return driver;
}

export async function closeConnection(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

export async function verifyConnection(): Promise<boolean> {
  try {
    const d = getDriver();
    await d.verifyConnectivity();
    return true;
  } catch (error) {
    console.error('Neo4j connection failed:', error);
    return false;
  }
}
