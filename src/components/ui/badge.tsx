'use client';

import { cn, getComplexityColor, getModelColor, stringToColor } from '@/lib/utils';
import type { Complexity, Model } from '@/types';

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
  model: Model;
  className?: string;
}

export function ModelBadge({ model, className }: ModelBadgeProps) {
  const label = model.charAt(0).toUpperCase() + model.slice(1);

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

export function RepoBadge({ repo, className }: RepoBadgeProps) {
  const color = stringToColor(repo);

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white',
        className
      )}
      style={{ backgroundColor: color }}
    >
      {repo}
    </span>
  );
}

// ============================================================================
// Status Badge
// ============================================================================

interface StatusBadgeProps {
  status: 'active' | 'needs-spec' | 'idle-imminent' | 'complete' | 'error';
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = {
    active: {
      label: 'active',
      dotClass: 'bg-accent-primary',
      textClass: 'text-accent-primary',
    },
    'needs-spec': {
      label: 'NEXT SPEC NEEDED',
      dotClass: 'bg-accent-amber animate-pulse-dot',
      textClass: 'text-accent-amber',
    },
    'idle-imminent': {
      label: 'IDLE IMMINENT',
      dotClass: 'bg-accent-red animate-pulse-dot',
      textClass: 'text-accent-red font-semibold',
    },
    complete: {
      label: 'complete',
      dotClass: 'bg-accent-green',
      textClass: 'text-accent-green',
    },
    error: {
      label: 'ERROR',
      dotClass: 'bg-accent-red',
      textClass: 'text-accent-red font-semibold',
    },
  };

  const { label, dotClass, textClass } = config[status];

  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-xs', className)}
    >
      <span className={cn('h-2 w-2 rounded-full', dotClass)} />
      <span className={textClass}>{label}</span>
    </span>
  );
}

// ============================================================================
// Zone Badge
// ============================================================================

interface ZoneBadgeProps {
  zone: 'READY' | 'REFINING' | 'SHAPING' | 'DIRECTIONAL';
  count?: number;
  className?: string;
}

export function ZoneBadge({ zone, count, className }: ZoneBadgeProps) {
  const config = {
    READY: {
      bg: 'bg-zone-ready',
      text: 'text-bg-base',
    },
    REFINING: {
      bg: 'bg-zone-refining/20',
      text: 'text-zone-refining',
    },
    SHAPING: {
      bg: 'bg-zone-shaping/20',
      text: 'text-zone-shaping',
    },
    DIRECTIONAL: {
      bg: 'bg-zone-directional/20',
      text: 'text-zone-directional',
    },
  };

  const { bg, text } = config[zone];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium',
        bg,
        text,
        className
      )}
    >
      {zone}
      {count !== undefined && (
        <span className="rounded-full bg-current/20 px-1.5 text-[10px]">
          {count}
        </span>
      )}
    </span>
  );
}
