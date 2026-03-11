import { initDatabase } from './client';
import { SQLiteDatabase } from './adapters';
import {
  horizonItems,
  plans,
  workstreams,
  tasks,
  touchedFiles,
  rufloSessions,
  completedTasks,
  inFlightFiles,
  conductorScores,
  scoreHistory,
  activityEvents,
} from './schema';
import { createId } from '@paralleldrive/cuid2';

async function seed() {
  console.log('🌱 Seeding database...');

  // Cast to SQLiteDatabase since seed is always SQLite
  const db = initDatabase({
    type: 'sqlite',
    sqlitePath: process.env.DEVPILOT_SQLITE_PATH || '.devpilot/data.db',
  }) as SQLiteDatabase;

  // Clean existing data (in reverse order of dependencies)
  console.log('Cleaning existing data...');
  await db.delete(activityEvents);
  await db.delete(scoreHistory);
  await db.delete(conductorScores);
  await db.delete(completedTasks);
  await db.delete(inFlightFiles);
  await db.delete(rufloSessions);
  await db.delete(touchedFiles);
  await db.delete(tasks);
  await db.delete(workstreams);
  await db.delete(plans);
  await db.delete(horizonItems);

  // ============================================================================
  // Create Horizon Items
  // ============================================================================
  console.log('Creating horizon items...');

  // READY items
  const readyItem1Id = createId();
  await db.insert(horizonItems).values({
    id: readyItem1Id,
    title: 'Add real-time sync to graph editor',
    zone: 'READY',
    repo: 'neurograph/editor',
    complexity: 'L',
    priority: 100,
    linearTicketId: 'NG-1024',
  });

  const readyItem2Id = createId();
  await db.insert(horizonItems).values({
    id: readyItem2Id,
    title: 'Implement batch node operations',
    zone: 'READY',
    repo: 'neurograph/core',
    complexity: 'M',
    priority: 80,
    linearTicketId: 'NG-1018',
  });

  // REFINING item
  const refiningItem1Id = createId();
  await db.insert(horizonItems).values({
    id: refiningItem1Id,
    title: 'Add export to PNG/SVG',
    zone: 'REFINING',
    repo: 'neurograph/editor',
    complexity: 'M',
    priority: 60,
    linearTicketId: 'NG-1032',
  });

  // SHAPING items
  await db.insert(horizonItems).values({
    title: 'Performance optimization for large graphs',
    zone: 'SHAPING',
    repo: 'neurograph/core',
    complexity: 'XL',
    priority: 40,
    linearTicketId: 'NG-1045',
  });

  await db.insert(horizonItems).values({
    title: 'Add keyboard shortcuts panel',
    zone: 'SHAPING',
    repo: 'neurograph/editor',
    complexity: 'S',
    priority: 30,
    linearTicketId: 'NG-1051',
  });

  // DIRECTIONAL items
  await db.insert(horizonItems).values({
    title: 'Explore AI-powered layout suggestions',
    zone: 'DIRECTIONAL',
    repo: 'neurograph/ai',
    priority: 20,
  });

  await db.insert(horizonItems).values({
    title: 'Consider dark mode variants',
    zone: 'DIRECTIONAL',
    repo: 'neurograph/editor',
    priority: 15,
  });

  await db.insert(horizonItems).values({
    title: 'Research graph databases for persistence',
    zone: 'DIRECTIONAL',
    repo: 'neurograph/core',
    priority: 10,
  });

  // ============================================================================
  // Create Plans for READY items
  // ============================================================================
  console.log('Creating plans...');

  // Plan for readyItem1
  const plan1Id = createId();
  await db.insert(plans).values({
    id: plan1Id,
    horizonItemId: readyItem1Id,
    version: 1,
    estimatedCostUsd: 0.42,
    baselineCostUsd: 0.56,
    acceptanceCriteria: [
      'WebSocket connection established on editor load',
      'Changes sync within 100ms across clients',
      'Conflict resolution uses CRDT approach',
    ],
    confidenceSignals: {
      hasMemory: true,
      recentlyModifiedFiles: 3,
      similarTasksCompleted: 7,
      overallConfidence: 0.92,
    },
    fleetContextSnapshot: {
      activeSessions: 2,
      timestamp: new Date().toISOString(),
    },
    memorySessionsUsed: [],
  });

  // Workstreams for plan1
  const ws1aId = createId();
  await db.insert(workstreams).values({
    id: ws1aId,
    planId: plan1Id,
    label: 'Backend WebSocket',
    repo: 'neurograph/editor',
    workerCount: 2,
    orderIndex: 0,
  });

  const ws1bId = createId();
  await db.insert(workstreams).values({
    id: ws1bId,
    planId: plan1Id,
    label: 'Frontend Integration',
    repo: 'neurograph/editor',
    workerCount: 1,
    orderIndex: 1,
  });

  // Tasks for ws1a
  await db.insert(tasks).values([
    {
      workstreamId: ws1aId,
      label: 'Set up WebSocket server',
      model: 'SONNET',
      complexity: 'M',
      estimatedCostUsd: 0.08,
      filePaths: ['src/server/websocket.ts', 'src/server/index.ts'],
      dependsOn: [],
      orderIndex: 0,
    },
    {
      workstreamId: ws1aId,
      label: 'Implement CRDT sync protocol',
      model: 'OPUS',
      complexity: 'L',
      estimatedCostUsd: 0.18,
      filePaths: ['src/lib/crdt.ts', 'src/lib/sync.ts'],
      dependsOn: [],
      orderIndex: 1,
    },
  ]);

  // Tasks for ws1b
  await db.insert(tasks).values([
    {
      workstreamId: ws1bId,
      label: 'Create WebSocket client hook',
      model: 'SONNET',
      complexity: 'M',
      estimatedCostUsd: 0.06,
      filePaths: ['src/hooks/useSync.ts'],
      dependsOn: [],
      orderIndex: 0,
    },
    {
      workstreamId: ws1bId,
      label: 'Integrate with editor state',
      model: 'SONNET',
      complexity: 'M',
      estimatedCostUsd: 0.08,
      filePaths: ['src/components/Editor/index.tsx'],
      dependsOn: [],
      orderIndex: 1,
    },
    {
      workstreamId: ws1bId,
      label: 'Add connection status indicator',
      model: 'HAIKU',
      complexity: 'S',
      estimatedCostUsd: 0.02,
      filePaths: ['src/components/StatusBar.tsx'],
      dependsOn: [],
      orderIndex: 2,
    },
  ]);

  // Touched files for plan1
  await db.insert(touchedFiles).values([
    { planId: plan1Id, path: 'src/server/websocket.ts', status: 'AVAILABLE' },
    { planId: plan1Id, path: 'src/lib/crdt.ts', status: 'AVAILABLE' },
    { planId: plan1Id, path: 'src/hooks/useSync.ts', status: 'AVAILABLE' },
    { planId: plan1Id, path: 'src/components/Editor/index.tsx', status: 'AVAILABLE' },
  ]);

  // Plan for readyItem2
  const plan2Id = createId();
  await db.insert(plans).values({
    id: plan2Id,
    horizonItemId: readyItem2Id,
    version: 1,
    estimatedCostUsd: 0.18,
    baselineCostUsd: 0.24,
    acceptanceCriteria: [
      'Select multiple nodes via cmd+click or lasso',
      'Batch operations: delete, move, group',
      'Undo/redo works correctly with batches',
    ],
    confidenceSignals: {
      hasMemory: true,
      recentlyModifiedFiles: 1,
      similarTasksCompleted: 4,
      overallConfidence: 0.88,
    },
    fleetContextSnapshot: { activeSessions: 2 },
    memorySessionsUsed: [],
  });

  const ws2aId = createId();
  await db.insert(workstreams).values({
    id: ws2aId,
    planId: plan2Id,
    label: 'Selection System',
    repo: 'neurograph/core',
    workerCount: 1,
    orderIndex: 0,
  });

  await db.insert(tasks).values([
    {
      workstreamId: ws2aId,
      label: 'Implement multi-select logic',
      model: 'SONNET',
      complexity: 'M',
      estimatedCostUsd: 0.08,
      filePaths: ['src/lib/selection.ts'],
      dependsOn: [],
      orderIndex: 0,
    },
    {
      workstreamId: ws2aId,
      label: 'Add batch operation handlers',
      model: 'SONNET',
      complexity: 'M',
      estimatedCostUsd: 0.08,
      filePaths: ['src/lib/operations.ts'],
      dependsOn: [],
      orderIndex: 1,
    },
    {
      workstreamId: ws2aId,
      label: 'Write tests',
      model: 'HAIKU',
      complexity: 'S',
      estimatedCostUsd: 0.02,
      filePaths: ['src/__tests__/batch.test.ts'],
      dependsOn: [],
      orderIndex: 2,
    },
  ]);

  // Plan for refining item
  const plan3Id = createId();
  await db.insert(plans).values({
    id: plan3Id,
    horizonItemId: refiningItem1Id,
    version: 2,
    estimatedCostUsd: 0.24,
    baselineCostUsd: 0.32,
    acceptanceCriteria: [
      'Export button in toolbar',
      'Support PNG and SVG formats',
      'High-resolution export option',
    ],
    confidenceSignals: {
      hasMemory: false,
      recentlyModifiedFiles: 0,
      similarTasksCompleted: 2,
      overallConfidence: 0.75,
    },
    fleetContextSnapshot: { activeSessions: 2 },
    memorySessionsUsed: [],
  });

  // ============================================================================
  // Create Fleet Sessions
  // ============================================================================
  console.log('Creating fleet sessions...');

  const session1Id = createId();
  await db.insert(rufloSessions).values({
    id: session1Id,
    repo: 'neurograph/core',
    linearTicketId: 'NG-1012',
    ticketTitle: 'Implement undo/redo system',
    currentWorkstream: 'History Management',
    status: 'ACTIVE',
    progressPercent: 67,
    elapsedMinutes: 23,
    estimatedRemainingMinutes: 12,
    inFlightFiles: ['src/lib/history.ts', 'src/hooks/useHistory.ts'],
  });

  await db.insert(completedTasks).values([
    { sessionId: session1Id, label: 'Create history stack', model: 'SONNET', durationMinutes: 8 },
    { sessionId: session1Id, label: 'Implement command pattern', model: 'SONNET', durationMinutes: 12 },
  ]);

  const session2Id = createId();
  await db.insert(rufloSessions).values({
    id: session2Id,
    repo: 'neurograph/editor',
    linearTicketId: 'NG-1008',
    ticketTitle: 'Add mini-map navigation',
    currentWorkstream: 'UI Components',
    status: 'NEEDS_SPEC',
    progressPercent: 34,
    elapsedMinutes: 45,
    estimatedRemainingMinutes: 60,
    inFlightFiles: ['src/components/MiniMap.tsx', 'src/components/Toolbar.tsx'],
  });

  await db.insert(completedTasks).values([
    { sessionId: session2Id, label: 'Create MiniMap component', model: 'SONNET', durationMinutes: 15 },
  ]);

  const session3Id = createId();
  await db.insert(rufloSessions).values({
    id: session3Id,
    repo: 'neurograph/api',
    linearTicketId: 'NG-998',
    ticketTitle: 'Add GraphQL subscriptions',
    currentWorkstream: 'API Layer',
    status: 'ACTIVE',
    progressPercent: 89,
    elapsedMinutes: 52,
    estimatedRemainingMinutes: 8,
    inFlightFiles: ['src/graphql/subscriptions.ts'],
  });

  await db.insert(completedTasks).values([
    { sessionId: session3Id, label: 'Set up subscription server', model: 'SONNET', durationMinutes: 18 },
    { sessionId: session3Id, label: 'Define subscription types', model: 'HAIKU', durationMinutes: 6 },
    { sessionId: session3Id, label: 'Implement resolvers', model: 'SONNET', durationMinutes: 22 },
  ]);

  // In-flight files
  await db.insert(inFlightFiles).values([
    {
      path: 'src/lib/history.ts',
      activeSessionId: session1Id,
      linearTicketId: 'NG-1012',
      estimatedMinutesRemaining: 12,
    },
    {
      path: 'src/hooks/useHistory.ts',
      activeSessionId: session1Id,
      linearTicketId: 'NG-1012',
      estimatedMinutesRemaining: 12,
    },
    {
      path: 'src/components/MiniMap.tsx',
      activeSessionId: session2Id,
      linearTicketId: 'NG-1008',
      estimatedMinutesRemaining: 60,
    },
    {
      path: 'src/components/Toolbar.tsx',
      activeSessionId: session2Id,
      linearTicketId: 'NG-1008',
      estimatedMinutesRemaining: 60,
    },
    {
      path: 'src/graphql/subscriptions.ts',
      activeSessionId: session3Id,
      linearTicketId: 'NG-998',
      estimatedMinutesRemaining: 8,
    },
  ]);

  // ============================================================================
  // Create Conductor Score
  // ============================================================================
  console.log('Creating conductor score...');

  const scoreId = createId();
  await db.insert(conductorScores).values({
    id: scoreId,
    userId: 'default',
    total: 742,
    fleetUtilization: 156,
    runwayHealth: 148,
    planAccuracy: 162,
    costEfficiency: 138,
    velocityTrend: 138,
    leaderboardRank: 23,
  });

  // Score history (last 7 days)
  const historyData = [
    { days: 6, total: 680, fu: 140, rh: 130, pa: 150, ce: 130, vt: 130 },
    { days: 5, total: 695, fu: 142, rh: 135, pa: 152, ce: 132, vt: 134 },
    { days: 4, total: 710, fu: 148, rh: 140, pa: 155, ce: 133, vt: 134 },
    { days: 3, total: 718, fu: 150, rh: 142, pa: 158, ce: 134, vt: 134 },
    { days: 2, total: 725, fu: 152, rh: 145, pa: 160, ce: 135, vt: 133 },
    { days: 1, total: 735, fu: 154, rh: 146, pa: 161, ce: 137, vt: 137 },
    { days: 0, total: 742, fu: 156, rh: 148, pa: 162, ce: 138, vt: 138 },
  ];

  for (const h of historyData) {
    await db.insert(scoreHistory).values({
      scoreId,
      total: h.total,
      fleetUtilization: h.fu,
      runwayHealth: h.rh,
      planAccuracy: h.pa,
      costEfficiency: h.ce,
      velocityTrend: h.vt,
      recordedAt: new Date(Date.now() - h.days * 24 * 60 * 60 * 1000),
    });
  }

  // ============================================================================
  // Create Activity Events
  // ============================================================================
  console.log('Creating activity events...');

  const now = new Date();
  await db.insert(activityEvents).values([
    {
      type: 'SESSION_PROGRESS',
      message: 'NG-1012 completed "Implement command pattern" task',
      repo: 'neurograph/core',
      ticketId: 'NG-1012',
      createdAt: new Date(now.getTime() - 2 * 60 * 1000),
    },
    {
      type: 'SESSION_PROGRESS',
      message: 'NG-998 is 89% complete',
      repo: 'neurograph/api',
      ticketId: 'NG-998',
      createdAt: new Date(now.getTime() - 5 * 60 * 1000),
    },
    {
      type: 'PLAN_GENERATED',
      message: 'Plan generated for "Add export to PNG/SVG" ($0.24)',
      repo: 'neurograph/editor',
      ticketId: 'NG-1032',
      metadata: { planId: plan3Id, cost: 0.24 },
      createdAt: new Date(now.getTime() - 15 * 60 * 1000),
    },
    {
      type: 'RUNWAY_UPDATE',
      message: '"Add real-time sync" promoted to READY',
      repo: 'neurograph/editor',
      ticketId: 'NG-1024',
      createdAt: new Date(now.getTime() - 30 * 60 * 1000),
    },
    {
      type: 'ITEM_DISPATCHED',
      message: 'Dispatched "Implement undo/redo system" to fleet',
      repo: 'neurograph/core',
      ticketId: 'NG-1012',
      metadata: { sessionId: session1Id },
      createdAt: new Date(now.getTime() - 45 * 60 * 1000),
    },
    {
      type: 'SESSION_COMPLETE',
      message: 'NG-995 completed successfully',
      repo: 'neurograph/core',
      ticketId: 'NG-995',
      createdAt: new Date(now.getTime() - 60 * 60 * 1000),
    },
    {
      type: 'SCORE_UPDATE',
      message: 'Score +15 for efficient plan approval',
      metadata: { delta: 15, reason: 'fast_approval' },
      createdAt: new Date(now.getTime() - 90 * 60 * 1000),
    },
    {
      type: 'FILE_UNLOCKED',
      message: 'src/lib/graph.ts is now available',
      repo: 'neurograph/core',
      createdAt: new Date(now.getTime() - 120 * 60 * 1000),
    },
  ]);

  console.log('✅ Database seeded successfully!');
  console.log(`
Summary:
- 8 horizon items
- 3 plans with workstreams and tasks
- 3 fleet sessions
- Conductor score with 7-day history
- 8 activity events
`);
}

seed().catch((error) => {
  console.error('❌ Seed failed:', error);
  process.exit(1);
});
