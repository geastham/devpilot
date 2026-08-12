'use client';

import { cn } from '@/lib/utils';
import { useFleetStore, useUIStore } from '@/stores';
import { FleetSummaryPills } from './FleetSummaryPills';
import { ConductorScorePill } from './ConductorScorePill';
import { RunwayIndicator } from './RunwayIndicator';
import Link from 'next/link';
import { GitBranch, Columns2, Sparkles } from 'lucide-react';
import { LayoutSwitcher } from './LayoutSwitcher';

/**
 * The top-right cluster was four unlabelled glyphs — a two-rectangle icon, a
 * sparkle, a branch, and a grid — with the destinations only in `title`
 * attributes. Nothing about a panel toggle is guessable from a shape, and three
 * of the four open surfaces most people have never seen. They carry text now.
 *
 * The labels hide below `lg` so the centre fleet pills keep their room on
 * narrow viewports; the icons and `aria-label`s survive at every width.
 */
export function TopBar() {
  const runwayHours = useFleetStore((state) => state.runwayHours);
  const runwayStatus = useFleetStore((state) => state.runwayStatus);
  const sessions = useFleetStore((state) => state.sessions);
  const conductorScore = useFleetStore((state) => state.conductorScore);
  const isFleetPanelOpen = useUIStore((state) => state.isFleetPanelOpen);
  const toggleFleetPanel = useUIStore((state) => state.toggleFleetPanel);
  const isAssistPanelOpen = useUIStore((state) => state.isAssistPanelOpen);
  const toggleAssistPanel = useUIStore((state) => state.toggleAssistPanel);
  const suggestionCount = useUIStore((state) => state.assistSuggestions.length);

  return (
    <header className="sticky top-0 z-50 flex h-12 items-center justify-between border-b border-border-default bg-bg-panel px-4">
      {/* Left: Logo & Runway */}
      <div className="flex items-center gap-6">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <span className="text-accent-primary text-lg">⧡</span>
          <span className="text-sm font-semibold text-text-primary">DevPilot</span>
        </div>

        {/* Runway Indicator */}
        <RunwayIndicator hours={runwayHours} status={runwayStatus} />
      </div>

      {/* Center: Fleet Summary Pills */}
      <div className="flex min-w-0 flex-1 items-center justify-center overflow-hidden">
        <FleetSummaryPills sessions={sessions} />
      </div>

      {/* Right: Panels, Score & Layout */}
      <div className="flex items-center gap-1">
        {/* Fleet panel toggle */}
        <button
          onClick={toggleFleetPanel}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary',
            isFleetPanelOpen && 'bg-white/5 text-accent-primary'
          )}
          aria-label="Toggle fleet panel"
          title="Fleet Status — the sessions your READY work is dispatched into"
        >
          <Columns2 className="h-4 w-4 shrink-0" />
          <span className="hidden text-xs lg:inline">Fleet</span>
        </button>

        {/* Assist panel toggle */}
        <button
          onClick={toggleAssistPanel}
          className={cn(
            'relative flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary',
            isAssistPanelOpen && 'bg-white/5 text-accent-purple'
          )}
          aria-label={
            suggestionCount > 0
              ? `Toggle assist panel, ${suggestionCount} suggestions`
              : 'Toggle assist panel'
          }
          title="Agentic Assist — suggestions for what to plan next"
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          <span className="hidden text-xs lg:inline">Assist</span>
          {suggestionCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent-purple text-[9px] font-semibold text-white">
              {suggestionCount > 9 ? '9+' : suggestionCount}
            </span>
          )}
        </button>

        {/* The wave planner had no entry point anywhere in the UI — engine,
            API and components all existed with no way to reach them. */}
        <Link
          href="/waves"
          title="Waves — the dependency graph an executing plan is running through"
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-text-secondary transition-colors hover:bg-white/5 hover:text-text-primary"
        >
          <GitBranch className="h-4 w-4 shrink-0" />
          <span className="hidden text-xs lg:inline">Waves</span>
        </Link>

        <div className="ml-2 flex items-center gap-2">
          <ConductorScorePill score={conductorScore} />
          <LayoutSwitcher />
        </div>
      </div>
    </header>
  );
}
