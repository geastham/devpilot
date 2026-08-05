'use client';

import { FleetStatusPanel, ActivityFeed } from '@/components/fleet';
import { WorkHorizonSurface } from '@/components/horizon';
import { AgenticAssistPanel } from '@/components/assist';

/**
 * Mission Control layout — DESIGN.md §5.1 Variant B.
 *
 * Full-viewport CSS grid, no outer scroll:
 *   left    — Fleet Status (Ruflo session rows)
 *   center  — Work Horizon
 *   right   — Activity Feed + Agentic Assist (wide viewports only)
 *
 * The top strip (runway / pills / score) is provided by the global TopBar.
 *
 * RESPONSIVE, not fixed 20/55/25. At 1568px those percentages left the four
 * horizon zones ~215px each — titles wrapped to three lines and the activity
 * feed clipped its own text mid-word. The horizon is the point of this screen,
 * so it gets a floor: below 1600px the Activity/Assist column drops rather than
 * every column getting squeezed. Nothing is lost — Activity is still one click
 * away in the default layout.
 */
export function MissionControl() {
  return (
    <div className="grid h-full grid-cols-[minmax(220px,18%)_1fr] overflow-hidden 2xl:grid-cols-[minmax(240px,18%)_1fr_minmax(320px,24%)]">
      {/* Left: Fleet Status */}
      <FleetStatusPanel className="min-h-0" />

      {/* Center: Work Horizon */}
      <div className="min-h-0 overflow-hidden border-r border-border-default">
        <WorkHorizonSurface />
      </div>

      {/* Right: Activity Feed + Assist — wide viewports only. */}
      <div className="hidden min-h-0 grid-rows-2 2xl:grid">
        <ActivityFeed className="min-h-0 border-b border-border-default" />
        <AgenticAssistPanel variant="inline" className="min-h-0" />
      </div>
    </div>
  );
}
