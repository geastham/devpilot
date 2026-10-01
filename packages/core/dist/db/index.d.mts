import { by as schema, D as Database } from '../index-BZVV_zBJ.mjs';
export { A as ActivityEvent, C as CompletedTask, a as ConductorScore, b as ConflictingFile, c as DatabaseConfig, d as DependencyEdge, H as HorizonItem, I as InFlightFile, N as NewActivityEvent, e as NewCompletedTask, f as NewConductorScore, g as NewConflictingFile, h as NewDependencyEdge, i as NewHorizonItem, j as NewInFlightFile, k as NewPlan, l as NewRufloSession, m as NewRunwaySampleRow, n as NewScoreHistory, o as NewScoreReading, p as NewTask, q as NewTouchedFile, r as NewWave, s as NewWavePlan, t as NewWavePlanMetric, u as NewWaveTask, v as NewWorkstream, P as Plan, R as RufloSession, w as RunwaySampleRow, S as SQLiteDatabase, x as ScoreHistory, y as ScoreReading, T as Task, z as TouchedFile, W as Wave, B as WavePlan, E as WavePlanMetric, F as WaveTask, G as Workstream, J as activityEvents, K as closeDatabase, L as completedTasks, M as completedTasksRelations, O as conductorScores, Q as conductorScoresRelations, U as conflictingFiles, V as conflictingFilesRelations, X as createDatabase, Y as databaseConfigSchema, Z as dependencyEdges, _ as dependencyEdgesRelations, $ as getDatabaseConfig, a0 as horizonItems, a1 as horizonItemsRelations, a2 as inFlightFiles, a3 as inFlightFilesRelations, a4 as palaceClosets, a5 as palaceClosetsRelations, a6 as palaceDiary, a7 as palaceDrawers, a8 as palaceDrawersRelations, a9 as palaceHalls, aa as palaceKgTriples, ab as palaceRooms, ac as palaceRoomsRelations, ad as palaceTunnels, ae as palaceWings, af as palaceWingsRelations, ag as plans, ah as plansRelations, ai as rufloSessions, aj as rufloSessionsRelations, ak as runwaySamples, al as scoreHistory, am as scoreHistoryRelations, an as scoreReadings, ao as tasks, ap as tasksRelations, aq as touchedFiles, ar as touchedFilesRelations, as as wavePlanMetrics, at as wavePlanMetricsRelations, au as wavePlans, av as wavePlansRelations, aw as waveTasks, ax as waveTasksRelations, ay as waves, az as wavesRelations, aA as wikiArticles, aB as wikiArticlesRelations, aC as wikiLog, aD as wikiLogRelations, aE as wikiSources, aF as wikiSourcesRelations, aG as workstreams, aH as workstreamsRelations } from '../index-BZVV_zBJ.mjs';
export { C as Complexity, D as DependencyEdgeType, E as EventType, F as FileStatus, M as Model, O as OrchestratorMode, S as SessionStatus, b as WavePlanStatus, c as WaveStatus, d as WaveTaskStatus, W as WikiArticleStatus, e as WikiLogAction, a as WikiSourceType, Z as Zone, f as complexityValues, g as dependencyEdgeTypeValues, h as eventTypeValues, i as fileStatusValues, m as modelValues, o as orchestratorModeValues, s as sessionStatusValues, w as wavePlanStatusValues, j as waveStatusValues, k as waveTaskStatusValues, l as wikiArticleStatusValues, n as wikiLogActionValues, p as wikiSourceTypeValues, z as zoneValues } from '../enums-CbVZMWqb.mjs';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import 'zod';
import 'drizzle-orm/better-sqlite3';
import 'drizzle-orm';
import 'drizzle-orm/sqlite-core';
import '../types-CbuwQ_x5.mjs';

type PostgresDatabase = PostgresJsDatabase<typeof schema>;

/**
 * Get the database instance.
 * Creates a new connection if one doesn't exist.
 */
declare function getDatabase(): Database;
/**
 * Initialize the database with a specific configuration.
 * Useful for testing or explicit setup.
 */
declare function initDatabase(config?: {
    type?: 'sqlite' | 'postgres';
    sqlitePath?: string;
    postgresUrl?: string;
}): Database;
/**
 * Reset the database instance.
 * Used for testing or cleanup.
 */
declare function resetDatabase(): void;

export { Database, type PostgresDatabase, getDatabase, initDatabase, resetDatabase };
