'use client';

import { cn } from '@/lib/utils';
import type { ParsedWavePlan, ParsedWave, WaveProgress } from '@devpilot.sh/core/wave-planner';

// ============================================================================
// WaveProgressBar
// ============================================================================

interface WaveProgressBarProps {
  wavePlan: ParsedWavePlan;
  waveProgress?: Map<number, WaveProgress>;
  currentWaveIndex?: number;
  className?: string;
}

export function WaveProgressBar({
  wavePlan,
  waveProgress,
  currentWaveIndex,
  className,
}: WaveProgressBarProps) {
  const totalWaves = wavePlan.waves.length;

  const getWaveStatus = (wave: ParsedWave): 'pending' | 'active' | 'complete' | 'failed' => {
    if (waveProgress) {
      const progress = waveProgress.get(wave.waveIndex);
      if (progress) {
        if (progress.status === 'failed') return 'failed';
        if (progress.status === 'completed') return 'complete';
        if (progress.status === 'active' || progress.status === 'dispatching') return 'active';
      }
    }

    // Fallback to currentWaveIndex
    if (currentWaveIndex !== undefined) {
      if (wave.waveIndex < currentWaveIndex) return 'complete';
      if (wave.waveIndex === currentWaveIndex) return 'active';
    }

    return 'pending';
  };

  const getStatusColor = (status: 'pending' | 'active' | 'complete' | 'failed'): string => {
    switch (status) {
      case 'pending':
        return 'bg-bg-panel';
      case 'active':
        return 'bg-accent-primary';
      case 'complete':
        return 'bg-accent-green';
      case 'failed':
        return 'bg-accent-red';
    }
  };

  const getStatusLabel = (status: 'pending' | 'active' | 'complete' | 'failed'): string => {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'active':
        return 'Active';
      case 'complete':
        return 'Complete';
      case 'failed':
        return 'Failed';
    }
  };

  return (
    <div className={cn('space-y-3', className)}>
      {/* Progress Bar */}
      <div className="flex items-center gap-1">
        {wavePlan.waves.map((wave, index) => {
          const status = getWaveStatus(wave);
          const isLast = index === totalWaves - 1;

          return (
            <div
              key={wave.waveIndex}
              className="flex items-center flex-1"
            >
              {/* Wave Segment */}
              <div className="relative flex-1 group">
                <div
                  className={cn(
                    'h-3 rounded-sm transition-all duration-300',
                    getStatusColor(status),
                    status === 'active' && 'animate-pulse',
                    'cursor-pointer hover:opacity-80'
                  )}
                  title={`Wave ${wave.waveIndex + 1}: ${wave.label} - ${getStatusLabel(status)}`}
                />

                {/* Tooltip on hover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-bg-panel border border-border-default rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  <div className="font-medium">Wave {wave.waveIndex + 1}</div>
                  <div className="text-text-secondary">{wave.label}</div>
                  <div className="text-xs text-text-tertiary">{wave.tasks.length} tasks</div>
                </div>
              </div>

              {/* Connector (except after last wave) */}
              {!isLast && (
                <div className="w-1 h-3 bg-border-default" />
              )}
            </div>
          );
        })}
      </div>

      {/* Wave Legend */}
      <div className="flex items-center gap-4 text-xs text-text-secondary">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-bg-panel" />
          <span>Pending</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-accent-primary animate-pulse" />
          <span>Active</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-accent-green" />
          <span>Complete</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-accent-red" />
          <span>Failed</span>
        </div>
      </div>

      {/* Wave Stats */}
      {currentWaveIndex !== undefined && (
        <div className="text-sm text-text-secondary">
          Wave {currentWaveIndex + 1} of {totalWaves}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Compact Wave Progress (for top bar)
// ============================================================================

interface CompactWaveProgressProps {
  wavePlan: ParsedWavePlan;
  currentWaveIndex: number;
  className?: string;
}

export function CompactWaveProgress({
  wavePlan,
  currentWaveIndex,
  className,
}: CompactWaveProgressProps) {
  const totalWaves = wavePlan.waves.length;
  const completedWaves = currentWaveIndex;
  const progress = (completedWaves / totalWaves) * 100;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex-1 h-1.5 rounded-full bg-bg-panel overflow-hidden">
        <div
          className="h-full bg-accent-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-xs text-text-secondary whitespace-nowrap">
        {completedWaves}/{totalWaves}
      </span>
    </div>
  );
}
