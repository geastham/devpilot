'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

// ============================================================================
// Card
// ============================================================================

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'ready' | 'refining' | 'shaping' | 'directional';
  interactive?: boolean;
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', interactive = false, ...props }, ref) => {
    const variants = {
      default: 'bg-bg-surface border border-border-default',
      ready: 'bg-zone-ready text-bg-base',
      refining: 'bg-zone-refining/10 border border-zone-refining/20',
      shaping: 'bg-zone-shaping/10 border border-zone-shaping/20',
      directional: 'bg-zone-directional/5',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'rounded-lg',
          variants[variant],
          interactive && 'transition-all duration-150 hover:shadow-card-hover cursor-pointer',
          className
        )}
        {...props}
      />
    );
  }
);

Card.displayName = 'Card';

// ============================================================================
// Card Header
// ============================================================================

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-col gap-1.5 p-4 pb-0', className)}
      {...props}
    />
  )
);

CardHeader.displayName = 'CardHeader';

// ============================================================================
// Card Title
// ============================================================================

interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {}

const CardTitle = forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('font-semibold text-base leading-tight', className)}
      {...props}
    />
  )
);

CardTitle.displayName = 'CardTitle';

// ============================================================================
// Card Description
// ============================================================================

interface CardDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

const CardDescription = forwardRef<HTMLParagraphElement, CardDescriptionProps>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn('text-sm text-text-secondary', className)}
      {...props}
    />
  )
);

CardDescription.displayName = 'CardDescription';

// ============================================================================
// Card Content
// ============================================================================

interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {}

const CardContent = forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-4', className)} {...props} />
  )
);

CardContent.displayName = 'CardContent';

// ============================================================================
// Card Footer
// ============================================================================

interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex items-center gap-2 p-4 pt-0', className)}
      {...props}
    />
  )
);

CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
