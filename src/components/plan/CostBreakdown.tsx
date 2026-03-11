'use client';

import { cn, formatCurrency, calculateSavingsPercent } from '@/lib/utils';
import type { Plan, Model } from '@/types';

interface CostBreakdownProps {
  plan: Plan;
}

export function CostBreakdown({ plan }: CostBreakdownProps) {
  // Count tasks by model
  const allTasks = [
    ...plan.workstreams.flatMap((ws) => ws.tasks),
    ...plan.sequentialTasks,
  ];

  const modelCounts: Record<Model, { count: number; cost: number }> = {
    haiku: { count: 0, cost: 0 },
    sonnet: { count: 0, cost: 0 },
    opus: { count: 0, cost: 0 },
  };

  allTasks.forEach((task) => {
    const model = task.modelOverride ?? task.model;
    modelCounts[model].count++;
    modelCounts[model].cost += task.estimatedCostUsd;
  });

  const savingsPercent = calculateSavingsPercent(
    plan.estimatedCostUsd,
    plan.baselineCostUsd
  );
  const savingsAmount = plan.baselineCostUsd - plan.estimatedCostUsd;

  return (
    <div className="px-4 py-3 bg-bg-panel/30">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {/* Cost by model */}
        <span className="text-text-secondary">Cost:</span>
        {modelCounts.haiku.count > 0 && (
          <span className="text-text-primary">
            <span className="text-model-haiku">Haiku</span> ×{modelCounts.haiku.count}:{' '}
            {formatCurrency(modelCounts.haiku.cost)}
          </span>
        )}
        {modelCounts.sonnet.count > 0 && (
          <span className="text-text-primary">
            <span className="text-model-sonnet">Sonnet</span> ×{modelCounts.sonnet.count}:{' '}
            {formatCurrency(modelCounts.sonnet.cost)}
          </span>
        )}
        {modelCounts.opus.count > 0 && (
          <span className="text-text-primary">
            <span className="text-model-opus">Opus</span> ×{modelCounts.opus.count}:{' '}
            {formatCurrency(modelCounts.opus.cost)}
          </span>
        )}

        <span className="text-text-muted">·</span>

        {/* Total */}
        <span className="text-text-primary font-medium">
          Total: {formatCurrency(plan.estimatedCostUsd)}
        </span>
      </div>

      {/* Savings comparison */}
      <div className="mt-1 text-xs text-text-muted">
        vs all-Sonnet baseline: {formatCurrency(plan.baselineCostUsd)} →{' '}
        <span className="text-accent-green font-medium">
          Saving {savingsPercent}% ({formatCurrency(savingsAmount)})
        </span>
      </div>
    </div>
  );
}
