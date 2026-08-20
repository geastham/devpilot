/**
 * Model and complexity badges, copied from the cockpit app.
 *
 * `RepoBadge` deliberately stayed behind: it renders an application concept
 * (which repository a card belongs to) and pulls app types with it. These two
 * describe a *task*, which is what this package is about.
 */
import { cn } from '../cn';
import { getComplexityColor, getModelColor } from '../format';
import type { Complexity } from '@devpilot.sh/core/db';
import type { ModelName } from '../format';
import { modelLabel } from '../format';

// ============================================================================
// Base Badge
// ============================================================================

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'outline';
}

export function Badge({ children, className, variant = 'default' }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium',
        variant === 'outline'
          ? 'border border-border-default bg-transparent'
          : 'bg-bg-surface',
        className
      )}
    >
      {children}
    </span>
  );
}

// ============================================================================
// Model Badge
// ============================================================================

interface ModelBadgeProps {
  model: ModelName;
  className?: string;
}

export function ModelBadge({ model, className }: ModelBadgeProps) {
  // Either casing arrives here; see ModelName.
  const label = modelLabel(model);

  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium text-white',
        getModelColor(model),
        className
      )}
    >
      {label}
    </span>
  );
}

// ============================================================================
// Complexity Badge
// ============================================================================

interface ComplexityBadgeProps {
  complexity: Complexity;
  className?: string;
}

export function ComplexityBadge({ complexity, className }: ComplexityBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded px-1.5 py-0.5 text-xs font-semibold min-w-[24px]',
        getComplexityColor(complexity),
        className
      )}
    >
      {complexity}
    </span>
  );
}

// ============================================================================
// Repo Badge
// ============================================================================

interface RepoBadgeProps {
  repo: string;
  className?: string;
}

