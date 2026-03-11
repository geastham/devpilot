'use client';

import { cn } from '@/lib/utils';
import type { ConductorScore } from '@/types';

interface ConductorScorePillProps {
  score: ConductorScore;
}

export function ConductorScorePill({ score }: ConductorScorePillProps) {
  const { total } = score;

  // Determine score tier for styling
  const tier = total >= 800 ? 'high' : total >= 500 ? 'medium' : 'low';

  const tierStyles = {
    high: 'bg-gradient-to-r from-purple-600 to-purple-500 shadow-glow-purple',
    medium: 'bg-purple-700',
    low: 'bg-purple-900 text-accent-amber',
  };

  return (
    <button
      className={cn(
        'flex items-center gap-2 rounded-full px-3 py-1.5 transition-all',
        'hover:scale-105',
        tierStyles[tier]
      )}
      title="Click to view score breakdown"
    >
      <span className="text-xs text-white/80">Score:</span>
      <span className="text-sm font-bold text-white">{total}</span>
    </button>
  );
}
