'use client';

import { cn, formatHours, getRunwayStatusColor } from '@/lib/utils';
import { useFleetStore, useUIStore } from '@/stores';
import { FleetSummaryPills } from './FleetSummaryPills';
import { ConductorScorePill } from './ConductorScorePill';
import { RunwayIndicator } from './RunwayIndicator';
import Link from 'next/link';
import { GitBranch } from 'lucide-react';
import { LayoutSwitcher } from './LayoutSwitcher';

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
      <div className="flex items-center justify-center flex-1">
        <FleetSummaryPills sessions={sessions} />
      </div>

      {/* Right: Panels, Score & Layout */}
      <div className="flex items-center gap-4">
        {/* Fleet panel toggle */}
        <button
          onClick={toggleFleetPanel}
          className={cn(
            'rounded-lg p-2 text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors',
            isFleetPanelOpen && 'text-accent-primary bg-white/5'
          )}
          aria-label="Toggle fleet panel"
          title="Fleet Status"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 5a1 1 0 011-1h4a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM12 5a1 1 0 011-1h6a1 1 0 011 1v14a1 1 0 01-1 1h-6a1 1 0 01-1-1V5z"
            />
          </svg>
        </button>

        {/* Assist panel toggle */}
        <button
          onClick={toggleAssistPanel}
          className={cn(
            'relative rounded-lg p-2 text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors',
            isAssistPanelOpen && 'text-accent-purple bg-white/5'
          )}
          aria-label="Toggle assist panel"
          title="Agentic Assist"
        >
          <span className="text-sm leading-none">✦</span>
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
          title="Wave execution"
          className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          <GitBranch className="h-4 w-4" />
        </Link>

        <ConductorScorePill score={conductorScore} />
        <LayoutSwitcher />
      </div>
    </header>
  );
}
