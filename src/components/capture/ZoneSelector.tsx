'use client';

import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores';
import type { Zone } from '@/types';

const zones: { zone: Zone; label: string }[] = [
  { zone: 'DIRECTIONAL', label: '+ Directional' },
  { zone: 'SHAPING', label: 'Shaping' },
  { zone: 'REFINING', label: 'Refining' },
];

export function ZoneSelector() {
  const quickCaptureZone = useUIStore((state) => state.quickCaptureZone);
  const setQuickCaptureZone = useUIStore((state) => state.setQuickCaptureZone);

  return (
    <div className="flex items-center gap-1">
      {zones.map(({ zone, label }) => {
        const isSelected = quickCaptureZone === zone;

        return (
          <button
            key={zone}
            onClick={() => setQuickCaptureZone(zone as 'DIRECTIONAL' | 'SHAPING' | 'REFINING')}
            className={cn(
              'rounded-full px-2.5 py-0.5 text-xs font-medium transition-all',
              isSelected
                ? 'bg-white/10 text-text-primary'
                : 'text-text-muted hover:text-text-secondary'
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
