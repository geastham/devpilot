import { NextRequest, NextResponse } from 'next/server';
import { db, horizonItems, wavePlans, eq, desc } from '@/lib/db';
import { computeCriticalPath } from '@devpilot.sh/core/wave-planner';
import type { ParsedTask, ParsedEdge } from '@devpilot.sh/core/wave-planner';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/items/[id]/wave-plan/critical-path - Get critical path analysis with real-time progress
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Verify the horizon item exists
    const item = await db.query.horizonItems.findFirst({
      where: eq(horizonItems.id, id),
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // Fetch the most recent wave plan with all relations
    const wavePlan = await db.query.wavePlans.findFirst({
      where: eq(wavePlans.horizonItemId, id),
      orderBy: [desc(wavePlans.version)],
      with: {
        waves: {
          with: {
            tasks: true,
          },
        },
        waveTasks: true,
        dependencyEdges: true,
        metrics: true,
      },
    });

    if (!wavePlan) {
      return NextResponse.json(
        { error: 'No wave plan exists for this item' },
        { status: 404 }
      );
    }

    // Convert database tasks to ParsedTask format for critical path computation
    const parsedTasks: ParsedTask[] = wavePlan.waveTasks.map((task) => ({
      taskCode: task.taskCode,
      description: task.description,
      filePaths: task.filePaths || [],
      dependencies: task.dependencies || [],
      recommendedModel: task.recommendedModel?.toLowerCase() as 'haiku' | 'sonnet' | 'opus',
      complexity: task.complexity as 'S' | 'M' | 'L' | 'XL',
      canRunInParallel: task.canRunInParallel,
    }));

    // Convert dependency edges to ParsedEdge format
    const parsedEdges: ParsedEdge[] = wavePlan.dependencyEdges.map((edge) => ({
      from: edge.fromTaskCode,
      to: edge.toTaskCode,
      type: edge.edgeType as 'hard' | 'soft',
    }));

    // Compute critical path with current data
    const criticalPath = computeCriticalPath(parsedTasks, parsedEdges);

    // Enhance with real-time progress information
    const tasksOnCriticalPath = criticalPath.path.map((taskCode) => {
      const task = wavePlan.waveTasks.find((t) => t.taskCode === taskCode);
      const annotation = criticalPath.annotations.get(taskCode);

      return {
        taskCode,
        label: task?.label || '',
        description: task?.description || '',
        status: task?.status || 'pending',
        waveIndex: task?.waveIndex,
        isCompleted: task?.status === 'completed',
        isFailed: task?.status === 'failed',
        isRunning: task?.status === 'running',
        startedAt: task?.startedAt,
        completedAt: task?.completedAt,
        annotation: {
          distanceFromRoot: annotation?.distanceFromRoot || 0,
          distanceToEnd: annotation?.distanceToEnd || 0,
          slack: annotation?.slack || 0,
        },
      };
    });

    // Calculate progress metrics
    const completedTasks = tasksOnCriticalPath.filter((t) => t.isCompleted).length;
    const failedTasks = tasksOnCriticalPath.filter((t) => t.isFailed).length;
    const runningTasks = tasksOnCriticalPath.filter((t) => t.isRunning).length;
    const totalTasks = tasksOnCriticalPath.length;
    const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    // Identify bottlenecks (tasks on critical path with high distance from root)
    const bottlenecks = tasksOnCriticalPath
      .filter((t) => !t.isCompleted && t.annotation.distanceFromRoot >= 3)
      .sort((a, b) => b.annotation.distanceFromRoot - a.annotation.distanceFromRoot)
      .slice(0, 5);

    // Estimate remaining time on critical path
    const remainingTasks = tasksOnCriticalPath.filter((t) => !t.isCompleted);
    const estimatedRemainingMs = remainingTasks.length * 120000; // Simple estimate: 2 minutes per task

    // Calculate critical path efficiency
    const criticalPathEfficiency =
      criticalPath.length > 0
        ? (completedTasks / criticalPath.length) * 100
        : 0;

    return NextResponse.json({
      criticalPath: {
        path: criticalPath.path,
        length: criticalPath.length,
        tasks: tasksOnCriticalPath,
      },
      progress: {
        completedTasks,
        failedTasks,
        runningTasks,
        totalTasks,
        percentComplete: Math.round(progress * 100) / 100,
        criticalPathEfficiency: Math.round(criticalPathEfficiency * 100) / 100,
      },
      bottlenecks,
      estimates: {
        remainingTasksOnCriticalPath: remainingTasks.length,
        estimatedRemainingMs,
        estimatedCompletionTime:
          estimatedRemainingMs > 0
            ? new Date(Date.now() + estimatedRemainingMs).toISOString()
            : null,
      },
      metadata: {
        wavePlanId: wavePlan.id,
        wavePlanStatus: wavePlan.status,
        currentWaveIndex: wavePlan.currentWaveIndex,
        totalWaves: wavePlan.totalWaves,
        parallelizationScore: wavePlan.parallelizationScore,
      },
    });
  } catch (error) {
    console.error('Failed to fetch critical path:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch critical path',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
