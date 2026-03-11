import { getDatabaseConfig } from './config';
import { createDatabase, Database } from './adapters';

// Global database instance
let db: Database | null = null;

/**
 * Get the database instance.
 * Creates a new connection if one doesn't exist.
 */
export function getDatabase(): Database {
  if (!db) {
    const config = getDatabaseConfig();
    db = createDatabase(config);
  }
  return db;
}

/**
 * Initialize the database with a specific configuration.
 * Useful for testing or explicit setup.
 */
export function initDatabase(config?: {
  type?: 'sqlite' | 'postgres';
  sqlitePath?: string;
  postgresUrl?: string;
}): Database {
  const baseConfig = getDatabaseConfig();
  const mergedConfig = { ...baseConfig, ...config };
  db = createDatabase(mergedConfig);
  return db;
}

/**
 * Reset the database instance.
 * Used for testing or cleanup.
 */
export function resetDatabase(): void {
  db = null;
}

// Default export for convenience
export { db };
