'use client';

import { cn } from '@/lib/utils';

// ============================================================================
// Progress Bar
// ============================================================================

interface ProgressBarProps {
  value: number; // 0-100
  className?: string;
  barClassName?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'success' | 'warning' | 'danger';
  showLabel?: boolean;
}

export function ProgressBar({
  value,
  className,
  barClassName,
  size = 'md',
  variant = 'default',
  showLabel = false,
}: ProgressBarProps) {
  const clampedValue = Math.min(100, Math.max(0, value));

  const sizes = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  };

  const variants = {
    default: 'bg-accent-primary',
    success: 'bg-accent-green',
    warning: 'bg-accent-amber',
    danger: 'bg-accent-red',
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn(
          'w-full overflow-hidden rounded-full bg-bg-panel',
          sizes[size]
        )}
      >
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            variants[variant],
            barClassName
          )}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-text-secondary min-w-[36px]">
          {Math.round(clampedValue)}%
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Progress Ring
// ============================================================================

interface ProgressRingProps {
  value: number; // 0-100
  size?: number;
  strokeWidth?: number;
  className?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  showLabel?: boolean;
}

export function ProgressRing({
  value,
  size = 40,
  strokeWidth = 4,
  className,
  variant = 'default',
  showLabel = true,
}: ProgressRingProps) {
  const clampedValue = Math.min(100, Math.max(0, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (clampedValue / 100) * circumference;

  const variants = {
    default: 'stroke-accent-primary',
    success: 'stroke-accent-green',
    warning: 'stroke-accent-amber',
    danger: 'stroke-accent-red',
  };

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        className="transform -rotate-90"
        width={size}
        height={size}
      >
        {/* Background circle */}
        <circle
          className="stroke-bg-panel"
          fill="none"
          strokeWidth={strokeWidth}
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        {/* Progress circle */}
        <circle
          className={cn(
            'transition-all duration-300',
            variants[variant]
          )}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
      </svg>
      {showLabel && (
        <span className="absolute text-xs font-medium">
          {Math.round(clampedValue)}%
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Mini Progress (for top bar pills)
// ============================================================================

interface MiniProgressProps {
  value: number;
  className?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

export function MiniProgress({
  value,
  className,
  variant = 'default',
}: MiniProgressProps) {
  const clampedValue = Math.min(100, Math.max(0, value));
  const segments = 5;
  const filledSegments = Math.round((clampedValue / 100) * segments);

  const variants = {
    default: 'bg-accent-primary',
    success: 'bg-accent-green',
    warning: 'bg-accent-amber',
    danger: 'bg-accent-red',
  };

  return (
    <div className={cn('flex gap-0.5', className)}>
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-1 w-2 rounded-sm',
            i < filledSegments ? variants[variant] : 'bg-bg-panel'
          )}
        />
      ))}
    </div>
  );
}
