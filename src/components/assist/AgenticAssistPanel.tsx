'use client';

import { useEffect } from 'react';
import { cn, formatTime } from '@/lib/utils';
import { useFleetStore, useHorizonStore, useUIStore } from '@/stores';
import { Chip, ChipGroup } from '@/components/ui/chip';
import type { AssistSuggestion } from '@/types';

const typeConfig: Record<
  AssistSuggestion['type'],
  { border: string; icon: string; iconColor: string }
> = {
  urgent: {
    border: 'border-l-accent-red',
    icon: '●',
    iconColor: 'text-accent-red',
  },
  warning: {
    border: 'border-l-accent-amber',
    icon: '⚠',
    iconColor: 'text-accent-amber',
  },
  confirmation: {
    border: 'border-l-accent-green',
    icon: '✓',
    iconColor: 'text-accent-green',
  },
  info: {
    border: 'border-l-accent-primary',
    icon: '→',
    iconColor: 'text-accent-primary',
  },
};

/**
 * Derives assist suggestions from fleet + horizon state per the trigger
 * conditions in DESIGN.md §9.1. Suggestions are deduped by stable id so
 * re-renders don't stack duplicates; resolved conditions are pruned.
 */
export function useAssistTriggers() {
  const sessions = useFleetStore((state) => state.sessions);
  const runwayHours = useFleetStore((state) => state.runwayHours);
  const items = useHorizonStore((state) => state.items);
  const assistSuggestions = useUIStore((state) => state.assistSuggestions);
  const addAssistSuggestion = useUIStore((state) => state.addAssistSuggestion);
  const removeAssistSuggestion = useUIStore(
    (state) => state.removeAssistSuggestion
  );

  useEffect(() => {
    const readyCount = items.filter((item) => item.zone === 'READY').length;
    const shapingItems = items.filter((item) => item.zone === 'SHAPING');
    const existingIds = new Set(assistSuggestions.map((s) => s.id));
    const activeIds = new Set<string>();

    const upsert = (suggestion: AssistSuggestion) => {
      activeIds.add(suggestion.id);
      if (!existingIds.has(suggestion.id)) {
        addAssistSuggestion(suggestion);
      }
    };

    // Trigger: session >= 70% complete with no READY spec queued
    for (const session of sessions) {
      if (session.status !== 'active' || readyCount > 0) continue;

      if (session.progressPercent >= 90) {
        upsert({
          id: `idle-imminent-${session.id}`,
          type: 'urgent',
          message: `${session.linearTicketId} at ${session.progressPercent}% with no READY spec — ${session.repo} will go idle. Promote something now.`,
          chips: [
            { label: session.linearTicketId, type: 'ticket' },
            { label: session.repo, type: 'repo' },
          ],
          timestamp: new Date(),
        });
      } else if (session.progressPercent >= 70) {
        upsert({
          id: `needs-spec-${session.id}`,
          type: 'warning',
          message: `${session.linearTicketId} completing soon — ${session.repo} has a worker freeing up and no READY spec queued.`,
          chips: [
            { label: session.linearTicketId, type: 'ticket' },
            { label: session.repo, type: 'repo' },
          ],
          timestamp: new Date(),
        });
      }
    }

    // Trigger: runway below 4 hours
    if (runwayHours > 0 && runwayHours < 4) {
      const promotable = shapingItems.filter(
        (item) => item.conflictingFiles.length === 0
      );
      upsert({
        id: 'runway-low',
        type: runwayHours < 2 ? 'urgent' : 'warning',
        message: `Runway at ${runwayHours.toFixed(1)}h. ${shapingItems.length} item${shapingItems.length !== 1 ? 's' : ''} in Shaping could be promoted${promotable.length > 0 ? ` — ${promotable[0].title} has no conflicts.` : '.'}`,
        chips: promotable
          .slice(0, 2)
          .map((item) => ({ label: item.id, type: 'ticket' as const })),
        timestamp: new Date(),
      });
    }

    // Prune trigger-derived suggestions whose condition has resolved.
    // Only touch ids this hook owns; event-driven suggestions stay put.
    for (const suggestion of assistSuggestions) {
      const isTriggerDerived =
        suggestion.id.startsWith('needs-spec-') ||
        suggestion.id.startsWith('idle-imminent-') ||
        suggestion.id === 'runway-low';
      if (isTriggerDerived && !activeIds.has(suggestion.id)) {
        removeAssistSuggestion(suggestion.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, runwayHours, items]);
}

interface AgenticAssistPanelProps {
  className?: string;
  /**
   * 'overlay' renders a fixed right slide-in controlled by isAssistPanelOpen;
   * 'inline' renders in normal flow (e.g. Mission Control right column).
   */
  variant?: 'overlay' | 'inline';
}

export function AgenticAssistPanel({
  className,
  variant = 'overlay',
}: AgenticAssistPanelProps) {
  const isAssistPanelOpen = useUIStore((state) => state.isAssistPanelOpen);
  const toggleAssistPanel = useUIStore((state) => state.toggleAssistPanel);
  const suggestions = useUIStore((state) => state.assistSuggestions);
  const removeAssistSuggestion = useUIStore(
    (state) => state.removeAssistSuggestion
  );

  useAssistTriggers();

  if (variant === 'overlay' && !isAssistPanelOpen) return null;

  return (
    <aside
      className={cn(
        'flex flex-col bg-bg-panel',
        variant === 'overlay' &&
          'fixed right-0 top-12 bottom-0 z-40 w-[380px] border-l border-border-default shadow-xl animate-slide-in-top',
        variant === 'inline' && 'h-full',
        className
      )}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border-default bg-bg-panel px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-accent-purple">✦</span>
          <span className="text-sm font-semibold text-text-primary">Assist</span>
          {suggestions.length > 0 && (
            <span className="rounded-full bg-accent-purple/20 px-1.5 py-0.5 text-[10px] font-medium text-accent-purple">
              {suggestions.length}
            </span>
          )}
        </div>
        {variant === 'overlay' && (
          <button
            onClick={toggleAssistPanel}
            className="rounded p-1 text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
            aria-label="Close assist panel"
          >
            ✕
          </button>
        )}
      </div>

      {/* Suggestions */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {suggestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <div className="mb-3 text-3xl opacity-50">✦</div>
            <p className="text-sm font-medium text-text-secondary">
              All clear
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Suggestions appear when the fleet needs your attention
            </p>
          </div>
        ) : (
          suggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              onDismiss={() => removeAssistSuggestion(suggestion.id)}
            />
          ))
        )}
      </div>
    </aside>
  );
}

interface SuggestionCardProps {
  suggestion: AssistSuggestion;
  onDismiss: () => void;
}

function SuggestionCard({ suggestion, onDismiss }: SuggestionCardProps) {
  const config = typeConfig[suggestion.type];

  return (
    <div
      className={cn(
        'rounded-lg border border-border-default border-l-2 bg-bg-surface p-3',
        config.border
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn('text-xs mt-0.5', config.iconColor)}>
          {config.icon}
        </span>
        <p className="flex-1 text-xs text-text-primary leading-relaxed">
          {suggestion.message}
        </p>
        <button
          onClick={onDismiss}
          className="text-text-muted hover:text-text-primary text-xs transition-colors"
          aria-label="Dismiss suggestion"
        >
          ✕
        </button>
      </div>

      {suggestion.chips.length > 0 && (
        <ChipGroup className="mt-2 pl-5">
          {suggestion.chips.map((chip) => (
            <Chip
              key={`${chip.type}-${chip.label}`}
              variant={chip.type}
              onClick={chip.onClick}
            >
              {chip.label}
            </Chip>
          ))}
        </ChipGroup>
      )}

      <div className="mt-2 flex items-center justify-between pl-5">
        <span className="text-[10px] text-text-muted font-mono">
          {formatTime(suggestion.timestamp)}
        </span>
        {suggestion.action && (
          <button
            onClick={suggestion.action.handler}
            className="rounded bg-accent-primary/10 px-2 py-0.5 text-[10px] font-medium text-accent-primary hover:bg-accent-primary/20 transition-colors"
          >
            {suggestion.action.label}
          </button>
        )}
      </div>
    </div>
  );
}
