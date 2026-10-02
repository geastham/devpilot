import { bE as schema, D as Database } from '../index-CdxAc_j3.mjs';
export { A as ActivityEvent, C as CompletedTask, a as ConductorScore, b as ConflictingFile, c as DatabaseConfig, d as DependencyEdge, H as HorizonItem, I as InFlightFile, N as NewActivityEvent, e as NewCompletedTask, f as NewConductorScore, g as NewConflictingFile, h as NewDependencyEdge, i as NewHorizonItem, j as NewInFlightFile, k as NewPlan, l as NewPlannerReview, m as NewPlannerTrace, n as NewRufloSession, o as NewRunwaySampleRow, p as NewScoreHistory, q as NewScoreReading, r as NewTask, s as NewTouchedFile, t as NewWave, u as NewWavePlan, v as NewWavePlanMetric, w as NewWaveTask, x as NewWorkstream, P as Plan, y as PlannerReview, z as PlannerTrace, R as RufloSession, B as RunwaySampleRow, S as SQLiteDatabase, E as ScoreHistory, F as ScoreReading, T as Task, G as TouchedFile, W as Wave, J as WavePlan, K as WavePlanMetric, L as WaveTask, M as Workstream, O as activityEvents, Q as closeDatabase, U as completedTasks, V as completedTasksRelations, X as conductorScores, Y as conductorScoresRelations, Z as conflictingFiles, _ as conflictingFilesRelations, $ as createDatabase, a0 as databaseConfigSchema, a1 as dependencyEdges, a2 as dependencyEdgesRelations, a3 as getDatabaseConfig, a4 as horizonItems, a5 as horizonItemsRelations, a6 as inFlightFiles, a7 as inFlightFilesRelations, a8 as palaceClosets, a9 as palaceClosetsRelations, aa as palaceDiary, ab as palaceDrawers, ac as palaceDrawersRelations, ad as palaceHalls, ae as palaceKgTriples, af as palaceRooms, ag as palaceRoomsRelations, ah as palaceTunnels, ai as palaceWings, aj as palaceWingsRelations, ak as plannerReviews, al as plannerTraces, am as plans, an as plansRelations, ao as rufloSessions, ap as rufloSessionsRelations, aq as runwaySamples, ar as scoreHistory, as as scoreHistoryRelations, at as scoreReadings, au as tasks, av as tasksRelations, aw as touchedFiles, ax as touchedFilesRelations, ay as wavePlanMetrics, az as wavePlanMetricsRelations, aA as wavePlans, aB as wavePlansRelations, aC as waveTasks, aD as waveTasksRelations, aE as waves, aF as wavesRelations, aG as wikiArticles, aH as wikiArticlesRelations, aI as wikiLog, aJ as wikiLogRelations, aK as wikiSources, aL as wikiSourcesRelations, aM as workstreams, aN as workstreamsRelations } from '../index-CdxAc_j3.mjs';
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
