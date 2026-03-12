'use client';

import { cn } from '@/lib/utils';
import type { WavePlan, Wave } from '@/types';

interface WaveProgressBarProps {
  wavePlan: WavePlan;
  className?: string;
}

export function WaveProgressBar({ wavePlan, className }: WaveProgressBarProps) {
  const { currentWaveIndex, totalWaves, completedTasks, totalTasks } = wavePlan;
  const overallProgress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Wave indicator */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-secondary">
          Wave {currentWaveIndex + 1} of {totalWaves}
        </span>
        <span className="text-text-secondary">
          {completedTasks}/{totalTasks} tasks ({Math.round(overallProgress)}%)
        </span>
      </div>

      {/* Wave progress visualization */}
      <div className="flex gap-1">
        {wavePlan.waves.map((wave, idx) => (
          <WaveSegment
            key={wave.id}
            wave={wave}
            waveIndex={idx}
            currentWaveIndex={currentWaveIndex}
            isActive={idx === currentWaveIndex}
            isPast={idx < currentWaveIndex}
          />
        ))}
      </div>
    </div>
  );
}

interface WaveSegmentProps {
  wave: Wave;
  waveIndex: number;
  currentWaveIndex: number;
  isActive: boolean;
  isPast: boolean;
}

function WaveSegment({ wave, isActive, isPast }: WaveSegmentProps) {
  const progress = wave.taskCount > 0
    ? (wave.completedTaskCount / wave.taskCount) * 100
    : 0;

  const getSegmentColor = () => {
    if (wave.status === 'completed') return 'bg-accent-green';
    if (wave.status === 'blocked') return 'bg-accent-red';
    if (isActive) return 'bg-accent-primary';
    if (isPast) return 'bg-accent-amber';
    return 'bg-bg-panel';
  };

  return (
    <div className="flex-1 h-2 bg-bg-panel rounded-sm overflow-hidden relative group">
      <div
        className={cn(
          'h-full transition-all duration-300',
          getSegmentColor()
        )}
        style={{ width: `${progress}%` }}
      />

      {/* Tooltip on hover */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
        <div className="bg-bg-surface border border-border-default rounded px-2 py-1 text-xs whitespace-nowrap shadow-lg">
          <div className="text-text-primary font-medium">Wave {wave.waveIndex + 1}</div>
          <div className="text-text-secondary">
            {wave.completedTaskCount}/{wave.taskCount} tasks
          </div>
          <div className="text-text-muted text-[10px]">
            {wave.status}
          </div>
        </div>
      </div>
    </div>
  );
}

interface CompactWaveProgressProps {
  wavePlan: WavePlan;
  className?: string;
}

export function CompactWaveProgress({ wavePlan, className }: CompactWaveProgressProps) {
  const { currentWaveIndex, totalWaves, completedTasks, totalTasks } = wavePlan;
  const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  // Create ASCII-style progress bar
  const barLength = 5;
  const filledSegments = Math.round((progress / 100) * barLength);
  const progressBar = '█'.repeat(filledSegments) + '░'.repeat(barLength - filledSegments);

  return (
    <div className={cn('flex items-center gap-2 text-xs font-mono', className)}>
      <span className="text-text-secondary">[</span>
      <span className="text-accent-primary">{progressBar}</span>
      <span className="text-text-secondary">]</span>
      <span className="text-text-secondary">
        W{currentWaveIndex + 1}/{totalWaves}
      </span>
      <span className="text-accent-primary">
        {Math.round(progress)}%
      </span>
    </div>
  );
}
