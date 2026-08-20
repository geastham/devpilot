import type { Complexity } from '@devpilot.sh/core/db';

/**
 * A model name in either casing the codebase actually produces.
 *
 * `@devpilot.sh/core/db` declares the enum as 'HAIKU' | 'SONNET' | 'OPUS'
 * (what is stored), while the planner's `ParsedTask.recommendedModel` is
 * 'haiku' | 'sonnet' | 'opus' (what the model writes in its plan table). Both
 * reach these components depending on whether the plan came from the database
 * or straight from a run, and the cockpit's badge silently assumed the lower
 * case one — which typechecked only because the app declared its own `Model`
 * separately from core's.
 *
 * Rather than pick a winner and break one caller, normalise at the edge.
 */
export type ModelName = 'HAIKU' | 'SONNET' | 'OPUS' | 'haiku' | 'sonnet' | 'opus';

/**
 * Presentation helpers the shared components need.
 *
 * Copied from the cockpit's `lib/utils` rather than imported from it: a package
 * that reaches back into the application consuming it is not a package. These
 * are pure and small, and the badge class names they return are defined by the
 * consumer's stylesheet, not here.
 */

export function formatMinutes(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
}

export function getComplexityColor(complexity: Complexity): string {
  const colors: Record<Complexity, string> = {
    S: 'complexity-s',
    M: 'complexity-m',
    L: 'complexity-l',
    XL: 'complexity-xl',
  };
  return colors[complexity];
}

export function getModelColor(model: ModelName): string {
  const colors: Record<string, string> = {
    haiku: 'badge-haiku',
    sonnet: 'badge-sonnet',
    opus: 'badge-opus',
  };
  return colors[model.toLowerCase()] ?? 'badge-sonnet';
}

/** Title-cased for display, from either casing. */
export function modelLabel(model: ModelName): string {
  const lower = model.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Stable hue per string, so the same repo is always the same colour. */
export function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash % 360)}, 70%, 55%)`;
}
