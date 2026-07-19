'use client';

import { WorkHorizonSurface } from '@/components/horizon/WorkHorizonSurface';
import { FleetStatusPanel } from '@/components/fleet';
import { MissionControl } from '@/components/layouts';
import { useUIStore } from '@/stores';

export default function HomePage() {
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
