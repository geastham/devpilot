import { z } from 'zod';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { C as Complexity, D as DependencyEdgeType, E as EventType, F as FileStatus, M as Model, O as OrchestratorMode, S as SessionStatus, b as WavePlanStatus, c as WaveStatus, d as WaveTaskStatus, W as WikiArticleStatus, e as WikiLogAction, a as WikiSourceType, Z as Zone, f as complexityValues, g as dependencyEdgeTypeValues, h as eventTypeValues, i as fileStatusValues, m as modelValues, o as orchestratorModeValues, s as sessionStatusValues, w as wavePlanStatusValues, j as waveStatusValues, k as waveTaskStatusValues, l as wikiArticleStatusValues, n as wikiLogActionValues, p as wikiSourceTypeValues, z as zoneValues } from '../enums-CbVZMWqb.js';
import * as drizzle_orm from 'drizzle-orm';
import * as drizzle_orm_sqlite_core from 'drizzle-orm/sqlite-core';
import { D as DependencyEdge, N as NewDependencyEdge, a as NewWave, b as NewWavePlan, c as NewWavePlanMetric, d as NewWaveTask, W as Wave, e as WavePlan, f as WavePlanMetric, g as WaveTask, h as dependencyEdges, i as dependencyEdgesRelations, w as wavePlanMetrics, j as wavePlanMetricsRelations, k as wavePlans, l as wavePlansRelations, m as waveTasks, n as waveTasksRelations, o as waves, p as wavesRelations } from '../wave-planner-BYl3JIm1.js';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

declare const databaseConfigSchema: z.ZodObject<{
    type: z.ZodDefault<z.ZodEnum<["sqlite", "postgres"]>>;
    sqlitePath: z.ZodOptional<z.ZodString>;
    postgresUrl: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "sqlite" | "postgres";
    sqlitePath?: string | undefined;
    postgresUrl?: string | undefined;
}, {
    type?: "sqlite" | "postgres" | undefined;
    sqlitePath?: string | undefined;
    postgresUrl?: string | undefined;
}>;
type DatabaseConfig = z.infer<typeof databaseConfigSchema>;
declare function getDatabaseConfig(): DatabaseConfig;

declare const horizonItems: drizzle_orm_sqlite_core.SQLiteTableWithColumns<{
    name: "horizon_items";
    schema: undefined;
    columns: {
        id: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "id";
            tableName: "horizon_items";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        title: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "title";
            tableName: "horizon_items";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        zone: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "zone";
            tableName: "horizon_items";
            dataType: "string";
            columnType: "SQLiteText";
            data: "READY" | "REFINING" | "SHAPING" | "DIRECTIONAL";
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: ["READY", "REFINING", "SHAPING", "DIRECTIONAL"];
            baseColumn: never;
        }, object>;
        repo: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "repo";
            tableName: "horizon_items";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        complexity: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "complexity";
            tableName: "horizon_items";
            dataType: "string";
            columnType: "SQLiteText";
            data: "S" | "M" | "L" | "XL";
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: ["S", "M", "L", "XL"];
            baseColumn: never;
        }, object>;
        priority: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "priority";
            tableName: "horizon_items";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        linearTicketId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "linear_ticket_id";
            tableName: "horizon_items";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        createdAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "created_at";
            tableName: "horizon_items";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        updatedAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "updated_at";
            tableName: "horizon_items";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
    };
    dialect: "sqlite";
}>;
declare const horizonItemsRelations: drizzle_orm.Relations<"horizon_items", {
    plan: drizzle_orm.One<"plans", true>;
    conflictingFiles: drizzle_orm.Many<"in_flight_files">;
}>;
declare const plans: drizzle_orm_sqlite_core.SQLiteTableWithColumns<{
    name: "plans";
    schema: undefined;
    columns: {
        id: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "id";
            tableName: "plans";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        version: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "version";
            tableName: "plans";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        horizonItemId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "horizon_item_id";
            tableName: "plans";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        estimatedCostUsd: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "estimated_cost_usd";
            tableName: "plans";
            dataType: "number";
            columnType: "SQLiteReal";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        baselineCostUsd: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "baseline_cost_usd";
            tableName: "plans";
            dataType: "number";
            columnType: "SQLiteReal";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        acceptanceCriteria: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "acceptance_criteria";
            tableName: "plans";
            dataType: "json";
            columnType: "SQLiteTextJson";
            data: string[];
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        confidenceSignals: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "confidence_signals";
            tableName: "plans";
            dataType: "json";
            columnType: "SQLiteTextJson";
            data: {
                parallelization?: string;
                conflictRisk?: string;
                complexityCalibration?: string;
                costEstimateAccuracy?: string;
                hasMemory?: boolean;
                recentlyModifiedFiles?: number;
                similarTasksCompleted?: number;
                overallConfidence?: number;
            };
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        fleetContextSnapshot: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "fleet_context_snapshot";
            tableName: "plans";
            dataType: "json";
            columnType: "SQLiteTextJson";
            data: {
                activeSessions?: number;
                availableWorkers?: Record<string, number>;
                avoidedFiles?: string[];
                deferredReason?: string | null;
                inFlightFiles?: {
                    path: string;
                    sessionId: string;
                    eta: number;
                }[];
                timestamp?: string;
            };
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        memorySessionsUsed: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "memory_sessions_used";
            tableName: "plans";
            dataType: "json";
            columnType: "SQLiteTextJson";
            data: {
                date: string;
                ticketId: string;
                summary: string;
                constraintApplied: string;
            }[];
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        previousPlanId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "previous_plan_id";
            tableName: "plans";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        generatedAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "generated_at";
            tableName: "plans";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
    };
    dialect: "sqlite";
}>;
declare const plansRelations: drizzle_orm.Relations<"plans", {
    horizonItem: drizzle_orm.One<"horizon_items", true>;
    workstreams: drizzle_orm.Many<"workstreams">;
    sequentialTasks: drizzle_orm.Many<"tasks">;
    filesTouched: drizzle_orm.Many<"touched_files">;
    previousPlan: drizzle_orm.One<"plans", false>;
}>;
declare const workstreams: drizzle_orm_sqlite_core.SQLiteTableWithColumns<{
    name: "workstreams";
    schema: undefined;
    columns: {
        id: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "id";
            tableName: "workstreams";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        planId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "plan_id";
            tableName: "workstreams";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        label: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "label";
            tableName: "workstreams";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        repo: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "repo";
            tableName: "workstreams";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        workerCount: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "worker_count";
            tableName: "workstreams";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        orderIndex: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "order_index";
            tableName: "workstreams";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
    };
    dialect: "sqlite";
}>;
declare const workstreamsRelations: drizzle_orm.Relations<"workstreams", {
    plan: drizzle_orm.One<"plans", true>;
    tasks: drizzle_orm.Many<"tasks">;
}>;
declare const tasks: drizzle_orm_sqlite_core.SQLiteTableWithColumns<{
    name: "tasks";
    schema: undefined;
    columns: {
        id: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "id";
            tableName: "tasks";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        label: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "label";
            tableName: "tasks";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        model: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "model";
            tableName: "tasks";
            dataType: "string";
            columnType: "SQLiteText";
            data: "HAIKU" | "SONNET" | "OPUS";
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: ["HAIKU", "SONNET", "OPUS"];
            baseColumn: never;
        }, object>;
        modelOverride: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "model_override";
            tableName: "tasks";
            dataType: "string";
            columnType: "SQLiteText";
            data: "HAIKU" | "SONNET" | "OPUS";
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: ["HAIKU", "SONNET", "OPUS"];
            baseColumn: never;
        }, object>;
        complexity: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "complexity";
            tableName: "tasks";
            dataType: "string";
            columnType: "SQLiteText";
            data: "S" | "M" | "L" | "XL";
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: ["S", "M", "L", "XL"];
            baseColumn: never;
        }, object>;
        estimatedCostUsd: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "estimated_cost_usd";
            tableName: "tasks";
            dataType: "number";
            columnType: "SQLiteReal";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        filePaths: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "file_paths";
            tableName: "tasks";
            dataType: "json";
            columnType: "SQLiteTextJson";
            data: string[];
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        conflictWarning: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "conflict_warning";
            tableName: "tasks";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        dependsOn: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "depends_on";
            tableName: "tasks";
            dataType: "json";
            columnType: "SQLiteTextJson";
            data: string[];
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        orderIndex: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "order_index";
            tableName: "tasks";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        workstreamId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "workstream_id";
            tableName: "tasks";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        planId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "plan_id";
            tableName: "tasks";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
    };
    dialect: "sqlite";
}>;
declare const tasksRelations: drizzle_orm.Relations<"tasks", {
    workstream: drizzle_orm.One<"workstreams", false>;
    plan: drizzle_orm.One<"plans", false>;
}>;
declare const touchedFiles: drizzle_orm_sqlite_core.SQLiteTableWithColumns<{
    name: "touched_files";
    schema: undefined;
    columns: {
        id: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "id";
            tableName: "touched_files";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        planId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "plan_id";
            tableName: "touched_files";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        path: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "path";
            tableName: "touched_files";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        status: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "status";
            tableName: "touched_files";
            dataType: "string";
            columnType: "SQLiteText";
            data: "AVAILABLE" | "IN_FLIGHT" | "RECENTLY_MODIFIED";
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: ["AVAILABLE", "IN_FLIGHT", "RECENTLY_MODIFIED"];
            baseColumn: never;
        }, object>;
        inFlightVia: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "in_flight_via";
            tableName: "touched_files";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
    };
    dialect: "sqlite";
}>;
declare const touchedFilesRelations: drizzle_orm.Relations<"touched_files", {
    plan: drizzle_orm.One<"plans", true>;
}>;
declare const inFlightFiles: drizzle_orm_sqlite_core.SQLiteTableWithColumns<{
    name: "in_flight_files";
    schema: undefined;
    columns: {
        id: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "id";
            tableName: "in_flight_files";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        path: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "path";
            tableName: "in_flight_files";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        activeSessionId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "active_session_id";
            tableName: "in_flight_files";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        linearTicketId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "linear_ticket_id";
            tableName: "in_flight_files";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        estimatedMinutesRemaining: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "estimated_minutes_remaining";
            tableName: "in_flight_files";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        horizonItemId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "horizon_item_id";
            tableName: "in_flight_files";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        lockedAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "locked_at";
            tableName: "in_flight_files";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
    };
    dialect: "sqlite";
}>;
declare const inFlightFilesRelations: drizzle_orm.Relations<"in_flight_files", {
    horizonItem: drizzle_orm.One<"horizon_items", false>;
}>;
declare const conflictingFiles: drizzle_orm_sqlite_core.SQLiteTableWithColumns<{
    name: "conflicting_files";
    schema: undefined;
    columns: {
        id: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "id";
            tableName: "conflicting_files";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        horizonItemId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "horizon_item_id";
            tableName: "conflicting_files";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        path: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "path";
            tableName: "conflicting_files";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        blockedBySessionId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "blocked_by_session_id";
            tableName: "conflicting_files";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        blockedByTicketId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "blocked_by_ticket_id";
            tableName: "conflicting_files";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        estimatedUnlockMinutes: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "estimated_unlock_minutes";
            tableName: "conflicting_files";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
    };
    dialect: "sqlite";
}>;
declare const conflictingFilesRelations: drizzle_orm.Relations<"conflicting_files", {
    horizonItem: drizzle_orm.One<"horizon_items", true>;
}>;
type HorizonItem = typeof horizonItems.$inferSelect;
type NewHorizonItem = typeof horizonItems.$inferInsert;
type Plan = typeof plans.$inferSelect;
type NewPlan = typeof plans.$inferInsert;
type Workstream = typeof workstreams.$inferSelect;
type NewWorkstream = typeof workstreams.$inferInsert;
type Task = typeof tasks.$inferSelect;
type NewTask = typeof tasks.$inferInsert;
type TouchedFile = typeof touchedFiles.$inferSelect;
type NewTouchedFile = typeof touchedFiles.$inferInsert;
type InFlightFile = typeof inFlightFiles.$inferSelect;
type NewInFlightFile = typeof inFlightFiles.$inferInsert;
type ConflictingFile = typeof conflictingFiles.$inferSelect;
type NewConflictingFile = typeof conflictingFiles.$inferInsert;

declare const rufloSessions: drizzle_orm_sqlite_core.SQLiteTableWithColumns<{
    name: "ruflo_sessions";
    schema: undefined;
    columns: {
        id: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "id";
            tableName: "ruflo_sessions";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        repo: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "repo";
            tableName: "ruflo_sessions";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        linearTicketId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "linear_ticket_id";
            tableName: "ruflo_sessions";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        ticketTitle: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "ticket_title";
            tableName: "ruflo_sessions";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        currentWorkstream: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "current_workstream";
            tableName: "ruflo_sessions";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        progressPercent: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "progress_percent";
            tableName: "ruflo_sessions";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        elapsedMinutes: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "elapsed_minutes";
            tableName: "ruflo_sessions";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        estimatedRemainingMinutes: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "estimated_remaining_minutes";
            tableName: "ruflo_sessions";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        status: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "status";
            tableName: "ruflo_sessions";
            dataType: "string";
            columnType: "SQLiteText";
            data: "ACTIVE" | "NEEDS_SPEC" | "COMPLETE" | "ERROR";
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: ["ACTIVE", "NEEDS_SPEC", "COMPLETE", "ERROR"];
            baseColumn: never;
        }, object>;
        inFlightFiles: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "in_flight_files";
            tableName: "ruflo_sessions";
            dataType: "json";
            columnType: "SQLiteTextJson";
            data: string[];
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        prUrl: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "pr_url";
            tableName: "ruflo_sessions";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        externalSessionId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "external_session_id";
            tableName: "ruflo_sessions";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        orchestratorMode: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "orchestrator_mode";
            tableName: "ruflo_sessions";
            dataType: "string";
            columnType: "SQLiteText";
            data: "claude-session" | "http" | "ao-cli" | "manual" | "disabled";
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: ["claude-session", "http", "ao-cli", "manual", "disabled"];
            baseColumn: never;
        }, object>;
        tokensUsed: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "tokens_used";
            tableName: "ruflo_sessions";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        costUsd: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "cost_usd";
            tableName: "ruflo_sessions";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        createdAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "created_at";
            tableName: "ruflo_sessions";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        updatedAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "updated_at";
            tableName: "ruflo_sessions";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
    };
    dialect: "sqlite";
}>;
declare const rufloSessionsRelations: drizzle_orm.Relations<"ruflo_sessions", {
    completedTasks: drizzle_orm.Many<"completed_tasks">;
}>;
declare const completedTasks: drizzle_orm_sqlite_core.SQLiteTableWithColumns<{
    name: "completed_tasks";
    schema: undefined;
    columns: {
        id: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "id";
            tableName: "completed_tasks";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        sessionId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "session_id";
            tableName: "completed_tasks";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        label: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "label";
            tableName: "completed_tasks";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        model: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "model";
            tableName: "completed_tasks";
            dataType: "string";
            columnType: "SQLiteText";
            data: "HAIKU" | "SONNET" | "OPUS";
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: ["HAIKU", "SONNET", "OPUS"];
            baseColumn: never;
        }, object>;
        durationMinutes: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "duration_minutes";
            tableName: "completed_tasks";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        completedAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "completed_at";
            tableName: "completed_tasks";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
    };
    dialect: "sqlite";
}>;
declare const completedTasksRelations: drizzle_orm.Relations<"completed_tasks", {
    session: drizzle_orm.One<"ruflo_sessions", true>;
}>;
type RufloSession = typeof rufloSessions.$inferSelect;
type NewRufloSession = typeof rufloSessions.$inferInsert;
type CompletedTask = typeof completedTasks.$inferSelect;
type NewCompletedTask = typeof completedTasks.$inferInsert;

declare const conductorScores: drizzle_orm_sqlite_core.SQLiteTableWithColumns<{
    name: "conductor_scores";
    schema: undefined;
    columns: {
        id: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "id";
            tableName: "conductor_scores";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        userId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "user_id";
            tableName: "conductor_scores";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        total: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "total";
            tableName: "conductor_scores";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        fleetUtilization: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "fleet_utilization";
            tableName: "conductor_scores";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        runwayHealth: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "runway_health";
            tableName: "conductor_scores";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        planAccuracy: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "plan_accuracy";
            tableName: "conductor_scores";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        costEfficiency: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "cost_efficiency";
            tableName: "conductor_scores";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        velocityTrend: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "velocity_trend";
            tableName: "conductor_scores";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        leaderboardRank: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "leaderboard_rank";
            tableName: "conductor_scores";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        createdAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "created_at";
            tableName: "conductor_scores";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        updatedAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "updated_at";
            tableName: "conductor_scores";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
    };
    dialect: "sqlite";
}>;
declare const conductorScoresRelations: drizzle_orm.Relations<"conductor_scores", {
    history: drizzle_orm.Many<"score_history">;
}>;
declare const scoreHistory: drizzle_orm_sqlite_core.SQLiteTableWithColumns<{
    name: "score_history";
    schema: undefined;
    columns: {
        id: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "id";
            tableName: "score_history";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        scoreId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "score_id";
            tableName: "score_history";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        total: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "total";
            tableName: "score_history";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        fleetUtilization: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "fleet_utilization";
            tableName: "score_history";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        runwayHealth: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "runway_health";
            tableName: "score_history";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        planAccuracy: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "plan_accuracy";
            tableName: "score_history";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        costEfficiency: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "cost_efficiency";
            tableName: "score_history";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        velocityTrend: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "velocity_trend";
            tableName: "score_history";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        recordedAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "recorded_at";
            tableName: "score_history";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
    };
    dialect: "sqlite";
}>;
declare const scoreHistoryRelations: drizzle_orm.Relations<"score_history", {
    score: drizzle_orm.One<"conductor_scores", true>;
}>;
type ConductorScore = typeof conductorScores.$inferSelect;
type NewConductorScore = typeof conductorScores.$inferInsert;
type ScoreHistory = typeof scoreHistory.$inferSelect;
type NewScoreHistory = typeof scoreHistory.$inferInsert;

declare const activityEvents: drizzle_orm_sqlite_core.SQLiteTableWithColumns<{
    name: "activity_events";
    schema: undefined;
    columns: {
        id: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "id";
            tableName: "activity_events";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        type: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "type";
            tableName: "activity_events";
            dataType: "string";
            columnType: "SQLiteText";
            data: "SESSION_PROGRESS" | "SESSION_COMPLETE" | "PLAN_GENERATED" | "PLAN_APPROVED" | "ITEM_CREATED" | "ITEM_DISPATCHED" | "RUNWAY_UPDATE" | "FILE_UNLOCKED" | "SCORE_UPDATE" | "WAVE_PLAN_CREATED" | "WAVE_DISPATCHING" | "WAVE_TASK_DISPATCHED" | "WAVE_TASK_COMPLETE" | "WAVE_TASK_FAILED" | "WAVE_COMPLETE" | "WAVE_ADVANCE" | "WAVE_PLAN_COMPLETE" | "WAVE_PLAN_FAILED" | "WAVE_PLAN_REOPTIMIZING";
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: ["SESSION_PROGRESS", "SESSION_COMPLETE", "PLAN_GENERATED", "PLAN_APPROVED", "ITEM_CREATED", "ITEM_DISPATCHED", "RUNWAY_UPDATE", "FILE_UNLOCKED", "SCORE_UPDATE", "WAVE_PLAN_CREATED", "WAVE_DISPATCHING", "WAVE_TASK_DISPATCHED", "WAVE_TASK_COMPLETE", "WAVE_TASK_FAILED", "WAVE_COMPLETE", "WAVE_ADVANCE", "WAVE_PLAN_COMPLETE", "WAVE_PLAN_FAILED", "WAVE_PLAN_REOPTIMIZING"];
            baseColumn: never;
        }, object>;
        message: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "message";
            tableName: "activity_events";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        repo: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "repo";
            tableName: "activity_events";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        ticketId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "ticket_id";
            tableName: "activity_events";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        metadata: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "metadata";
            tableName: "activity_events";
            dataType: "json";
            columnType: "SQLiteTextJson";
            data: Record<string, unknown>;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        createdAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "created_at";
            tableName: "activity_events";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
    };
    dialect: "sqlite";
}>;
type ActivityEvent = typeof activityEvents.$inferSelect;
type NewActivityEvent = typeof activityEvents.$inferInsert;

/**
 * Raw source materials that feed the wiki compiler.
 * These are immutable once ingested — the LLM reads but never modifies them.
 * Sources include: session logs, commit diffs, specs, architecture decisions.
 */
declare const wikiSources: drizzle_orm_sqlite_core.SQLiteTableWithColumns<{
    name: "wiki_sources";
    schema: undefined;
    columns: {
        id: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "id";
            tableName: "wiki_sources";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        sourceType: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "source_type";
            tableName: "wiki_sources";
            dataType: "string";
            columnType: "SQLiteText";
            data: "manual" | "session_log" | "commit" | "spec" | "decision";
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: ["session_log", "commit", "spec", "decision", "manual"];
            baseColumn: never;
        }, object>;
        title: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "title";
            tableName: "wiki_sources";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        content: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "content";
            tableName: "wiki_sources";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        origin: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "origin";
            tableName: "wiki_sources";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        repo: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "repo";
            tableName: "wiki_sources";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        contentHash: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "content_hash";
            tableName: "wiki_sources";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        createdAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "created_at";
            tableName: "wiki_sources";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
    };
    dialect: "sqlite";
}>;
/**
 * Compiled wiki articles — LLM-generated and maintained markdown.
 * These are the "compiled output" of the knowledge base.
 * Articles include: architecture overviews, entity pages, decision logs,
 * pattern catalogs, and cross-referenced concept pages.
 */
declare const wikiArticles: drizzle_orm_sqlite_core.SQLiteTableWithColumns<{
    name: "wiki_articles";
    schema: undefined;
    columns: {
        id: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "id";
            tableName: "wiki_articles";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        slug: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "slug";
            tableName: "wiki_articles";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        title: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "title";
            tableName: "wiki_articles";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        category: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "category";
            tableName: "wiki_articles";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        content: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "content";
            tableName: "wiki_articles";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        status: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "status";
            tableName: "wiki_articles";
            dataType: "string";
            columnType: "SQLiteText";
            data: "active" | "stale" | "archived";
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: ["active", "stale", "archived"];
            baseColumn: never;
        }, object>;
        backlinks: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "backlinks";
            tableName: "wiki_articles";
            dataType: "json";
            columnType: "SQLiteTextJson";
            data: string[];
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        sourceIds: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "source_ids";
            tableName: "wiki_articles";
            dataType: "json";
            columnType: "SQLiteTextJson";
            data: string[];
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        repo: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "repo";
            tableName: "wiki_articles";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        version: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "version";
            tableName: "wiki_articles";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        createdAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "created_at";
            tableName: "wiki_articles";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        updatedAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "updated_at";
            tableName: "wiki_articles";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
    };
    dialect: "sqlite";
}>;
/**
 * Append-only chronicle of all wiki operations.
 * Tracks ingests, queries, lint runs, and compiles for auditability.
 */
declare const wikiLog: drizzle_orm_sqlite_core.SQLiteTableWithColumns<{
    name: "wiki_log";
    schema: undefined;
    columns: {
        id: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "id";
            tableName: "wiki_log";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        action: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "action";
            tableName: "wiki_log";
            dataType: "string";
            columnType: "SQLiteText";
            data: "ingest" | "compile" | "query" | "lint" | "update";
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: ["ingest", "compile", "query", "lint", "update"];
            baseColumn: never;
        }, object>;
        summary: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "summary";
            tableName: "wiki_log";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        articleIds: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "article_ids";
            tableName: "wiki_log";
            dataType: "json";
            columnType: "SQLiteTextJson";
            data: string[];
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        sourceIds: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "source_ids";
            tableName: "wiki_log";
            dataType: "json";
            columnType: "SQLiteTextJson";
            data: string[];
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        repo: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "repo";
            tableName: "wiki_log";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        tokensUsed: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "tokens_used";
            tableName: "wiki_log";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        createdAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "created_at";
            tableName: "wiki_log";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
    };
    dialect: "sqlite";
}>;
declare const wikiSourcesRelations: drizzle_orm.Relations<"wiki_sources", {}>;
declare const wikiArticlesRelations: drizzle_orm.Relations<"wiki_articles", {}>;
declare const wikiLogRelations: drizzle_orm.Relations<"wiki_log", {}>;

/**
 * Wings — top-level memory groupings.
 * Typically one wing per project/repo, plus optional persona wings.
 */
declare const palaceWings: drizzle_orm_sqlite_core.SQLiteTableWithColumns<{
    name: "palace_wings";
    schema: undefined;
    columns: {
        id: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "id";
            tableName: "palace_wings";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        slug: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "slug";
            tableName: "palace_wings";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        name: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "name";
            tableName: "palace_wings";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        wingType: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "wing_type";
            tableName: "palace_wings";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        repo: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "repo";
            tableName: "palace_wings";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        description: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "description";
            tableName: "palace_wings";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        createdAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "created_at";
            tableName: "palace_wings";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        updatedAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "updated_at";
            tableName: "palace_wings";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
    };
    dialect: "sqlite";
}>;
/**
 * Rooms — topic-specific storage within a wing.
 * Rooms are the primary retrieval unit for L2 (on-demand room recall).
 */
declare const palaceRooms: drizzle_orm_sqlite_core.SQLiteTableWithColumns<{
    name: "palace_rooms";
    schema: undefined;
    columns: {
        id: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "id";
            tableName: "palace_rooms";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        wingId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "wing_id";
            tableName: "palace_rooms";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        slug: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "slug";
            tableName: "palace_rooms";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        name: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "name";
            tableName: "palace_rooms";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        topic: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "topic";
            tableName: "palace_rooms";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        description: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "description";
            tableName: "palace_rooms";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        createdAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "created_at";
            tableName: "palace_rooms";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        updatedAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "updated_at";
            tableName: "palace_rooms";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
    };
    dialect: "sqlite";
}>;
/**
 * Drawers — verbatim original content.
 * Drawers are immutable once written; they're the canonical source of truth.
 */
declare const palaceDrawers: drizzle_orm_sqlite_core.SQLiteTableWithColumns<{
    name: "palace_drawers";
    schema: undefined;
    columns: {
        id: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "id";
            tableName: "palace_drawers";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        roomId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "room_id";
            tableName: "palace_drawers";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        memoryType: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "memory_type";
            tableName: "palace_drawers";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        label: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "label";
            tableName: "palace_drawers";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        content: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "content";
            tableName: "palace_drawers";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        aaakContent: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "aaak_content";
            tableName: "palace_drawers";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        contentHash: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "content_hash";
            tableName: "palace_drawers";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        sourceKind: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "source_kind";
            tableName: "palace_drawers";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        sourceRef: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "source_ref";
            tableName: "palace_drawers";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        tags: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "tags";
            tableName: "palace_drawers";
            dataType: "json";
            columnType: "SQLiteTextJson";
            data: string[];
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        salience: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "salience";
            tableName: "palace_drawers";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        createdAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "created_at";
            tableName: "palace_drawers";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
    };
    dialect: "sqlite";
}>;
/**
 * Closets — compressed summaries that point back to drawers.
 * Closets are what gets loaded into prompts; drawers are only cited for deep dives.
 */
declare const palaceClosets: drizzle_orm_sqlite_core.SQLiteTableWithColumns<{
    name: "palace_closets";
    schema: undefined;
    columns: {
        id: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "id";
            tableName: "palace_closets";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        roomId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "room_id";
            tableName: "palace_closets";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        summary: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "summary";
            tableName: "palace_closets";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        drawerIds: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "drawer_ids";
            tableName: "palace_closets";
            dataType: "json";
            columnType: "SQLiteTextJson";
            data: string[];
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        tier: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "tier";
            tableName: "palace_closets";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        tokenCost: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "token_cost";
            tableName: "palace_closets";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        createdAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "created_at";
            tableName: "palace_closets";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        updatedAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "updated_at";
            tableName: "palace_closets";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
    };
    dialect: "sqlite";
}>;
/**
 * Halls — typed relationships between rooms in the same wing.
 * Used for in-wing navigation and backlink expansion.
 */
declare const palaceHalls: drizzle_orm_sqlite_core.SQLiteTableWithColumns<{
    name: "palace_halls";
    schema: undefined;
    columns: {
        id: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "id";
            tableName: "palace_halls";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        wingId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "wing_id";
            tableName: "palace_halls";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        fromRoomId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "from_room_id";
            tableName: "palace_halls";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        toRoomId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "to_room_id";
            tableName: "palace_halls";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        relation: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "relation";
            tableName: "palace_halls";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        weight: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "weight";
            tableName: "palace_halls";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        createdAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "created_at";
            tableName: "palace_halls";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
    };
    dialect: "sqlite";
}>;
/**
 * Tunnels — cross-wing references.
 * Used when a concept in one wing relates to a concept in another.
 */
declare const palaceTunnels: drizzle_orm_sqlite_core.SQLiteTableWithColumns<{
    name: "palace_tunnels";
    schema: undefined;
    columns: {
        id: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "id";
            tableName: "palace_tunnels";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        fromRoomId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "from_room_id";
            tableName: "palace_tunnels";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        toRoomId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "to_room_id";
            tableName: "palace_tunnels";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        reason: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "reason";
            tableName: "palace_tunnels";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        createdAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "created_at";
            tableName: "palace_tunnels";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
    };
    dialect: "sqlite";
}>;
/**
 * Knowledge Graph triples with temporal validity windows.
 * Facts can be auto-invalidated when contradicting facts arrive.
 */
declare const palaceKgTriples: drizzle_orm_sqlite_core.SQLiteTableWithColumns<{
    name: "palace_kg_triples";
    schema: undefined;
    columns: {
        id: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "id";
            tableName: "palace_kg_triples";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        wingId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "wing_id";
            tableName: "palace_kg_triples";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        subject: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "subject";
            tableName: "palace_kg_triples";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        predicate: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "predicate";
            tableName: "palace_kg_triples";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        object: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "object";
            tableName: "palace_kg_triples";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        validFrom: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "valid_from";
            tableName: "palace_kg_triples";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        validUntil: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "valid_until";
            tableName: "palace_kg_triples";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        sourceDrawerId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "source_drawer_id";
            tableName: "palace_kg_triples";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        confidence: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "confidence";
            tableName: "palace_kg_triples";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        createdAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "created_at";
            tableName: "palace_kg_triples";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
    };
    dialect: "sqlite";
}>;
/**
 * Agent diary — scratch memory per agent/persona.
 * Lower priority than drawers; typically not loaded unless queried.
 */
declare const palaceDiary: drizzle_orm_sqlite_core.SQLiteTableWithColumns<{
    name: "palace_diary";
    schema: undefined;
    columns: {
        id: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "id";
            tableName: "palace_diary";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        wingId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "wing_id";
            tableName: "palace_diary";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        agentId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "agent_id";
            tableName: "palace_diary";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        entry: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "entry";
            tableName: "palace_diary";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        createdAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "created_at";
            tableName: "palace_diary";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
    };
    dialect: "sqlite";
}>;
declare const palaceWingsRelations: drizzle_orm.Relations<"palace_wings", {
    rooms: drizzle_orm.Many<"palace_rooms">;
    halls: drizzle_orm.Many<"palace_halls">;
    kgTriples: drizzle_orm.Many<"palace_kg_triples">;
}>;
declare const palaceRoomsRelations: drizzle_orm.Relations<"palace_rooms", {
    wing: drizzle_orm.One<"palace_wings", true>;
    drawers: drizzle_orm.Many<"palace_drawers">;
    closets: drizzle_orm.Many<"palace_closets">;
}>;
declare const palaceDrawersRelations: drizzle_orm.Relations<"palace_drawers", {
    room: drizzle_orm.One<"palace_rooms", true>;
}>;
declare const palaceClosetsRelations: drizzle_orm.Relations<"palace_closets", {
    room: drizzle_orm.One<"palace_rooms", true>;
}>;

type schema_ActivityEvent = ActivityEvent;
type schema_CompletedTask = CompletedTask;
declare const schema_Complexity: typeof Complexity;
type schema_ConductorScore = ConductorScore;
type schema_ConflictingFile = ConflictingFile;
declare const schema_DependencyEdge: typeof DependencyEdge;
declare const schema_DependencyEdgeType: typeof DependencyEdgeType;
declare const schema_EventType: typeof EventType;
declare const schema_FileStatus: typeof FileStatus;
type schema_HorizonItem = HorizonItem;
type schema_InFlightFile = InFlightFile;
declare const schema_Model: typeof Model;
type schema_NewActivityEvent = NewActivityEvent;
type schema_NewCompletedTask = NewCompletedTask;
type schema_NewConductorScore = NewConductorScore;
type schema_NewConflictingFile = NewConflictingFile;
declare const schema_NewDependencyEdge: typeof NewDependencyEdge;
type schema_NewHorizonItem = NewHorizonItem;
type schema_NewInFlightFile = NewInFlightFile;
type schema_NewPlan = NewPlan;
type schema_NewRufloSession = NewRufloSession;
type schema_NewScoreHistory = NewScoreHistory;
type schema_NewTask = NewTask;
type schema_NewTouchedFile = NewTouchedFile;
declare const schema_NewWave: typeof NewWave;
declare const schema_NewWavePlan: typeof NewWavePlan;
declare const schema_NewWavePlanMetric: typeof NewWavePlanMetric;
declare const schema_NewWaveTask: typeof NewWaveTask;
type schema_NewWorkstream = NewWorkstream;
declare const schema_OrchestratorMode: typeof OrchestratorMode;
type schema_Plan = Plan;
type schema_RufloSession = RufloSession;
type schema_ScoreHistory = ScoreHistory;
declare const schema_SessionStatus: typeof SessionStatus;
type schema_Task = Task;
type schema_TouchedFile = TouchedFile;
declare const schema_Wave: typeof Wave;
declare const schema_WavePlan: typeof WavePlan;
declare const schema_WavePlanMetric: typeof WavePlanMetric;
declare const schema_WavePlanStatus: typeof WavePlanStatus;
declare const schema_WaveStatus: typeof WaveStatus;
declare const schema_WaveTask: typeof WaveTask;
declare const schema_WaveTaskStatus: typeof WaveTaskStatus;
declare const schema_WikiArticleStatus: typeof WikiArticleStatus;
declare const schema_WikiLogAction: typeof WikiLogAction;
declare const schema_WikiSourceType: typeof WikiSourceType;
type schema_Workstream = Workstream;
declare const schema_Zone: typeof Zone;
declare const schema_activityEvents: typeof activityEvents;
declare const schema_completedTasks: typeof completedTasks;
declare const schema_completedTasksRelations: typeof completedTasksRelations;
declare const schema_complexityValues: typeof complexityValues;
declare const schema_conductorScores: typeof conductorScores;
declare const schema_conductorScoresRelations: typeof conductorScoresRelations;
declare const schema_conflictingFiles: typeof conflictingFiles;
declare const schema_conflictingFilesRelations: typeof conflictingFilesRelations;
declare const schema_dependencyEdgeTypeValues: typeof dependencyEdgeTypeValues;
declare const schema_dependencyEdges: typeof dependencyEdges;
declare const schema_dependencyEdgesRelations: typeof dependencyEdgesRelations;
declare const schema_eventTypeValues: typeof eventTypeValues;
declare const schema_fileStatusValues: typeof fileStatusValues;
declare const schema_horizonItems: typeof horizonItems;
declare const schema_horizonItemsRelations: typeof horizonItemsRelations;
declare const schema_inFlightFiles: typeof inFlightFiles;
declare const schema_inFlightFilesRelations: typeof inFlightFilesRelations;
declare const schema_modelValues: typeof modelValues;
declare const schema_orchestratorModeValues: typeof orchestratorModeValues;
declare const schema_palaceClosets: typeof palaceClosets;
declare const schema_palaceClosetsRelations: typeof palaceClosetsRelations;
declare const schema_palaceDiary: typeof palaceDiary;
declare const schema_palaceDrawers: typeof palaceDrawers;
declare const schema_palaceDrawersRelations: typeof palaceDrawersRelations;
declare const schema_palaceHalls: typeof palaceHalls;
declare const schema_palaceKgTriples: typeof palaceKgTriples;
declare const schema_palaceRooms: typeof palaceRooms;
declare const schema_palaceRoomsRelations: typeof palaceRoomsRelations;
declare const schema_palaceTunnels: typeof palaceTunnels;
declare const schema_palaceWings: typeof palaceWings;
declare const schema_palaceWingsRelations: typeof palaceWingsRelations;
declare const schema_plans: typeof plans;
declare const schema_plansRelations: typeof plansRelations;
declare const schema_rufloSessions: typeof rufloSessions;
declare const schema_rufloSessionsRelations: typeof rufloSessionsRelations;
declare const schema_scoreHistory: typeof scoreHistory;
declare const schema_scoreHistoryRelations: typeof scoreHistoryRelations;
declare const schema_sessionStatusValues: typeof sessionStatusValues;
declare const schema_tasks: typeof tasks;
declare const schema_tasksRelations: typeof tasksRelations;
declare const schema_touchedFiles: typeof touchedFiles;
declare const schema_touchedFilesRelations: typeof touchedFilesRelations;
declare const schema_wavePlanMetrics: typeof wavePlanMetrics;
declare const schema_wavePlanMetricsRelations: typeof wavePlanMetricsRelations;
declare const schema_wavePlanStatusValues: typeof wavePlanStatusValues;
declare const schema_wavePlans: typeof wavePlans;
declare const schema_wavePlansRelations: typeof wavePlansRelations;
declare const schema_waveStatusValues: typeof waveStatusValues;
declare const schema_waveTaskStatusValues: typeof waveTaskStatusValues;
declare const schema_waveTasks: typeof waveTasks;
declare const schema_waveTasksRelations: typeof waveTasksRelations;
declare const schema_waves: typeof waves;
declare const schema_wavesRelations: typeof wavesRelations;
declare const schema_wikiArticleStatusValues: typeof wikiArticleStatusValues;
declare const schema_wikiArticles: typeof wikiArticles;
declare const schema_wikiArticlesRelations: typeof wikiArticlesRelations;
declare const schema_wikiLog: typeof wikiLog;
declare const schema_wikiLogActionValues: typeof wikiLogActionValues;
declare const schema_wikiLogRelations: typeof wikiLogRelations;
declare const schema_wikiSourceTypeValues: typeof wikiSourceTypeValues;
declare const schema_wikiSources: typeof wikiSources;
declare const schema_wikiSourcesRelations: typeof wikiSourcesRelations;
declare const schema_workstreams: typeof workstreams;
declare const schema_workstreamsRelations: typeof workstreamsRelations;
declare const schema_zoneValues: typeof zoneValues;
declare namespace schema {
  export { type schema_ActivityEvent as ActivityEvent, type schema_CompletedTask as CompletedTask, schema_Complexity as Complexity, type schema_ConductorScore as ConductorScore, type schema_ConflictingFile as ConflictingFile, schema_DependencyEdge as DependencyEdge, schema_DependencyEdgeType as DependencyEdgeType, schema_EventType as EventType, schema_FileStatus as FileStatus, type schema_HorizonItem as HorizonItem, type schema_InFlightFile as InFlightFile, schema_Model as Model, type schema_NewActivityEvent as NewActivityEvent, type schema_NewCompletedTask as NewCompletedTask, type schema_NewConductorScore as NewConductorScore, type schema_NewConflictingFile as NewConflictingFile, schema_NewDependencyEdge as NewDependencyEdge, type schema_NewHorizonItem as NewHorizonItem, type schema_NewInFlightFile as NewInFlightFile, type schema_NewPlan as NewPlan, type schema_NewRufloSession as NewRufloSession, type schema_NewScoreHistory as NewScoreHistory, type schema_NewTask as NewTask, type schema_NewTouchedFile as NewTouchedFile, schema_NewWave as NewWave, schema_NewWavePlan as NewWavePlan, schema_NewWavePlanMetric as NewWavePlanMetric, schema_NewWaveTask as NewWaveTask, type schema_NewWorkstream as NewWorkstream, schema_OrchestratorMode as OrchestratorMode, type schema_Plan as Plan, type schema_RufloSession as RufloSession, type schema_ScoreHistory as ScoreHistory, schema_SessionStatus as SessionStatus, type schema_Task as Task, type schema_TouchedFile as TouchedFile, schema_Wave as Wave, schema_WavePlan as WavePlan, schema_WavePlanMetric as WavePlanMetric, schema_WavePlanStatus as WavePlanStatus, schema_WaveStatus as WaveStatus, schema_WaveTask as WaveTask, schema_WaveTaskStatus as WaveTaskStatus, schema_WikiArticleStatus as WikiArticleStatus, schema_WikiLogAction as WikiLogAction, schema_WikiSourceType as WikiSourceType, type schema_Workstream as Workstream, schema_Zone as Zone, schema_activityEvents as activityEvents, schema_completedTasks as completedTasks, schema_completedTasksRelations as completedTasksRelations, schema_complexityValues as complexityValues, schema_conductorScores as conductorScores, schema_conductorScoresRelations as conductorScoresRelations, schema_conflictingFiles as conflictingFiles, schema_conflictingFilesRelations as conflictingFilesRelations, schema_dependencyEdgeTypeValues as dependencyEdgeTypeValues, schema_dependencyEdges as dependencyEdges, schema_dependencyEdgesRelations as dependencyEdgesRelations, schema_eventTypeValues as eventTypeValues, schema_fileStatusValues as fileStatusValues, schema_horizonItems as horizonItems, schema_horizonItemsRelations as horizonItemsRelations, schema_inFlightFiles as inFlightFiles, schema_inFlightFilesRelations as inFlightFilesRelations, schema_modelValues as modelValues, schema_orchestratorModeValues as orchestratorModeValues, schema_palaceClosets as palaceClosets, schema_palaceClosetsRelations as palaceClosetsRelations, schema_palaceDiary as palaceDiary, schema_palaceDrawers as palaceDrawers, schema_palaceDrawersRelations as palaceDrawersRelations, schema_palaceHalls as palaceHalls, schema_palaceKgTriples as palaceKgTriples, schema_palaceRooms as palaceRooms, schema_palaceRoomsRelations as palaceRoomsRelations, schema_palaceTunnels as palaceTunnels, schema_palaceWings as palaceWings, schema_palaceWingsRelations as palaceWingsRelations, schema_plans as plans, schema_plansRelations as plansRelations, schema_rufloSessions as rufloSessions, schema_rufloSessionsRelations as rufloSessionsRelations, schema_scoreHistory as scoreHistory, schema_scoreHistoryRelations as scoreHistoryRelations, schema_sessionStatusValues as sessionStatusValues, schema_tasks as tasks, schema_tasksRelations as tasksRelations, schema_touchedFiles as touchedFiles, schema_touchedFilesRelations as touchedFilesRelations, schema_wavePlanMetrics as wavePlanMetrics, schema_wavePlanMetricsRelations as wavePlanMetricsRelations, schema_wavePlanStatusValues as wavePlanStatusValues, schema_wavePlans as wavePlans, schema_wavePlansRelations as wavePlansRelations, schema_waveStatusValues as waveStatusValues, schema_waveTaskStatusValues as waveTaskStatusValues, schema_waveTasks as waveTasks, schema_waveTasksRelations as waveTasksRelations, schema_waves as waves, schema_wavesRelations as wavesRelations, schema_wikiArticleStatusValues as wikiArticleStatusValues, schema_wikiArticles as wikiArticles, schema_wikiArticlesRelations as wikiArticlesRelations, schema_wikiLog as wikiLog, schema_wikiLogActionValues as wikiLogActionValues, schema_wikiLogRelations as wikiLogRelations, schema_wikiSourceTypeValues as wikiSourceTypeValues, schema_wikiSources as wikiSources, schema_wikiSourcesRelations as wikiSourcesRelations, schema_workstreams as workstreams, schema_workstreamsRelations as workstreamsRelations, schema_zoneValues as zoneValues };
}

type SQLiteDatabase = BetterSQLite3Database<typeof schema>;

type PostgresDatabase = PostgresJsDatabase<typeof schema>;

type Database = SQLiteDatabase;
declare function createDatabase(config: DatabaseConfig): Database;
declare function closeDatabase(config: DatabaseConfig): Promise<void>;

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

export { type ActivityEvent, type CompletedTask, Complexity, type ConductorScore, type ConflictingFile, type Database, type DatabaseConfig, DependencyEdge, DependencyEdgeType, EventType, FileStatus, type HorizonItem, type InFlightFile, Model, type NewActivityEvent, type NewCompletedTask, type NewConductorScore, type NewConflictingFile, NewDependencyEdge, type NewHorizonItem, type NewInFlightFile, type NewPlan, type NewRufloSession, type NewScoreHistory, type NewTask, type NewTouchedFile, NewWave, NewWavePlan, NewWavePlanMetric, NewWaveTask, type NewWorkstream, OrchestratorMode, type Plan, type PostgresDatabase, type RufloSession, type SQLiteDatabase, type ScoreHistory, SessionStatus, type Task, type TouchedFile, Wave, WavePlan, WavePlanMetric, WavePlanStatus, WaveStatus, WaveTask, WaveTaskStatus, WikiArticleStatus, WikiLogAction, WikiSourceType, type Workstream, Zone, activityEvents, closeDatabase, completedTasks, completedTasksRelations, complexityValues, conductorScores, conductorScoresRelations, conflictingFiles, conflictingFilesRelations, createDatabase, databaseConfigSchema, dependencyEdgeTypeValues, dependencyEdges, dependencyEdgesRelations, eventTypeValues, fileStatusValues, getDatabase, getDatabaseConfig, horizonItems, horizonItemsRelations, inFlightFiles, inFlightFilesRelations, initDatabase, modelValues, orchestratorModeValues, palaceClosets, palaceClosetsRelations, palaceDiary, palaceDrawers, palaceDrawersRelations, palaceHalls, palaceKgTriples, palaceRooms, palaceRoomsRelations, palaceTunnels, palaceWings, palaceWingsRelations, plans, plansRelations, resetDatabase, rufloSessions, rufloSessionsRelations, scoreHistory, scoreHistoryRelations, sessionStatusValues, tasks, tasksRelations, touchedFiles, touchedFilesRelations, wavePlanMetrics, wavePlanMetricsRelations, wavePlanStatusValues, wavePlans, wavePlansRelations, waveStatusValues, waveTaskStatusValues, waveTasks, waveTasksRelations, waves, wavesRelations, wikiArticleStatusValues, wikiArticles, wikiArticlesRelations, wikiLog, wikiLogActionValues, wikiLogRelations, wikiSourceTypeValues, wikiSources, wikiSourcesRelations, workstreams, workstreamsRelations, zoneValues };
