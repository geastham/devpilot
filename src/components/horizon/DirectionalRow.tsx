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
        'group flex items-center justify-between rounded-lg px-3 py-2 transition-all duration-150',
        'hover:bg-white/5',
        isSelected && 'bg-white/10'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => setSelectedItem(item.id)}
    >
      {/* Title */}
      <span className="text-sm text-text-secondary truncate flex-1 mr-2">
        {item.title}
      </span>

      {/* Right Side */}
      <div className="flex items-center gap-2">
        <RepoBadge repo={item.repo} className="text-[10px] px-2 py-0" />

        {/* Promote Button */}
        <div
          className={cn(
            'transition-opacity duration-150',
            isHovered || isSelected ? 'opacity-100' : 'opacity-0'
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
    </div>
  );
}
