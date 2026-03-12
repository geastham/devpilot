import { z } from 'zod';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as drizzle_orm from 'drizzle-orm';
import * as drizzle_orm_sqlite_core from 'drizzle-orm/sqlite-core';
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

declare const zoneValues: readonly ["READY", "REFINING", "SHAPING", "DIRECTIONAL"];
type Zone = (typeof zoneValues)[number];
declare const complexityValues: readonly ["S", "M", "L", "XL"];
type Complexity = (typeof complexityValues)[number];
declare const modelValues: readonly ["HAIKU", "SONNET", "OPUS"];
type Model = (typeof modelValues)[number];
declare const sessionStatusValues: readonly ["ACTIVE", "NEEDS_SPEC", "COMPLETE", "ERROR"];
type SessionStatus = (typeof sessionStatusValues)[number];
declare const fileStatusValues: readonly ["AVAILABLE", "IN_FLIGHT", "RECENTLY_MODIFIED"];
type FileStatus = (typeof fileStatusValues)[number];
declare const eventTypeValues: readonly ["SESSION_PROGRESS", "SESSION_COMPLETE", "PLAN_GENERATED", "PLAN_APPROVED", "ITEM_CREATED", "ITEM_DISPATCHED", "RUNWAY_UPDATE", "FILE_UNLOCKED", "SCORE_UPDATE", "WAVE_PLAN_CREATED", "WAVE_DISPATCHING", "WAVE_TASK_DISPATCHED", "WAVE_TASK_COMPLETE", "WAVE_TASK_FAILED", "WAVE_COMPLETE", "WAVE_ADVANCE", "WAVE_PLAN_COMPLETE", "WAVE_PLAN_FAILED", "WAVE_PLAN_REOPTIMIZING"];
type EventType = (typeof eventTypeValues)[number];
declare const orchestratorModeValues: readonly ["http", "ao-cli", "manual", "disabled"];
type OrchestratorMode = (typeof orchestratorModeValues)[number];
declare const wavePlanStatusValues: readonly ["draft", "approved", "executing", "paused", "completed", "failed", "re-optimizing"];
type WavePlanStatus = (typeof wavePlanStatusValues)[number];
declare const waveStatusValues: readonly ["pending", "dispatching", "active", "completed", "failed", "skipped"];
type WaveStatus = (typeof waveStatusValues)[number];
declare const waveTaskStatusValues: readonly ["pending", "dispatched", "running", "completed", "failed", "retrying", "skipped"];
type WaveTaskStatus = (typeof waveTaskStatusValues)[number];
declare const dependencyEdgeTypeValues: readonly ["hard", "soft"];
type DependencyEdgeType = (typeof dependencyEdgeTypeValues)[number];

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
            data: "http" | "ao-cli" | "manual" | "disabled";
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: ["http", "ao-cli", "manual", "disabled"];
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

declare const wavePlans: drizzle_orm_sqlite_core.SQLiteTableWithColumns<{
    name: "wave_plans";
    schema: undefined;
    columns: {
        id: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "id";
            tableName: "wave_plans";
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
            tableName: "wave_plans";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        horizonItemId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "horizon_item_id";
            tableName: "wave_plans";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        totalWaves: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "total_waves";
            tableName: "wave_plans";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        totalTasks: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "total_tasks";
            tableName: "wave_plans";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        maxParallelism: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "max_parallelism";
            tableName: "wave_plans";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        criticalPath: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "critical_path";
            tableName: "wave_plans";
            dataType: "json";
            columnType: "SQLiteTextJson";
            data: string[];
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        criticalPathLength: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "critical_path_length";
            tableName: "wave_plans";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        parallelizationScore: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "parallelization_score";
            tableName: "wave_plans";
            dataType: "number";
            columnType: "SQLiteReal";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        status: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "status";
            tableName: "wave_plans";
            dataType: "string";
            columnType: "SQLiteText";
            data: "draft" | "approved" | "executing" | "paused" | "completed" | "failed" | "re-optimizing";
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: ["draft", "approved", "executing", "paused", "completed", "failed", "re-optimizing"];
            baseColumn: never;
        }, object>;
        currentWaveIndex: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "current_wave_index";
            tableName: "wave_plans";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        version: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "version";
            tableName: "wave_plans";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        previousWavePlanId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "previous_wave_plan_id";
            tableName: "wave_plans";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        rawMarkdown: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "raw_markdown";
            tableName: "wave_plans";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        startedAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "started_at";
            tableName: "wave_plans";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        completedAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "completed_at";
            tableName: "wave_plans";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        createdAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "created_at";
            tableName: "wave_plans";
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
            tableName: "wave_plans";
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
declare const wavePlansRelations: drizzle_orm.Relations<"wave_plans", {
    plan: drizzle_orm.One<"plans", true>;
    horizonItem: drizzle_orm.One<"horizon_items", true>;
    previousWavePlan: drizzle_orm.One<"wave_plans", false>;
    waves: drizzle_orm.Many<"waves">;
    waveTasks: drizzle_orm.Many<"wave_tasks">;
    dependencyEdges: drizzle_orm.Many<"dependency_edges">;
    metrics: drizzle_orm.One<"wave_plan_metrics", true>;
}>;
declare const waves: drizzle_orm_sqlite_core.SQLiteTableWithColumns<{
    name: "waves";
    schema: undefined;
    columns: {
        id: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "id";
            tableName: "waves";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        wavePlanId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "wave_plan_id";
            tableName: "waves";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        waveIndex: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "wave_index";
            tableName: "waves";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        label: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "label";
            tableName: "waves";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        maxParallelTasks: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "max_parallel_tasks";
            tableName: "waves";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        status: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "status";
            tableName: "waves";
            dataType: "string";
            columnType: "SQLiteText";
            data: "completed" | "failed" | "pending" | "dispatching" | "active" | "skipped";
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: ["pending", "dispatching", "active", "completed", "failed", "skipped"];
            baseColumn: never;
        }, object>;
        startedAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "started_at";
            tableName: "waves";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        completedAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "completed_at";
            tableName: "waves";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
    };
    dialect: "sqlite";
}>;
declare const wavesRelations: drizzle_orm.Relations<"waves", {
    wavePlan: drizzle_orm.One<"wave_plans", true>;
    tasks: drizzle_orm.Many<"wave_tasks">;
}>;
declare const waveTasks: drizzle_orm_sqlite_core.SQLiteTableWithColumns<{
    name: "wave_tasks";
    schema: undefined;
    columns: {
        id: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "id";
            tableName: "wave_tasks";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        waveId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "wave_id";
            tableName: "wave_tasks";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        wavePlanId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "wave_plan_id";
            tableName: "wave_tasks";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        taskId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "task_id";
            tableName: "wave_tasks";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        waveIndex: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "wave_index";
            tableName: "wave_tasks";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        taskCode: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "task_code";
            tableName: "wave_tasks";
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
            tableName: "wave_tasks";
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
            tableName: "wave_tasks";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        filePaths: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "file_paths";
            tableName: "wave_tasks";
            dataType: "json";
            columnType: "SQLiteTextJson";
            data: string[];
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        dependencies: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "dependencies";
            tableName: "wave_tasks";
            dataType: "json";
            columnType: "SQLiteTextJson";
            data: string[];
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        recommendedModel: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "recommended_model";
            tableName: "wave_tasks";
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
            tableName: "wave_tasks";
            dataType: "string";
            columnType: "SQLiteText";
            data: "S" | "M" | "L" | "XL";
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: ["S", "M", "L", "XL"];
            baseColumn: never;
        }, object>;
        isOnCriticalPath: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "is_on_critical_path";
            tableName: "wave_tasks";
            dataType: "boolean";
            columnType: "SQLiteBoolean";
            data: boolean;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        canRunInParallel: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "can_run_in_parallel";
            tableName: "wave_tasks";
            dataType: "boolean";
            columnType: "SQLiteBoolean";
            data: boolean;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        status: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "status";
            tableName: "wave_tasks";
            dataType: "string";
            columnType: "SQLiteText";
            data: "completed" | "failed" | "pending" | "skipped" | "dispatched" | "running" | "retrying";
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: ["pending", "dispatched", "running", "completed", "failed", "retrying", "skipped"];
            baseColumn: never;
        }, object>;
        assignedSessionId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "assigned_session_id";
            tableName: "wave_tasks";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        startedAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "started_at";
            tableName: "wave_tasks";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        completedAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "completed_at";
            tableName: "wave_tasks";
            dataType: "date";
            columnType: "SQLiteTimestamp";
            data: Date;
            driverParam: number;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        errorMessage: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "error_message";
            tableName: "wave_tasks";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        retryCount: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "retry_count";
            tableName: "wave_tasks";
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
declare const waveTasksRelations: drizzle_orm.Relations<"wave_tasks", {
    wave: drizzle_orm.One<"waves", true>;
    wavePlan: drizzle_orm.One<"wave_plans", true>;
    task: drizzle_orm.One<"tasks", false>;
}>;
declare const dependencyEdges: drizzle_orm_sqlite_core.SQLiteTableWithColumns<{
    name: "dependency_edges";
    schema: undefined;
    columns: {
        id: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "id";
            tableName: "dependency_edges";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        wavePlanId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "wave_plan_id";
            tableName: "dependency_edges";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        fromTaskCode: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "from_task_code";
            tableName: "dependency_edges";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        toTaskCode: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "to_task_code";
            tableName: "dependency_edges";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        edgeType: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "edge_type";
            tableName: "dependency_edges";
            dataType: "string";
            columnType: "SQLiteText";
            data: "hard" | "soft";
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: ["hard", "soft"];
            baseColumn: never;
        }, object>;
    };
    dialect: "sqlite";
}>;
declare const dependencyEdgesRelations: drizzle_orm.Relations<"dependency_edges", {
    wavePlan: drizzle_orm.One<"wave_plans", true>;
}>;
declare const wavePlanMetrics: drizzle_orm_sqlite_core.SQLiteTableWithColumns<{
    name: "wave_plan_metrics";
    schema: undefined;
    columns: {
        id: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "id";
            tableName: "wave_plan_metrics";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        wavePlanId: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "wave_plan_id";
            tableName: "wave_plan_metrics";
            dataType: "string";
            columnType: "SQLiteText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, object>;
        totalWallClockMs: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "total_wall_clock_ms";
            tableName: "wave_plan_metrics";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        theoreticalMinMs: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "theoretical_min_ms";
            tableName: "wave_plan_metrics";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        parallelizationEfficiency: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "parallelization_efficiency";
            tableName: "wave_plan_metrics";
            dataType: "number";
            columnType: "SQLiteReal";
            data: number;
            driverParam: number;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        wavesExecuted: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "waves_executed";
            tableName: "wave_plan_metrics";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        tasksCompleted: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "tasks_completed";
            tableName: "wave_plan_metrics";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        tasksFailed: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "tasks_failed";
            tableName: "wave_plan_metrics";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        tasksRetried: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "tasks_retried";
            tableName: "wave_plan_metrics";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        avgTaskDurationMs: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "avg_task_duration_ms";
            tableName: "wave_plan_metrics";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        maxWaveWaitMs: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "max_wave_wait_ms";
            tableName: "wave_plan_metrics";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        fileConflictsAvoided: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "file_conflicts_avoided";
            tableName: "wave_plan_metrics";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        reOptimizationCount: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "re_optimization_count";
            tableName: "wave_plan_metrics";
            dataType: "number";
            columnType: "SQLiteInteger";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, object>;
        recordedAt: drizzle_orm_sqlite_core.SQLiteColumn<{
            name: "recorded_at";
            tableName: "wave_plan_metrics";
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
declare const wavePlanMetricsRelations: drizzle_orm.Relations<"wave_plan_metrics", {
    wavePlan: drizzle_orm.One<"wave_plans", true>;
}>;
type WavePlan = typeof wavePlans.$inferSelect;
type NewWavePlan = typeof wavePlans.$inferInsert;
type Wave = typeof waves.$inferSelect;
type NewWave = typeof waves.$inferInsert;
type WaveTask = typeof waveTasks.$inferSelect;
type NewWaveTask = typeof waveTasks.$inferInsert;
type DependencyEdge = typeof dependencyEdges.$inferSelect;
type NewDependencyEdge = typeof dependencyEdges.$inferInsert;
type WavePlanMetric = typeof wavePlanMetrics.$inferSelect;
type NewWavePlanMetric = typeof wavePlanMetrics.$inferInsert;

type schema_ActivityEvent = ActivityEvent;
type schema_CompletedTask = CompletedTask;
type schema_Complexity = Complexity;
type schema_ConductorScore = ConductorScore;
type schema_ConflictingFile = ConflictingFile;
type schema_DependencyEdge = DependencyEdge;
type schema_DependencyEdgeType = DependencyEdgeType;
type schema_EventType = EventType;
type schema_FileStatus = FileStatus;
type schema_HorizonItem = HorizonItem;
type schema_InFlightFile = InFlightFile;
type schema_Model = Model;
type schema_NewActivityEvent = NewActivityEvent;
type schema_NewCompletedTask = NewCompletedTask;
type schema_NewConductorScore = NewConductorScore;
type schema_NewConflictingFile = NewConflictingFile;
type schema_NewDependencyEdge = NewDependencyEdge;
type schema_NewHorizonItem = NewHorizonItem;
type schema_NewInFlightFile = NewInFlightFile;
type schema_NewPlan = NewPlan;
type schema_NewRufloSession = NewRufloSession;
type schema_NewScoreHistory = NewScoreHistory;
type schema_NewTask = NewTask;
type schema_NewTouchedFile = NewTouchedFile;
type schema_NewWave = NewWave;
type schema_NewWavePlan = NewWavePlan;
type schema_NewWavePlanMetric = NewWavePlanMetric;
type schema_NewWaveTask = NewWaveTask;
type schema_NewWorkstream = NewWorkstream;
type schema_OrchestratorMode = OrchestratorMode;
type schema_Plan = Plan;
type schema_RufloSession = RufloSession;
type schema_ScoreHistory = ScoreHistory;
type schema_SessionStatus = SessionStatus;
type schema_Task = Task;
type schema_TouchedFile = TouchedFile;
type schema_Wave = Wave;
type schema_WavePlan = WavePlan;
type schema_WavePlanMetric = WavePlanMetric;
type schema_WavePlanStatus = WavePlanStatus;
type schema_WaveStatus = WaveStatus;
type schema_WaveTask = WaveTask;
type schema_WaveTaskStatus = WaveTaskStatus;
type schema_Workstream = Workstream;
type schema_Zone = Zone;
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
declare const schema_workstreams: typeof workstreams;
declare const schema_workstreamsRelations: typeof workstreamsRelations;
declare const schema_zoneValues: typeof zoneValues;
declare namespace schema {
  export { type schema_ActivityEvent as ActivityEvent, type schema_CompletedTask as CompletedTask, type schema_Complexity as Complexity, type schema_ConductorScore as ConductorScore, type schema_ConflictingFile as ConflictingFile, type schema_DependencyEdge as DependencyEdge, type schema_DependencyEdgeType as DependencyEdgeType, type schema_EventType as EventType, type schema_FileStatus as FileStatus, type schema_HorizonItem as HorizonItem, type schema_InFlightFile as InFlightFile, type schema_Model as Model, type schema_NewActivityEvent as NewActivityEvent, type schema_NewCompletedTask as NewCompletedTask, type schema_NewConductorScore as NewConductorScore, type schema_NewConflictingFile as NewConflictingFile, type schema_NewDependencyEdge as NewDependencyEdge, type schema_NewHorizonItem as NewHorizonItem, type schema_NewInFlightFile as NewInFlightFile, type schema_NewPlan as NewPlan, type schema_NewRufloSession as NewRufloSession, type schema_NewScoreHistory as NewScoreHistory, type schema_NewTask as NewTask, type schema_NewTouchedFile as NewTouchedFile, type schema_NewWave as NewWave, type schema_NewWavePlan as NewWavePlan, type schema_NewWavePlanMetric as NewWavePlanMetric, type schema_NewWaveTask as NewWaveTask, type schema_NewWorkstream as NewWorkstream, type schema_OrchestratorMode as OrchestratorMode, type schema_Plan as Plan, type schema_RufloSession as RufloSession, type schema_ScoreHistory as ScoreHistory, type schema_SessionStatus as SessionStatus, type schema_Task as Task, type schema_TouchedFile as TouchedFile, type schema_Wave as Wave, type schema_WavePlan as WavePlan, type schema_WavePlanMetric as WavePlanMetric, type schema_WavePlanStatus as WavePlanStatus, type schema_WaveStatus as WaveStatus, type schema_WaveTask as WaveTask, type schema_WaveTaskStatus as WaveTaskStatus, type schema_Workstream as Workstream, type schema_Zone as Zone, schema_activityEvents as activityEvents, schema_completedTasks as completedTasks, schema_completedTasksRelations as completedTasksRelations, schema_complexityValues as complexityValues, schema_conductorScores as conductorScores, schema_conductorScoresRelations as conductorScoresRelations, schema_conflictingFiles as conflictingFiles, schema_conflictingFilesRelations as conflictingFilesRelations, schema_dependencyEdgeTypeValues as dependencyEdgeTypeValues, schema_dependencyEdges as dependencyEdges, schema_dependencyEdgesRelations as dependencyEdgesRelations, schema_eventTypeValues as eventTypeValues, schema_fileStatusValues as fileStatusValues, schema_horizonItems as horizonItems, schema_horizonItemsRelations as horizonItemsRelations, schema_inFlightFiles as inFlightFiles, schema_inFlightFilesRelations as inFlightFilesRelations, schema_modelValues as modelValues, schema_orchestratorModeValues as orchestratorModeValues, schema_plans as plans, schema_plansRelations as plansRelations, schema_rufloSessions as rufloSessions, schema_rufloSessionsRelations as rufloSessionsRelations, schema_scoreHistory as scoreHistory, schema_scoreHistoryRelations as scoreHistoryRelations, schema_sessionStatusValues as sessionStatusValues, schema_tasks as tasks, schema_tasksRelations as tasksRelations, schema_touchedFiles as touchedFiles, schema_touchedFilesRelations as touchedFilesRelations, schema_wavePlanMetrics as wavePlanMetrics, schema_wavePlanMetricsRelations as wavePlanMetricsRelations, schema_wavePlanStatusValues as wavePlanStatusValues, schema_wavePlans as wavePlans, schema_wavePlansRelations as wavePlansRelations, schema_waveStatusValues as waveStatusValues, schema_waveTaskStatusValues as waveTaskStatusValues, schema_waveTasks as waveTasks, schema_waveTasksRelations as waveTasksRelations, schema_waves as waves, schema_wavesRelations as wavesRelations, schema_workstreams as workstreams, schema_workstreamsRelations as workstreamsRelations, schema_zoneValues as zoneValues };
}

type SQLiteDatabase = BetterSQLite3Database<typeof schema>;

type PostgresDatabase = PostgresJsDatabase<typeof schema>;

type Database = SQLiteDatabase | PostgresDatabase;
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

export { type ActivityEvent, type CompletedTask, type Complexity, type ConductorScore, type ConflictingFile, type Database, type DatabaseConfig, type DependencyEdge, type DependencyEdgeType, type EventType, type FileStatus, type HorizonItem, type InFlightFile, type Model, type NewActivityEvent, type NewCompletedTask, type NewConductorScore, type NewConflictingFile, type NewDependencyEdge, type NewHorizonItem, type NewInFlightFile, type NewPlan, type NewRufloSession, type NewScoreHistory, type NewTask, type NewTouchedFile, type NewWave, type NewWavePlan, type NewWavePlanMetric, type NewWaveTask, type NewWorkstream, type OrchestratorMode, type Plan, type PostgresDatabase, type RufloSession, type SQLiteDatabase, type ScoreHistory, type SessionStatus, type Task, type TouchedFile, type Wave, type WavePlan, type WavePlanMetric, type WavePlanStatus, type WaveStatus, type WaveTask, type WaveTaskStatus, type Workstream, type Zone, activityEvents, closeDatabase, completedTasks, completedTasksRelations, complexityValues, conductorScores, conductorScoresRelations, conflictingFiles, conflictingFilesRelations, createDatabase, databaseConfigSchema, dependencyEdgeTypeValues, dependencyEdges, dependencyEdgesRelations, eventTypeValues, fileStatusValues, getDatabase, getDatabaseConfig, horizonItems, horizonItemsRelations, inFlightFiles, inFlightFilesRelations, initDatabase, modelValues, orchestratorModeValues, plans, plansRelations, resetDatabase, rufloSessions, rufloSessionsRelations, scoreHistory, scoreHistoryRelations, sessionStatusValues, tasks, tasksRelations, touchedFiles, touchedFilesRelations, wavePlanMetrics, wavePlanMetricsRelations, wavePlanStatusValues, wavePlans, wavePlansRelations, waveStatusValues, waveTaskStatusValues, waveTasks, waveTasksRelations, waves, wavesRelations, workstreams, workstreamsRelations, zoneValues };
