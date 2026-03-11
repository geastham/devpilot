import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  horizonItems,
  plans,
  workstreams,
  tasks,
  touchedFiles,
  inFlightFiles,
  rufloSessions,
  activityEvents,
  eq,
} from '@/lib/db';
import type { Model, Complexity, FileStatus } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/items/[id]/plan/generate - Generate a plan for a horizon item
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const item = await db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, id),
      with: { plan: true },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // Get current fleet state for context snapshot
    const activeSessions = await db.query.rufloSessions.findMany({
      where: eq(rufloSessions.status, 'ACTIVE'),
    });

    const allInFlightFiles = await db.query.inFlightFiles.findMany();

    // Calculate fleet context snapshot
    const fleetContextSnapshot = {
      activeSessions: activeSessions.length,
      inFlightFiles: allInFlightFiles.map((f) => ({
        path: f.path,
        sessionId: f.activeSessionId,
        eta: f.estimatedMinutesRemaining,
      })),
      timestamp: new Date().toISOString(),
    };

    // Check for file conflicts with in-flight work
    const conflictingPaths = allInFlightFiles.map((f) => f.path);

    // Simulated plan generation - in production, this would call an AI service
    const generatedWorkstreams = generateMockWorkstreams(item.title, item.repo);
    const estimatedCostUsd = generatedWorkstreams.reduce(
      (sum, ws) => sum + ws.tasks.reduce((t, task) => t + task.estimatedCostUsd, 0),
      0
    );

    // Delete existing plan if any (cascade deletes workstreams, tasks, etc.)
    if (item.plan) {
      // Delete related records first
      await db.delete(tasks).where(eq(tasks.planId, item.plan.id));
      const existingWorkstreams = await db.query.workstreams.findMany({
        where: eq(workstreams.planId, item.plan.id),
      });
      for (const ws of existingWorkstreams) {
        await db.delete(tasks).where(eq(tasks.workstreamId, ws.id));
      }
      await db.delete(workstreams).where(eq(workstreams.planId, item.plan.id));
      await db.delete(touchedFiles).where(eq(touchedFiles.planId, item.plan.id));
      await db.delete(plans).where(eq(plans.id, item.plan.id));
    }

    // Create the new plan
    const [plan] = await db.insert(plans).values({
      horizonItemId: id,
      version: item.plan ? item.plan.version + 1 : 1,
      estimatedCostUsd,
      baselineCostUsd: estimatedCostUsd * 1.2, // Baseline is 20% higher
      acceptanceCriteria: [
        `All tests pass for ${item.repo}`,
        'No regressions in existing functionality',
        'Code review approved',
      ],
      confidenceSignals: {
        hasMemory: true,
        recentlyModifiedFiles: 2,
        similarTasksCompleted: 5,
        overallConfidence: 0.85,
      },
      fleetContextSnapshot,
      memorySessionsUsed: [],
    }).returning();

    // Create workstreams and tasks
    for (let wsIdx = 0; wsIdx < generatedWorkstreams.length; wsIdx++) {
      const ws = generatedWorkstreams[wsIdx];
      const [workstream] = await db.insert(workstreams).values({
        planId: plan.id,
        label: ws.label,
        repo: ws.repo,
        workerCount: ws.workerCount,
        orderIndex: wsIdx,
      }).returning();

      // Create tasks for this workstream
      for (let taskIdx = 0; taskIdx < ws.tasks.length; taskIdx++) {
        const task = ws.tasks[taskIdx];
        await db.insert(tasks).values({
          workstreamId: workstream.id,
          label: task.label,
          model: task.model as Model,
          complexity: task.complexity as Complexity,
          estimatedCostUsd: task.estimatedCostUsd,
          filePaths: task.filePaths,
          conflictWarning: conflictingPaths.some((cp) =>
            task.filePaths.some((fp) => fp.includes(cp) || cp.includes(fp))
          )
            ? 'File may be modified by in-flight session'
            : null,
          dependsOn: task.dependsOn || [],
          orderIndex: taskIdx,
        });
      }
    }

    // Create touched files
    const uniqueFilePaths = generatedWorkstreams
      .flatMap((ws) => ws.tasks.flatMap((t) => t.filePaths))
      .filter((v, i, a) => a.indexOf(v) === i);

    for (const path of uniqueFilePaths) {
      await db.insert(touchedFiles).values({
        planId: plan.id,
        path,
        status: conflictingPaths.includes(path)
          ? ('IN_FLIGHT' as FileStatus)
          : ('AVAILABLE' as FileStatus),
        inFlightVia: conflictingPaths.includes(path)
          ? allInFlightFiles.find((f) => f.path === path)?.activeSessionId
          : null,
      });
    }

    // Update item zone to REFINING if it was in SHAPING
    if (item.zone === 'SHAPING') {
      await db.update(horizonItems)
        .set({ zone: 'REFINING', updatedAt: new Date() })
        .where(eq(horizonItems.id, id));
    }

    // Fetch the complete plan with relations
    const completePlan = await db.query.plans.findFirst({
      where: eq(plans.id, plan.id),
      with: {
        workstreams: {
          with: { tasks: true },
        },
        sequentialTasks: true,
        filesTouched: true,
      },
    });

    // Create activity event
    const taskCount = completePlan?.workstreams.reduce((sum, ws) => sum + ws.tasks.length, 0) || 0;
    await db.insert(activityEvents).values({
      type: 'PLAN_GENERATED',
      message: `Plan generated for "${item.title}" ($${estimatedCostUsd.toFixed(2)})`,
      repo: item.repo,
      ticketId: item.linearTicketId,
      metadata: {
        planId: plan.id,
        workstreams: completePlan?.workstreams.length || 0,
        tasks: taskCount,
      },
    });

    return NextResponse.json(completePlan, { status: 201 });
  } catch (error) {
    console.error('Failed to generate plan:', error);
    return NextResponse.json(
      { error: 'Failed to generate plan' },
      { status: 500 }
    );
  }
}

// Mock workstream generation - would be replaced with AI service
function generateMockWorkstreams(title: string, repo: string) {
  const words = title.toLowerCase().split(' ');
  const isFeature = words.some((w) => ['add', 'implement', 'create', 'build'].includes(w));
  const isFix = words.some((w) => ['fix', 'bug', 'issue', 'error'].includes(w));
  const isRefactor = words.some((w) => ['refactor', 'cleanup', 'improve', 'optimize'].includes(w));

  if (isFeature) {
    return [
      {
        label: 'Core Implementation',
        repo,
        workerCount: 2,
        tasks: [
          {
            label: 'Create base types and interfaces',
            model: 'SONNET',
            complexity: 'S',
            estimatedCostUsd: 0.02,
            filePaths: [`src/types/${words[words.length - 1]}.ts`],
            dependsOn: [],
          },
          {
            label: 'Implement core logic',
            model: 'SONNET',
            complexity: 'M',
            estimatedCostUsd: 0.08,
            filePaths: [`src/lib/${words[words.length - 1]}.ts`],
            dependsOn: [],
          },
        ],
      },
      {
        label: 'UI Components',
        repo,
        workerCount: 1,
        tasks: [
          {
            label: 'Build UI components',
            model: 'SONNET',
            complexity: 'M',
            estimatedCostUsd: 0.06,
            filePaths: [`src/components/${words[words.length - 1]}/index.tsx`],
            dependsOn: [],
          },
          {
            label: 'Add tests',
            model: 'HAIKU',
            complexity: 'S',
            estimatedCostUsd: 0.01,
            filePaths: [`src/components/${words[words.length - 1]}/__tests__/index.test.tsx`],
            dependsOn: [],
          },
        ],
      },
    ];
  }

  if (isFix) {
    return [
      {
        label: 'Bug Fix',
        repo,
        workerCount: 1,
        tasks: [
          {
            label: 'Investigate and fix issue',
            model: 'SONNET',
            complexity: 'M',
            estimatedCostUsd: 0.05,
            filePaths: ['src/lib/affected-module.ts'],
            dependsOn: [],
          },
          {
            label: 'Add regression test',
            model: 'HAIKU',
            complexity: 'S',
            estimatedCostUsd: 0.01,
            filePaths: ['src/__tests__/regression.test.ts'],
            dependsOn: [],
          },
        ],
      },
    ];
  }

  if (isRefactor) {
    return [
      {
        label: 'Refactoring',
        repo,
        workerCount: 1,
        tasks: [
          {
            label: 'Analyze existing code structure',
            model: 'OPUS',
            complexity: 'L',
            estimatedCostUsd: 0.15,
            filePaths: ['src/lib/'],
            dependsOn: [],
          },
          {
            label: 'Apply refactoring changes',
            model: 'SONNET',
            complexity: 'L',
            estimatedCostUsd: 0.12,
            filePaths: ['src/lib/', 'src/components/'],
            dependsOn: [],
          },
        ],
      },
    ];
  }

  // Default generic plan
  return [
    {
      label: 'Implementation',
      repo,
      workerCount: 1,
      tasks: [
        {
          label: 'Complete task',
          model: 'SONNET',
          complexity: 'M',
          estimatedCostUsd: 0.05,
          filePaths: ['src/'],
          dependsOn: [],
        },
      ],
    },
  ];
}
