'use client';

import { cn } from '@/lib/utils';
import type { HorizonItem, Zone } from '@/types';
import { ReadyCard } from './ReadyCard';
import { RefiningCard } from './RefiningCard';
import { ShapingTile } from './ShapingTile';
import { DirectionalRow } from './DirectionalRow';

interface HorizonZoneProps {
  zone: Zone;
  items: HorizonItem[];
  className?: string;
}

const zoneConfig: Record<
  Zone,
  {
    label: string;
    bgClass: string;
    headerClass: string;
  }
> = {
  READY: {
    label: 'READY',
    bgClass: 'bg-bg-base',
    headerClass: 'text-zone-ready border-zone-ready/30',
  },
  REFINING: {
    label: 'REFINING',
    bgClass: 'bg-bg-base/95',
    headerClass: 'text-zone-refining border-zone-refining/30',
  },
  SHAPING: {
    label: 'SHAPING',
    bgClass: 'bg-bg-base/90',
    headerClass: 'text-zone-shaping border-zone-shaping/30',
  },
  DIRECTIONAL: {
    label: 'DIRECTIONAL',
    bgClass: 'bg-bg-base/85',
    headerClass: 'text-zone-directional border-zone-directional/30',
  },
};

export function HorizonZone({ zone, items, className }: HorizonZoneProps) {
  const config = zoneConfig[zone];

  const renderItem = (item: HorizonItem) => {
    switch (zone) {
      case 'READY':
        return <ReadyCard key={item.id} item={item} />;
      case 'REFINING':
        return <RefiningCard key={item.id} item={item} />;
      case 'SHAPING':
        return <ShapingTile key={item.id} item={item} />;
      case 'DIRECTIONAL':
        return <DirectionalRow key={item.id} item={item} />;
    }
  };

  return (
    <div
      className={cn(
        'flex flex-col border-r border-border-default last:border-r-0',
        config.bgClass,
        className
      )}
    >
      {/* Zone Header */}
      <div
        className={cn(
          'sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3',
          config.headerClass,
          config.bgClass
        )}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tracking-wider">
            {config.label}
          </span>
          <span className="rounded-full bg-current/10 px-2 py-0.5 text-xs">
            {items.length}
          </span>
        </div>
      </div>

      {/* Zone Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {items.length === 0 ? (
          <ZoneEmptyState zone={zone} />
        ) : (
          items
            .sort((a, b) => a.priority - b.priority)
            .map(renderItem)
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Empty State
// ============================================================================

function ZoneEmptyState({ zone }: { zone: Zone }) {
  const config: Record<Zone, { icon: string; title: string; subtitle: string }> = {
    READY: {
      icon: '🚀',
      title: 'Nothing ready to launch',
      subtitle: 'Promote items from Refining to keep your fleet fed.',
    },
    REFINING: {
      icon: '🔍',
      title: 'No plans under review',
      subtitle: 'Shape an idea to trigger plan generation.',
    },
    SHAPING: {
      icon: '🏺',
      title: 'Nothing being shaped',
      subtitle: 'Promote a directional idea to start planning.',
    },
    DIRECTIONAL: {
      icon: '🧭',
      title: 'Capture your next idea',
      subtitle: 'Use Quick Capture below to add a rough thought.',
    },
  };

  const { icon, title, subtitle } = config[zone];

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-3 text-3xl opacity-50">{icon}</div>
      <p className="text-sm font-medium text-text-secondary">{title}</p>
      <p className="mt-1 text-xs text-text-muted max-w-[200px]">{subtitle}</p>
    </div>
  );
}
