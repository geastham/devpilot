import { NextRequest, NextResponse } from 'next/server';
import {
  db,
  waveTasks,
  dependencyEdges,
  eq,
  and,
} from '@/lib/db';
import type { Model, Complexity } from '@/lib/db';
import { validateDAG } from '@devpilot.sh/core/wave-planner/dag-validator';
import type { ParsedTask, ParsedEdge } from '@devpilot.sh/core/wave-planner/types';

interface RouteParams {
  params: Promise<{ taskId: string }>;
}

// PATCH /api/wave-tasks/[taskId] - Update a wave task
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { taskId } = await params;
    const body = await request.json();
    const {
      model,
      complexity,
      dependencies,
      status,
      recommendedModel,
    } = body;

    // Fetch the task
    const task = await db.query.waveTasks.findFirst({
      where: eq(waveTasks.id, taskId),
    });

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // If dependencies are being changed, validate the DAG
    if (dependencies !== undefined) {
      // Fetch all tasks in the wave plan
      const allTasks = await db.query.waveTasks.findMany({
        where: eq(waveTasks.wavePlanId, task.wavePlanId),
      });

      // Fetch all dependency edges
      const edges = await db.query.dependencyEdges.findMany({
        where: eq(dependencyEdges.wavePlanId, task.wavePlanId),
      });

      // Create the updated task list with new dependencies
      const updatedTasks: ParsedTask[] = allTasks.map(t => {
        if (t.id === taskId) {
          return {
            taskCode: t.taskCode,
            description: t.description,
            filePaths: t.filePaths || [],
            dependencies: dependencies,
            canRunInParallel: t.canRunInParallel,
            recommendedModel: (recommendedModel || t.recommendedModel || 'sonnet') as 'haiku' | 'sonnet' | 'opus',
            complexity: (complexity || t.complexity || 'M') as 'S' | 'M' | 'L' | 'XL',
          };
        }
        return {
          taskCode: t.taskCode,
          description: t.description,
          filePaths: t.filePaths || [],
          dependencies: t.dependencies || [],
          canRunInParallel: t.canRunInParallel,
          recommendedModel: (t.recommendedModel || 'sonnet') as 'haiku' | 'sonnet' | 'opus',
          complexity: (t.complexity || 'M') as 'S' | 'M' | 'L' | 'XL',
        };
      });

      // Convert edges to ParsedEdge format
      const parsedEdges: ParsedEdge[] = edges.map(e => ({
        from: e.fromTaskCode,
        to: e.toTaskCode,
        type: (e.edgeType || 'hard') as 'hard' | 'soft',
      }));

      // Update edges based on new dependencies
      const newEdges = [...parsedEdges];
      // Remove old edges for this task
      const filteredEdges = newEdges.filter(e => e.to !== task.taskCode);
      // Add new edges from dependencies
      for (const dep of dependencies) {
        filteredEdges.push({
          from: dep,
          to: task.taskCode,
          type: 'hard',
        });
      }

      // Validate the DAG
      const validationResult = validateDAG(updatedTasks, filteredEdges);

      if (!validationResult.valid) {
        return NextResponse.json(
          {
            error: 'Invalid dependency change',
            validationErrors: validationResult.errors,
            validationWarnings: validationResult.warnings,
          },
          { status: 400 }
        );
      }

      // Update dependency edges in database
      // Delete old edges for this task
      await db.delete(dependencyEdges)
        .where(
          and(
            eq(dependencyEdges.wavePlanId, task.wavePlanId),
            eq(dependencyEdges.toTaskCode, task.taskCode)
          )
        );

      // Insert new edges
      for (const dep of dependencies) {
        await db.insert(dependencyEdges).values({
          wavePlanId: task.wavePlanId,
          fromTaskCode: dep,
          toTaskCode: task.taskCode,
          edgeType: 'hard',
        });
      }
    }

    // Build update data
    const updateData: Partial<typeof waveTasks.$inferInsert> = {};

    if (recommendedModel !== undefined) {
      updateData.recommendedModel = recommendedModel as Model;
    }

    if (complexity !== undefined) {
      updateData.complexity = complexity as Complexity;
    }

    if (dependencies !== undefined) {
      updateData.dependencies = dependencies;
    }

    if (status !== undefined) {
      updateData.status = status;

      // Update timestamps based on status transitions
      if (status === 'running' || status === 'dispatched') {
        updateData.startedAt = new Date();
      } else if (status === 'completed' || status === 'failed' || status === 'skipped') {
        updateData.completedAt = new Date();
      }
    }

    // Update the task
    const [updatedTask] = await db.update(waveTasks)
      .set(updateData)
      .where(eq(waveTasks.id, taskId))
      .returning();

    return NextResponse.json({
      task: updatedTask,
      validationWarnings: dependencies !== undefined
        ? (await getValidationWarnings(task.wavePlanId))
        : [],
    });
  } catch (error) {
    console.error('Failed to update wave task:', error);
    return NextResponse.json(
      { error: 'Failed to update wave task' },
      { status: 500 }
    );
  }
}

// Helper function to get validation warnings after update
async function getValidationWarnings(wavePlanId: string) {
  const allTasks = await db.query.waveTasks.findMany({
    where: eq(waveTasks.wavePlanId, wavePlanId),
  });

  const edges = await db.query.dependencyEdges.findMany({
    where: eq(dependencyEdges.wavePlanId, wavePlanId),
  });

  const parsedTasks: ParsedTask[] = allTasks.map(t => ({
    taskCode: t.taskCode,
    description: t.description,
    filePaths: t.filePaths || [],
    dependencies: t.dependencies || [],
    canRunInParallel: t.canRunInParallel,
    recommendedModel: (t.recommendedModel || 'sonnet') as 'haiku' | 'sonnet' | 'opus',
    complexity: (t.complexity || 'M') as 'S' | 'M' | 'L' | 'XL',
  }));

  const parsedEdges: ParsedEdge[] = edges.map(e => ({
    from: e.fromTaskCode,
    to: e.toTaskCode,
    type: (e.edgeType || 'hard') as 'hard' | 'soft',
  }));

  const validationResult = validateDAG(parsedTasks, parsedEdges);
  return validationResult.warnings;
}
