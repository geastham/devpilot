import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../schema';

export type PostgresDatabase = PostgresJsDatabase<typeof schema>;

let pgDb: PostgresDatabase | null = null;
let pgConnection: ReturnType<typeof postgres> | null = null;

export function createPostgresAdapter(connectionString: string): PostgresDatabase {
  if (pgDb) {
    return pgDb;
  }

  // Create Postgres connection
  pgConnection = postgres(connectionString, {
    max: 10, // Connection pool size
    idle_timeout: 20,
    connect_timeout: 10,
  });

  // Create Drizzle instance
  pgDb = drizzle(pgConnection, { schema });

  return pgDb;
}

export async function closePostgresConnection(): Promise<void> {
  if (pgConnection) {
    await pgConnection.end();
    pgConnection = null;
    pgDb = null;
  }
}

export function getPostgresConnection(): ReturnType<typeof postgres> | null {
  return pgConnection;
}
