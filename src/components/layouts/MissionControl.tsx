'use client';

import { FleetStatusPanel, ActivityFeed } from '@/components/fleet';
import { WorkHorizonSurface } from '@/components/horizon';
import { AgenticAssistPanel } from '@/components/assist';

/**
 * Mission Control layout — DESIGN.md §5.1 Variant B.
 *
 * Full-viewport CSS grid, no outer scroll:
 *   left (20%)  — Fleet Status (Ruflo session rows)
 *   center (55%) — Work Horizon
 *   right (25%)  — Activity Feed + Agentic Assist
 *
 * The top strip (runway / pills / score) is provided by the global TopBar.
 */
export function MissionControl() {
  return (
    <div className="grid h-full grid-cols-[20%_55%_25%] overflow-hidden">
      {/* Left: Fleet Status */}
      <FleetStatusPanel className="min-h-0" />

      {/* Center: Work Horizon */}
      <div className="min-h-0 overflow-hidden border-r border-border-default">
        <WorkHorizonSurface />
      </div>

      {/* Right: Activity Feed + Assist */}
      <div className="grid min-h-0 grid-rows-2">
        <ActivityFeed className="min-h-0 border-b border-border-default" />
        <AgenticAssistPanel variant="inline" className="min-h-0" />
      </div>
    </div>
  );
}
