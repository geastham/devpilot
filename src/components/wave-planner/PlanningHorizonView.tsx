'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { WavePlan, Wave, WavePlanMetric } from '@/types';

// ============================================================================
// Wave Shape Sparkline — compact inline visualization
// ============================================================================

interface WaveShapeSparklineProps {
  waves: Wave[];
  className?: string;
}

export function WaveShapeSparkline({ waves, className }: WaveShapeSparklineProps) {
  const maxTasks = Math.max(...waves.map((w) => w.taskCount), 1);

  return (
    <div className={cn('flex items-end gap-px h-3', className)}>
      {waves.map((wave) => {
        const widthPercent = (wave.taskCount / maxTasks) * 100;
        return (
          <div
            key={wave.id}
            className={cn(
              'rounded-sm transition-all duration-300 min-w-[4px]',
              wave.status === 'completed' && 'bg-accent-green',
              wave.status === 'executing' && 'bg-accent-primary animate-pulse',
              wave.status === 'ready' && 'bg-accent-primary',
              (wave.status === 'pending' || wave.status === 'blocked') && 'bg-[#1E293B]'
            )}
            style={{ width: `${widthPercent}%`, height: '100%' }}
            title={`Wave ${wave.waveIndex + 1}: ${wave.taskCount} tasks`}
          />
        );
      })}
    </div>
  );
}

// ============================================================================
// Wave Depth Indicator — inline on horizon cards
// ============================================================================

interface WaveDepthIndicatorProps {
  wavePlan: WavePlan;
  className?: string;
}

export function WaveDepthIndicator({ wavePlan, className }: WaveDepthIndicatorProps) {
  const { maxParallelism, criticalPathLength } = useMemo(() => {
    const maxP = Math.max(...wavePlan.waves.map((w) => w.taskCount), 0);
    const crit = wavePlan.metrics?.criticalPathLength ?? 0;
    return { maxParallelism: maxP, criticalPathLength: crit };
  }, [wavePlan]);

  return (
    <div className={cn('space-y-1.5', className)}>
      {/* Wave shape bar */}
      <WaveShapeSparkline waves={wavePlan.waves} />

      {/* Stats line */}
      <div className="flex items-center gap-2 text-xs text-text-secondary">
        <span>
          {wavePlan.totalWaves} {wavePlan.totalWaves === 1 ? 'wave' : 'waves'}
        </span>
        <span className="text-text-muted">&middot;</span>
        <span>{wavePlan.totalTasks} tasks</span>
        {wavePlan.estimatedTotalMinutes > 0 && (
          <>
            <span className="text-text-muted">&middot;</span>
            <span>~{wavePlan.estimatedTotalMinutes}min</span>
          </>
        )}
      </div>

      {/* Parallelism + critical path */}
      <div className="flex items-center gap-2 text-xs">
        {maxParallelism > 0 && (
          <span className="text-accent-primary">
            max ∥ {maxParallelism}
          </span>
        )}
        {criticalPathLength > 0 && (
          <>
            <span className="text-text-muted">&middot;</span>
            <span className="text-accent-amber">
              ◆ crit {criticalPathLength}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Planning Horizon Summary — top bar extension
// ============================================================================

interface PlanningHorizonSummaryProps {
  wavePlans: WavePlan[];
  fleetCapacity: number;
  className?: string;
}

export function PlanningHorizonSummary({
  wavePlans,
  fleetCapacity,
  className,
}: PlanningHorizonSummaryProps) {
  const stats = useMemo(() => {
    const totalPlans = wavePlans.length;
    const totalWaves = wavePlans.reduce((sum, wp) => sum + wp.totalWaves, 0);
    const totalTasks = wavePlans.reduce((sum, wp) => sum + wp.totalTasks, 0);
    const avgDepth = totalPlans > 0 ? totalWaves / totalPlans : 0;
    const maxParallelism = Math.max(
      ...wavePlans.flatMap((wp) => wp.waves.map((w) => w.taskCount)),
      0
    );
    const maxCriticalPath = Math.max(
      ...wavePlans.map((wp) => wp.metrics?.criticalPathLength ?? 0),
      0
    );
    const isOverSubscribed = maxParallelism > fleetCapacity;

    return {
      totalPlans,
      totalWaves,
      totalTasks,
      avgDepth,
      maxParallelism,
      maxCriticalPath,
      isOverSubscribed,
    };
  }, [wavePlans, fleetCapacity]);

  if (stats.totalPlans === 0) return null;

  return (
    <div className={cn('flex items-center gap-3 text-xs', className)}>
      <span className="text-text-secondary">
        {stats.totalPlans} {stats.totalPlans === 1 ? 'plan' : 'plans'}
      </span>
      <span className="text-text-muted">&middot;</span>
      <span className="text-text-secondary">
        {stats.totalWaves} waves
      </span>
      <span className="text-text-muted">&middot;</span>
      <span className="text-text-secondary">
        {stats.totalTasks} tasks
      </span>
      <span className="text-text-muted">&middot;</span>
      <span className="text-text-secondary">
        avg depth {stats.avgDepth.toFixed(1)}
      </span>
      <span className="text-text-muted">&middot;</span>
      <span
        className={cn(
          stats.isOverSubscribed ? 'text-accent-red' : 'text-accent-primary'
        )}
      >
        max ∥ {stats.maxParallelism}
        {stats.isOverSubscribed && ` / ${fleetCapacity}`}
      </span>
      {stats.maxCriticalPath > 0 && (
        <>
          <span className="text-text-muted">&middot;</span>
          <span className="text-accent-amber">
            ◆ crit {stats.maxCriticalPath}
          </span>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Wave Plan Card — single plan in the horizon panel
// ============================================================================

interface WavePlanHorizonCardProps {
  wavePlan: WavePlan;
  fleetCapacity: number;
  title: string;
  ticketId?: string;
  onAction?: () => void;
  actionLabel?: string;
  className?: string;
}

function WavePlanHorizonCard({
  wavePlan,
  fleetCapacity,
  title,
  ticketId,
  onAction,
  actionLabel,
  className,
}: WavePlanHorizonCardProps) {
  const maxTasks = Math.max(...wavePlan.waves.map((w) => w.taskCount), 1);
  const maxParallelism = Math.max(...wavePlan.waves.map((w) => w.taskCount), 0);
  const efficiency = wavePlan.metrics?.parallelismEfficiency ?? null;
  const critPath = wavePlan.metrics?.criticalPathLength ?? 0;
  const totalEstMinutes = wavePlan.waves.reduce(
    (sum, w) => sum + w.estimatedMinutes,
    0
  );

  return (
    <div
      className={cn(
        'bg-bg-surface rounded-lg border border-border-default p-4 space-y-3',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {ticketId && (
            <span className="text-xs text-text-secondary font-mono">
              {ticketId}
            </span>
          )}
          <h4 className="text-sm font-medium text-text-primary truncate">
            {title}
          </h4>
        </div>
        <StatusBadge status={wavePlan.status} />
      </div>

      {/* Wave shape bars */}
      <div className="space-y-1">
        {wavePlan.waves.map((wave) => {
          const widthPercent = (wave.taskCount / maxTasks) * 100;
          const exceedsCapacity = wave.taskCount > fleetCapacity;

          return (
            <div key={wave.id} className="flex items-center gap-2 group">
              <span className="text-[10px] text-text-muted font-mono w-5 shrink-0">
                W{wave.waveIndex + 1}
              </span>
              <div className="flex-1 flex items-center gap-2">
                <div
                  className={cn(
                    'h-4 rounded-sm transition-all duration-300 relative',
                    wave.status === 'completed' && 'bg-accent-green',
                    wave.status === 'executing' && 'bg-accent-primary animate-pulse',
                    wave.status === 'ready' && 'bg-accent-primary',
                    (wave.status === 'pending' || wave.status === 'blocked') && 'bg-[#1E293B]',
                    exceedsCapacity && 'ring-1 ring-accent-amber'
                  )}
                  style={{ width: `${Math.max(widthPercent, 10)}%` }}
                >
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] text-white/80 font-mono">
                    {wave.taskCount}
                  </span>
                </div>
                {wave.estimatedMinutes > 0 && (
                  <span className="text-[10px] text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
                    ~{wave.estimatedMinutes}min
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Fleet capacity line */}
      {maxParallelism > fleetCapacity && (
        <div className="text-[10px] text-accent-amber flex items-center gap-1">
          <span>⚠</span>
          <span>
            Peak needs {maxParallelism} agents — {fleetCapacity} available
          </span>
        </div>
      )}

      {/* Metrics footer */}
      <div className="flex items-center justify-between pt-2 border-t border-border-default">
        <div className="flex items-center gap-2 text-xs">
          {critPath > 0 && (
            <span className="text-accent-amber">◆ crit {critPath}</span>
          )}
          <span className="text-text-muted">&middot;</span>
          <span className="text-accent-primary">max ∥ {maxParallelism}</span>
          {efficiency !== null && (
            <>
              <span className="text-text-muted">&middot;</span>
              <span
                className={cn(
                  'text-xs',
                  efficiency > 0.7
                    ? 'text-accent-green'
                    : efficiency > 0.4
                      ? 'text-accent-amber'
                      : 'text-accent-red'
                )}
              >
                ∥ eff {(efficiency * 100).toFixed(0)}%
              </span>
            </>
          )}
        </div>
        {totalEstMinutes > 0 && (
          <span className="text-xs text-text-secondary">
            ~{totalEstMinutes}min
          </span>
        )}
      </div>

      {/* Action */}
      {onAction && actionLabel && (
        <button
          onClick={onAction}
          className="w-full text-center text-xs font-medium py-1.5 rounded bg-accent-primary text-white hover:bg-accent-primary/90 transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Status Badge
// ============================================================================

function StatusBadge({ status }: { status: WavePlan['status'] }) {
  const config = {
    draft: { label: 'Draft', color: 'text-text-muted bg-white/5' },
    approved: { label: 'Approved', color: 'text-accent-primary bg-accent-primary/10' },
    executing: { label: 'Executing', color: 'text-accent-green bg-accent-green/10' },
    paused: { label: 'Paused', color: 'text-accent-amber bg-accent-amber/10' },
    're-optimizing': { label: 'Re-optimizing', color: 'text-accent-purple bg-accent-purple/10' },
    completed: { label: 'Complete', color: 'text-accent-green bg-accent-green/10' },
    failed: { label: 'Failed', color: 'text-accent-red bg-accent-red/10' },
  };

  const { label, color } = config[status];

  return (
    <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', color)}>
      {label}
    </span>
  );
}

// ============================================================================
// Planning Horizon Panel — full expanded view
// ============================================================================

interface PlanningHorizonPanelProps {
  wavePlans: WavePlan[];
  fleetCapacity: number;
  planMeta?: Map<string, { title: string; ticketId?: string }>;
  onPlanAction?: (wavePlanId: string) => void;
  className?: string;
}

export function PlanningHorizonPanel({
  wavePlans,
  fleetCapacity,
  planMeta = new Map(),
  onPlanAction,
  className,
}: PlanningHorizonPanelProps) {
  const aggregate = useMemo(() => {
    const totalPlans = wavePlans.length;
    const totalWaves = wavePlans.reduce((sum, wp) => sum + wp.totalWaves, 0);
    const totalTasks = wavePlans.reduce((sum, wp) => sum + wp.totalTasks, 0);
    const totalEstMinutes = wavePlans.reduce(
      (sum, wp) => wp.waves.reduce((s, w) => s + w.estimatedMinutes, 0) + sum,
      0
    );
    const peakDemand = Math.max(
      ...wavePlans.flatMap((wp) => wp.waves.map((w) => w.taskCount)),
      0
    );
    const isOverSubscribed = peakDemand > fleetCapacity;

    return { totalPlans, totalWaves, totalTasks, totalEstMinutes, peakDemand, isOverSubscribed };
  }, [wavePlans, fleetCapacity]);

  const actionLabelForStatus = (status: WavePlan['status']): string | undefined => {
    switch (status) {
      case 'approved':
        return 'Dispatch →';
      case 'draft':
        return 'Review →';
      case 'executing':
        return 'View Progress →';
      default:
        return undefined;
    }
  };

  return (
    <div
      className={cn(
        'bg-bg-base rounded-lg border border-border-default overflow-hidden',
        className
      )}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-default flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">
          Planning Horizon
        </h3>
        <PlanningHorizonSummary
          wavePlans={wavePlans}
          fleetCapacity={fleetCapacity}
        />
      </div>

      {/* Plan cards grid */}
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {wavePlans.map((wp) => {
          const meta = planMeta.get(wp.id) ?? planMeta.get(wp.horizonItemId);
          const actionLabel = actionLabelForStatus(wp.status);

          return (
            <WavePlanHorizonCard
              key={wp.id}
              wavePlan={wp}
              fleetCapacity={fleetCapacity}
              title={meta?.title ?? `Plan ${wp.id.slice(0, 8)}`}
              ticketId={meta?.ticketId}
              onAction={
                actionLabel && onPlanAction
                  ? () => onPlanAction(wp.id)
                  : undefined
              }
              actionLabel={actionLabel}
            />
          );
        })}
      </div>

      {/* Aggregate footer */}
      {aggregate.totalPlans > 0 && (
        <div className="px-4 py-3 border-t border-border-default">
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-secondary">
              {aggregate.totalPlans} plans &middot; {aggregate.totalWaves} waves
              &middot; {aggregate.totalTasks} tasks
              {aggregate.totalEstMinutes > 0 &&
                ` · est ~${aggregate.totalEstMinutes}min`}
            </span>
            <span
              className={cn(
                aggregate.isOverSubscribed
                  ? 'text-accent-red'
                  : 'text-text-secondary'
              )}
            >
              Peak: {aggregate.peakDemand} concurrent &middot; Fleet:{' '}
              {fleetCapacity} available
              {aggregate.isOverSubscribed && ' · ⚠ over-subscribed'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
