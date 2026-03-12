'use client';

import { cn } from '@/lib/utils';
import { MiniProgress } from '@/components/ui/progress';
import { useWavePlanStore } from '@/stores';
import type { RufloSession, WavePlan } from '@/types';
import { useState, useEffect } from 'react';

interface FleetSummaryPillsProps {
  sessions: RufloSession[];
}

export function FleetSummaryPills({ sessions }: FleetSummaryPillsProps) {
  const getExecutingWavePlans = useWavePlanStore((state) => state.getExecutingWavePlans);
  const [activeWavePlans, setActiveWavePlans] = useState<WavePlan[]>([]);

  useEffect(() => {
    const unsubscribe = useWavePlanStore.subscribe((state) => {
      setActiveWavePlans(state.getExecutingWavePlans());
    });
    setActiveWavePlans(getExecutingWavePlans());
    return unsubscribe;
  }, [getExecutingWavePlans]);

  // Group sessions by repo
  const sessionsByRepo = sessions.reduce((acc, session) => {
    if (!acc[session.repo]) {
      acc[session.repo] = [];
    }
    acc[session.repo].push(session);
    return acc;
  }, {} as Record<string, RufloSession[]>);

  // Get aggregate progress per repo
  const repoStats = Object.entries(sessionsByRepo).map(([repo, repoSessions]) => {
    const avgProgress =
      repoSessions.reduce((sum, s) => sum + s.progressPercent, 0) /
      repoSessions.length;
    const hasIdleImminent = repoSessions.some(
      (s) => s.status === 'active' && s.progressPercent >= 90
    );
    const hasNeedsSpec = repoSessions.some(
      (s) => s.status === 'active' && s.progressPercent >= 70
    );
    const allComplete = repoSessions.every((s) => s.status === 'complete');

    return {
      repo,
      progress: avgProgress,
      sessionCount: repoSessions.length,
      hasIdleImminent,
      hasNeedsSpec,
      allComplete,
    };
  });

  const hasContent = repoStats.length > 0 || activeWavePlans.length > 0;

  if (!hasContent) {
    return (
      <div className="text-xs text-text-muted">No active sessions</div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {repoStats.map((stat) => (
        <FleetPill key={stat.repo} {...stat} />
      ))}
      {activeWavePlans.map((wavePlan) => (
        <WavePlanPill key={wavePlan.id} wavePlan={wavePlan} />
      ))}
    </div>
  );
}

interface FleetPillProps {
  repo: string;
  progress: number;
  sessionCount: number;
  hasIdleImminent: boolean;
  hasNeedsSpec: boolean;
  allComplete: boolean;
}

function FleetPill({
  repo,
  progress,
  sessionCount,
  hasIdleImminent,
  hasNeedsSpec,
  allComplete,
}: FleetPillProps) {
  const variant = allComplete
    ? 'success'
    : hasIdleImminent
    ? 'danger'
    : hasNeedsSpec
    ? 'warning'
    : 'default';

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-full border px-3 py-1.5',
        'bg-white/5 border-border-default',
        hasIdleImminent && 'border-accent-red/40 shadow-glow-red',
        hasNeedsSpec && !hasIdleImminent && 'border-accent-amber/40'
      )}
    >
      <span className="text-xs text-text-primary">{repo}</span>

      {allComplete ? (
        <span className="text-accent-green">✓</span>
      ) : (
        <>
          <MiniProgress value={progress} variant={variant} />
          <span className="text-xs text-text-secondary">
            {Math.round(progress)}%
          </span>
        </>
      )}
    </div>
  );
}

interface WavePlanPillProps {
  wavePlan: WavePlan;
}

function WavePlanPill({ wavePlan }: WavePlanPillProps) {
  const progress = wavePlan.totalTasks > 0
    ? (wavePlan.completedTasks / wavePlan.totalTasks) * 100
    : 0;

  // Create ASCII-style progress bar
  const barLength = 5;
  const filledSegments = Math.round((progress / 100) * barLength);
  const progressBar = '█'.repeat(filledSegments) + '░'.repeat(barLength - filledSegments);

  const isPaused = wavePlan.status === 'paused';
  const isReoptimizing = wavePlan.status === 're-optimizing';

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono',
        'bg-white/5 border-accent-primary/40',
        isPaused && 'border-accent-amber/40',
        isReoptimizing && 'border-accent-purple/40'
      )}
    >
      <span className="text-xs text-text-primary">
        {isPaused ? '⏸' : isReoptimizing ? '⟳' : '⚡'}
      </span>
      <span className="text-accent-primary text-xs">{progressBar}</span>
      <span className="text-xs text-text-secondary">
        W{wavePlan.currentWaveIndex + 1}/{wavePlan.totalWaves}
      </span>
      <span className="text-xs text-accent-primary">
        {Math.round(progress)}%
      </span>
    </div>
  );
}
