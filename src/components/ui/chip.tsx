'use client';

import { cn } from '@/lib/utils';

interface ChipProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  variant?: 'default' | 'ticket' | 'repo' | 'keyword';
}

export function Chip({
  children,
  onClick,
  className,
  variant = 'default',
}: ChipProps) {
  const variants = {
    default: 'bg-white/5 border-white/10 hover:border-accent-primary/50',
    ticket: 'bg-accent-primary/10 border-accent-primary/20 hover:border-accent-primary/50 text-accent-primary',
    repo: 'bg-accent-purple/10 border-accent-purple/20 hover:border-accent-purple/50 text-accent-purple',
    keyword: 'bg-accent-amber/10 border-accent-amber/20 hover:border-accent-amber/50 text-accent-amber',
  };

  const Component = onClick ? 'button' : 'span';

  return (
    <Component
      onClick={onClick}
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
        variants[variant],
        onClick && 'cursor-pointer',
        className
      )}
    >
      {children}
    </Component>
  );
}

interface ChipGroupProps {
  children: React.ReactNode;
  className?: string;
}

export function ChipGroup({ children, className }: ChipGroupProps) {
  return <div className={cn('flex flex-wrap gap-1.5', className)}>{children}</div>;
}
