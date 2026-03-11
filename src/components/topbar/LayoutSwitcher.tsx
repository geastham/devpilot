'use client';

import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores';
import { Dropdown, DropdownItem } from '@/components/ui/dropdown';
import type { LayoutVariant } from '@/types';

const layouts: {
  variant: LayoutVariant;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    variant: 'gradient-strip',
    label: 'Gradient Strip',
    description: 'Default — 4-zone horizontal flow',
    icon: <GradientStripIcon />,
  },
  {
    variant: 'mission-control',
    label: 'Mission Control',
    description: 'Full density — fleet + horizon + feed',
    icon: <MissionControlIcon />,
  },
  {
    variant: 'three-panel',
    label: 'Three Panel',
    description: 'NOW / NEXT / THINK',
    icon: <ThreePanelIcon />,
  },
  {
    variant: 'timeline',
    label: 'Runway Timeline',
    description: 'Temporal view — Gantt tracks + queue',
    icon: <TimelineIcon />,
  },
];

export function LayoutSwitcher() {
  const layoutVariant = useUIStore((state) => state.layoutVariant);
  const setLayoutVariant = useUIStore((state) => state.setLayoutVariant);

  const currentLayout = layouts.find((l) => l.variant === layoutVariant);

  return (
    <Dropdown
      trigger={
        <button className="flex items-center gap-1.5 rounded-lg p-2 text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors">
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
            />
          </svg>
        </button>
      }
      align="right"
    >
      <div className="w-64 py-1">
        {layouts.map((layout) => (
          <DropdownItem
            key={layout.variant}
            onClick={() => setLayoutVariant(layout.variant)}
            selected={layout.variant === layoutVariant}
            className="flex items-start gap-3 px-3 py-2"
          >
            <div className="mt-0.5 w-10 h-6 rounded bg-bg-panel border border-border-default overflow-hidden flex-shrink-0">
              {layout.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-text-primary">
                {layout.label}
              </div>
              <div className="text-xs text-text-muted truncate">
                {layout.description}
              </div>
            </div>
          </DropdownItem>
        ))}
      </div>
    </Dropdown>
  );
}

// Layout preview icons
function GradientStripIcon() {
  return (
    <div className="flex h-full w-full">
      <div className="flex-[30] bg-white/20" />
      <div className="flex-[25] bg-zone-refining/30" />
      <div className="flex-[25] bg-zone-shaping/30" />
      <div className="flex-[20] bg-zone-directional/30" />
    </div>
  );
}

function MissionControlIcon() {
  return (
    <div className="flex h-full w-full flex-col">
      <div className="h-1 bg-white/20" />
      <div className="flex flex-1">
        <div className="w-2 bg-white/10" />
        <div className="flex-1 bg-white/5" />
        <div className="w-2 bg-white/10" />
      </div>
    </div>
  );
}

function ThreePanelIcon() {
  return (
    <div className="flex h-full w-full gap-px">
      <div className="flex-1 bg-white/20" />
      <div className="flex-1 bg-white/15" />
      <div className="flex-1 bg-white/10" />
    </div>
  );
}

function TimelineIcon() {
  return (
    <div className="flex h-full w-full flex-col gap-px">
      <div className="flex-1 bg-white/15 flex items-center px-0.5">
        <div className="h-0.5 w-full bg-accent-primary/50 rounded" />
      </div>
      <div className="flex-1 bg-white/10 flex items-center px-0.5">
        <div className="h-0.5 w-3/4 bg-accent-green/50 rounded" />
      </div>
    </div>
  );
}
