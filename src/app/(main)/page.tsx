'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { WorkHorizonSurface } from '@/components/horizon/WorkHorizonSurface';
import { FleetStatusPanel } from '@/components/fleet';
import { MissionControl } from '@/components/layouts';
import { useUIStore } from '@/stores';

/**
 * `/?item=<horizonItemId>` opens that card's review panel.
 *
 * The bridge tells Linear "on the board as <id>" while a run is planning, and a
 * raw id is not somewhere you can go. This is the target those links point at:
 * arriving here should put you in front of the thing the ticket is talking
 * about, not a board you then have to search.
 */
function DeepLink() {
  const searchParams = useSearchParams();
  const itemId = searchParams.get('item');
  const openConfidencePanel = useUIStore((s) => s.openConfidencePanel);

  useEffect(() => {
    if (!itemId) return;
    openConfidencePanel(itemId);
  }, [itemId, openConfidencePanel]);

  return null;
}

function HomeContent() {
  const layoutVariant = useUIStore((state) => state.layoutVariant);
  const isFleetPanelOpen = useUIStore((state) => state.isFleetPanelOpen);

  // Mission Control is a full-surface layout with its own fleet column.
  // Remaining variants (three-panel, timeline) fall back to the gradient
  // strip until they're built.
  if (layoutVariant === 'mission-control') {
    return <MissionControl />;
  }

  return (
    <div className="flex h-full">
      {isFleetPanelOpen && (
        <FleetStatusPanel className="w-[280px] flex-shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <WorkHorizonSurface />
      </div>
    </div>
  );
}


export default function HomePage() {
  return (
    <>
      {/* Suspense because `useSearchParams` opts its tree into client
          rendering; without a boundary `next build` fails while dev and tsc
          both look fine. */}
      <Suspense fallback={null}>
        <DeepLink />
      </Suspense>
      <HomeContent />
    </>
  );
}
