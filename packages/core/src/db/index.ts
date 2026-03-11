// Main database exports
export { getDatabase, initDatabase, resetDatabase } from './client';
export { getDatabaseConfig, databaseConfigSchema } from './config';
export type { DatabaseConfig } from './config';
export { createDatabase, closeDatabase } from './adapters';
export type { Database, SQLiteDatabase, PostgresDatabase } from './adapters';

// Schema exports
export * from './schema';
