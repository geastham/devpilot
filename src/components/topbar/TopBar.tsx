'use client';

import { cn, formatHours, getRunwayStatusColor } from '@/lib/utils';
import { useFleetStore, useUIStore } from '@/stores';
import { FleetSummaryPills } from './FleetSummaryPills';
import { ConductorScorePill } from './ConductorScorePill';
import { RunwayIndicator } from './RunwayIndicator';
import { LayoutSwitcher } from './LayoutSwitcher';

export function TopBar() {
  const runwayHours = useFleetStore((state) => state.runwayHours);
  const runwayStatus = useFleetStore((state) => state.runwayStatus);
  const sessions = useFleetStore((state) => state.sessions);
  const conductorScore = useFleetStore((state) => state.conductorScore);

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

      {/* Right: Score & Layout */}
      <div className="flex items-center gap-4">
        <ConductorScorePill score={conductorScore} />
        <LayoutSwitcher />
      </div>
    </header>
  );
}
