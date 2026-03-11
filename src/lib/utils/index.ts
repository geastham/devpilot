import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Complexity, Model, Zone, SessionStatus, RunwayStatus } from '@/types';

/**
 * Merge Tailwind classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format currency in USD
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format hours as "Xh" or "Xh Ym"
 */
export function formatHours(hours: number): string {
  if (hours >= 1) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const minutes = Math.round(hours * 60);
  return `${minutes}m`;
}

/**
 * Format minutes as "Xm" or "Xh Ym"
 */
export function formatMinutes(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
}

/**
 * Get color class for complexity badge
 */
export function getComplexityColor(complexity: Complexity): string {
  const colors: Record<Complexity, string> = {
    S: 'complexity-s',
    M: 'complexity-m',
    L: 'complexity-l',
    XL: 'complexity-xl',
  };
  return colors[complexity];
}

/**
 * Get color class for model badge
 */
export function getModelColor(model: Model): string {
  const colors: Record<Model, string> = {
    haiku: 'badge-haiku',
    sonnet: 'badge-sonnet',
    opus: 'badge-opus',
  };
  return colors[model];
}

/**
 * Get zone-specific card class
 */
export function getZoneCardClass(zone: Zone): string {
  const classes: Record<Zone, string> = {
    READY: 'card-ready',
    REFINING: 'card-refining',
    SHAPING: 'card-shaping',
    DIRECTIONAL: 'card-directional',
  };
  return classes[zone];
}

/**
 * Get status indicator class
 */
export function getStatusClass(status: SessionStatus): string {
  const classes: Record<SessionStatus, string> = {
    active: 'status-active',
    'needs-spec': 'status-needs-spec',
    complete: 'status-complete',
    error: 'status-error',
  };
  return classes[status];
}

/**
 * Get runway status color
 */
export function getRunwayStatusColor(status: RunwayStatus): string {
  const colors: Record<RunwayStatus, string> = {
    healthy: 'text-accent-green',
    amber: 'text-accent-amber',
    critical: 'text-accent-red',
  };
  return colors[status];
}

/**
 * Calculate runway status from hours
 */
export function getRunwayStatusFromHours(hours: number): RunwayStatus {
  if (hours >= 4) return 'healthy';
  if (hours >= 2) return 'amber';
  return 'critical';
}

/**
 * Generate a consistent color from a string (for repo badges)
 */
export function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Generate a hue based on the hash
  const hue = Math.abs(hash % 360);

  // Use fixed saturation and lightness for consistency
  return `hsl(${hue}, 70%, 55%)`;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Format relative time (e.g., "2 min ago")
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay === 1) return 'yesterday';
  return `${diffDay} days ago`;
}

/**
 * Format time as HH:MM
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * Calculate savings percentage
 */
export function calculateSavingsPercent(actual: number, baseline: number): number {
  if (baseline === 0) return 0;
  return Math.round(((baseline - actual) / baseline) * 100);
}
