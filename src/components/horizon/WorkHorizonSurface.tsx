'use client';

import { useHorizonStore } from '@/stores';
import { HorizonZone } from './HorizonZone';
import { HorizonFlowRail } from './HorizonFlowRail';
import type { Zone } from '@/types';

const zones: { zone: Zone; width: string }[] = [
  { zone: 'READY', width: 'w-[30%]' },
  { zone: 'REFINING', width: 'w-[25%]' },
  { zone: 'SHAPING', width: 'w-[25%]' },
  { zone: 'DIRECTIONAL', width: 'w-[20%]' },
];

export function WorkHorizonSurface() {
  const items = useHorizonStore((state) => state.items);

  return (
    <div className="flex h-full flex-col">
      <HorizonFlowRail />

      <div className="flex min-h-0 flex-1">
        {zones.map(({ zone, width }) => {
          const zoneItems = items.filter((item) => item.zone === zone);

          return (
            <HorizonZone
              key={zone}
              zone={zone}
              items={zoneItems}
              className={width}
            />
          );
        })}
      </div>
    </div>
  );
}
