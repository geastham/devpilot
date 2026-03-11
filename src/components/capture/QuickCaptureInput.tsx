'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useHorizonStore, useUIStore } from '@/stores';
import { Button } from '@/components/ui/button';
import { Chip, ChipGroup } from '@/components/ui/chip';
import { ZoneSelector } from './ZoneSelector';
import type { Zone } from '@/types';

export function QuickCaptureInput() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const quickCaptureValue = useUIStore((state) => state.quickCaptureValue);
  const quickCaptureZone = useUIStore((state) => state.quickCaptureZone);
  const setQuickCaptureValue = useUIStore((state) => state.setQuickCaptureValue);
  const cycleQuickCaptureZone = useUIStore((state) => state.cycleQuickCaptureZone);
  const inlineResponse = useUIStore((state) => state.inlineResponse);
  const inlineResponseChips = useUIStore((state) => state.inlineResponseChips);
  const setInlineResponse = useUIStore((state) => state.setInlineResponse);
  const clearInlineResponse = useUIStore((state) => state.clearInlineResponse);

  const addItem = useHorizonStore((state) => state.addItem);

  // Auto-clear inline response after 8 seconds
  useEffect(() => {
    if (inlineResponse) {
      const timer = setTimeout(() => {
        clearInlineResponse();
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [inlineResponse, clearInlineResponse]);

  const handleSubmit = () => {
    if (!quickCaptureValue.trim()) return;

    // Start launch animation
    setIsAnimating(true);

    // Add item to store
    addItem(quickCaptureValue.trim(), quickCaptureZone, 'ng-pipelines'); // Default repo for demo

    // Clear input
    setQuickCaptureValue('');

    // Show inline response
    setInlineResponse(
      `→ Added to ${quickCaptureZone}. ng-core has 1 worker freeing soon — 2 related items in horizon.`,
      [
        { label: 'ENG-388', type: 'ticket' },
        { label: 'ng-core', type: 'repo' },
      ]
    );

    // End animation after delay
    setTimeout(() => {
      setIsAnimating(false);
    }, 300);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      cycleQuickCaptureZone();
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col items-center pb-6 px-4 pointer-events-none">
      {/* Inline Response */}
      {inlineResponse && (
        <div className="mb-2 w-full max-w-2xl pointer-events-auto animate-slide-in-top">
          <div className="flex items-center gap-3 rounded-lg bg-bg-surface/90 backdrop-blur-md border border-border-default px-4 py-3">
            <span className="text-accent-purple">✦</span>
            <span className="flex-1 text-sm text-text-primary">{inlineResponse}</span>
            <ChipGroup>
              {inlineResponseChips.map((chip) => (
                <Chip key={chip.label} variant={chip.type}>
                  {chip.label}
                </Chip>
              ))}
            </ChipGroup>
          </div>
        </div>
      )}

      {/* Main Input */}
      <div className="w-full max-w-2xl pointer-events-auto">
        <div className="rounded-xl bg-bg-surface/90 backdrop-blur-md border border-border-default shadow-panel p-3">
          {/* Launch animation overlay */}
          {isAnimating && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-text-primary animate-item-launch">
                {quickCaptureValue}
              </span>
            </div>
          )}

          {/* Input Row */}
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              id="quick-capture-input"
              type="text"
              value={quickCaptureValue}
              onChange={(e) => setQuickCaptureValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What needs to happen next..."
              className={cn(
                'flex-1 bg-transparent text-text-primary placeholder:text-text-muted',
                'text-base outline-none border-0 focus:ring-0',
                isAnimating && 'opacity-0'
              )}
            />
            <Button size="sm" onClick={handleSubmit} disabled={!quickCaptureValue.trim()}>
              Add
            </Button>
          </div>

          {/* Zone Selector Row */}
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs text-text-muted">Zone:</span>
            <ZoneSelector />
            <span className="ml-auto text-xs text-text-muted">
              Tab to cycle · Enter to submit
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
