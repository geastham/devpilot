'use client';

import { useState } from 'react';
import { cn, formatMinutes, formatTime } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { RepoBadge, StatusBadge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/progress';
import type { AgentTelemetry, RufloSession } from '@/types';

interface RufloSessionCardProps {
  session: RufloSession;
}

export function RufloSessionCard({ session }: RufloSessionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const telemetry = session.telemetry ?? null;
  const isActive = session.status === 'active';
  const touchedCount = telemetry?.filesTouched?.length ?? 0;

  /** Three minutes of silence after work has started. See `isStalled`. */
  const stalled =
    isActive && (telemetry?.toolCalls ?? 0) > 0 && (telemetry?.idleMs ?? 0) > 180_000;

  const activity = describeAction(telemetry);

  const [stopping, setStopping] = useState(false);
  async function stop() {
    setStopping(true);
    try {
      await fetch(`/api/fleet/sessions/${session.id}/stop`, { method: 'POST' });
    } finally {
      // Left true is fine: the card disappears on the next poll once the
      // session leaves ACTIVE, and a button that re-enables itself invites a
      // second click at a process that is already gone.
      setStopping(false);
    }
  }

  const liveElapsedMinutes =
    typeof telemetry?.elapsedMs === 'number' && telemetry.elapsedMs > 0
      ? Math.round(telemetry.elapsedMs / 60_000)
      : session.elapsedMinutes;

  // Idle warnings are about work ABOUT TO run out, so they apply only to a
  // session that is still running. Deriving them from progress alone made every
  // finished session — necessarily at 100% — shout "IDLE IMMINENT", which is the
  // opposite of true: it is not about to go idle, it is done.
  //
  // Latent until now, because the API filtered terminal sessions out entirely.
  // Surfacing them exposed it.
  const isTerminal = session.status === 'complete' || session.status === 'error';

  const statusVariant = isTerminal
    ? session.status
    : session.progressPercent >= 90
      ? 'idle-imminent'
      : session.progressPercent >= 70
      ? 'needs-spec'
      : session.status;

  const progressVariant =
    statusVariant === 'idle-imminent'
      ? 'danger'
      : statusVariant === 'needs-spec'
      ? 'warning'
      : session.status === 'complete'
      ? 'success'
      : 'default';

  const hasPulse =
    statusVariant === 'idle-imminent' || statusVariant === 'needs-spec';
  const pulseClass =
    statusVariant === 'idle-imminent'
      ? 'pulse-red'
      : statusVariant === 'needs-spec'
      ? 'pulse-amber'
      : '';

  return (
    <Card
      className={cn(
        'transition-all duration-200',
        hasPulse && pulseClass,
        session.status === 'complete' && 'opacity-60',
        session.status === 'error' && 'border-accent-red'
      )}
    >
      <CardContent
        className="p-3 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <RepoBadge repo={session.repo} />
            <span className="text-xs text-text-muted">{session.linearTicketId}</span>
          </div>
        </div>

        {/* Title */}
        <h4 className="text-sm font-medium text-text-primary truncate mb-1">
          {session.ticketTitle}
        </h4>

        {/* Workstream */}
        <p className="text-xs text-text-secondary font-mono mb-2 truncate">
          {session.currentWorkstream}
        </p>

        {/*
          The live readout.

          This card used to show a workstream label and a percentage that was a
          timer in disguise — five percent every ninety seconds. A conductor
          could not tell a working agent from a wedged one. These three lines
          are the difference: what it is touching, how much it has done, and
          whether anything has happened recently.
        */}
        {telemetry && (
          <div className="mb-2 space-y-1.5">
            <div className="flex items-center gap-1.5">
              {/* The pulse is the point: it only animates while work is live,
                  so a frozen dot reads as a frozen agent. */}
              <span
                className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  stalled ? 'bg-accent-amber' : isActive ? 'animate-pulse bg-accent-primary' : 'bg-text-muted'
                )}
              />
              <span className="truncate font-mono text-[11px] text-text-primary">
                {activity}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-text-muted">
              {typeof telemetry.toolCalls === 'number' && telemetry.toolCalls > 0 && (
                <span>{telemetry.toolCalls} calls</span>
              )}
              {touchedCount > 0 && (
                <span className="text-accent-green">
                  {touchedCount} file{touchedCount === 1 ? '' : 's'}
                </span>
              )}
              {typeof telemetry.costUsd === 'number' && telemetry.costUsd > 0 && (
                <span>${telemetry.costUsd.toFixed(3)}</span>
              )}
              {typeof telemetry.turns === 'number' && telemetry.turns > 0 && (
                <span>{telemetry.turns} turns</span>
              )}
            </div>

            {stalled && (
              <p className="text-[10px] text-accent-amber">
                No activity for {Math.round((telemetry.idleMs ?? 0) / 60000)}m — may be stuck
              </p>
            )}
          </div>
        )}

        {/* Progress */}
        <div className="flex items-center gap-3 mb-2">
          <ProgressBar
            value={session.progressPercent}
            variant={progressVariant}
            className="flex-1"
          />
          <span className="text-xs text-text-secondary min-w-[36px]">
            {session.progressPercent}%
          </span>
        </div>

        {/* Stop. The cockpit could show an agent working and offer nothing to
            do about it — a conductor watching a task grind against the wrong
            file could wait twenty minutes or kill the whole runner. */}
        {isActive && (
          <div className="mb-2 flex justify-end">
            <button
              onClick={(e) => {
                e.stopPropagation();
                void stop();
              }}
              disabled={stopping}
              className="text-[10px] text-text-muted transition-colors hover:text-accent-red disabled:opacity-50"
            >
              {stopping ? 'stopping…' : 'stop agent'}
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">
            {/* Prefer the runner's wall clock. `elapsedMinutes` is only written
                on terminal updates, so a running session showed "0m" for its
                entire life — observed at 0m against a real 5.76m. */}
            Elapsed: {formatMinutes(liveElapsedMinutes)}
          </span>
          <StatusBadge status={statusVariant} />
        </div>

        {/* Expanded: Completed Tasks */}
        {isExpanded && session.completedTasks.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border-default">
            <p className="text-xs text-text-muted mb-2">Recent completions:</p>
            <div className="space-y-1">
              {session.completedTasks.slice(0, 3).map((task, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs font-mono text-text-secondary"
                >
                  <span className="text-text-muted">
                    {formatTime(new Date(task.completedAt))}
                  </span>
                  <span className="text-accent-green">✓</span>
                  <span className="truncate">{task.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * A short phrase for the agent's current action.
 *
 * Mirrors `describeActivity` in the session runner rather than importing it —
 * the runner is a CLI package the cockpit does not depend on, and one shared
 * sentence is not worth inverting that.
 */
function describeAction(telemetry: AgentTelemetry | null): string {
  const a = telemetry?.lastAction;
  if (!a) return 'starting up';
  const file = a.path ? a.path.split('/').slice(-1)[0] : undefined;
  switch (a.tool) {
    case 'Write':
      return file ? `writing ${file}` : 'writing';
    case 'Edit':
    case 'MultiEdit':
      return file ? `editing ${file}` : 'editing';
    case 'Read':
      return file ? `reading ${file}` : 'reading';
    case 'Bash':
      return `running ${(telemetry?.commands?.at(-1) ?? '').split(/\s+/)[0] || 'a command'}`;
    case 'Grep':
    case 'Glob':
      return 'searching';
    default:
      return a.tool.toLowerCase();
  }
}
