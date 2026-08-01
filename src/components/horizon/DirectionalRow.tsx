'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useHorizonStore } from '@/stores';
import { RepoBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dropdown, DropdownItem } from '@/components/ui/dropdown';
import type { HorizonItem, Zone } from '@/types';

interface DirectionalRowProps {
  item: HorizonItem;
}

export function DirectionalRow({ item }: DirectionalRowProps) {
  const [isHovered, setIsHovered] = useState(false);
  const promoteItem = useHorizonStore((state) => state.promoteItem);
  const setSelectedItem = useHorizonStore((state) => state.setSelectedItem);
  const selectedItemId = useHorizonStore((state) => state.selectedItemId);

  const isSelected = selectedItemId === item.id;

  const handlePromote = (targetZone: Zone) => {
    promoteItem(item.id, targetZone);
  };

  return (
    <div
      className={cn(
        'group relative rounded-lg px-3 py-2 transition-all duration-150',
        'hover:bg-white/5',
        isSelected && 'bg-white/10'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => setSelectedItem(item.id)}
    >
      {/* Title — owns the full row width. DIRECTIONAL is the narrowest zone
          (20% of the surface), so sharing a line with the repo badge left
          nothing but an ellipsis. */}
      <span className="block text-sm text-text-secondary line-clamp-2">
        {item.title}
      </span>

      {/* Meta row */}
      <div className="mt-1.5 flex items-center">
        <RepoBadge
          repo={item.repo}
          className="max-w-full truncate text-[10px] px-2 py-0"
        />
      </div>

      {/* Promote button — absolutely positioned so the hidden state reserves no
          width. In flow it ate ~85px of this narrow column and clipped the
          repo badge. */}
      <div
        className={cn(
          'absolute bottom-2 right-3 transition-opacity duration-150',
          isHovered || isSelected
            ? 'opacity-100'
            : 'pointer-events-none opacity-0'
        )}
      >
        <Dropdown
          trigger={
            <Button variant="ghost" size="sm" className="text-xs h-7">
              → Promote
            </Button>
          }
          align="right"
        >
          <DropdownItem onClick={() => handlePromote('SHAPING')}>
            Shaping
          </DropdownItem>
          <DropdownItem onClick={() => handlePromote('REFINING')}>
            Refining
          </DropdownItem>
        </Dropdown>
      </div>
    </div>
  );
}
