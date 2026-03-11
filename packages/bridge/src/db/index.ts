import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export * from './schema';

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function initBridgeDatabase(connectionString: string) {
  const pool = new Pool({ connectionString });
  db = drizzle(pool, { schema });
  return db;
}

export function getBridgeDb() {
  if (!db) {
    throw new Error('Bridge database not initialized. Call initBridgeDatabase first.');
  }
  return db;
}
