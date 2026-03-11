'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

// ============================================================================
// Dropdown
// ============================================================================

interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

export function Dropdown({
  trigger,
  children,
  align = 'left',
  className,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  return (
    <div ref={dropdownRef} className={cn('relative inline-block', className)}>
      <div onClick={() => setIsOpen(!isOpen)}>{trigger}</div>
      {isOpen && (
        <div
          className={cn(
            'absolute z-50 mt-1 min-w-[120px] rounded-lg bg-bg-surface border border-border-default shadow-panel animate-fade-in',
            align === 'right' ? 'right-0' : 'left-0'
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Dropdown Item
// ============================================================================

interface DropdownItemProps {
  children: React.ReactNode;
  onClick?: () => void;
  selected?: boolean;
  className?: string;
}

export function DropdownItem({
  children,
  onClick,
  selected,
  className,
}: DropdownItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
        'hover:bg-white/5 first:rounded-t-lg last:rounded-b-lg',
        selected && 'bg-accent-primary/10 text-accent-primary',
        className
      )}
    >
      {selected && (
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      )}
      {children}
    </button>
  );
}

// ============================================================================
// Dropdown Divider
// ============================================================================

export function DropdownDivider() {
  return <div className="my-1 border-t border-border-default" />;
}

// ============================================================================
// Model Selector Dropdown
// ============================================================================

import { ModelBadge } from './badge';
import type { Model } from '@/types';

interface ModelSelectorProps {
  value: Model;
  onChange: (model: Model) => void;
  className?: string;
}

export function ModelSelector({ value, onChange, className }: ModelSelectorProps) {
  const models: Model[] = ['haiku', 'sonnet', 'opus'];

  return (
    <Dropdown
      trigger={
        <button className="flex items-center gap-1 hover:opacity-80 transition-opacity">
          <ModelBadge model={value} />
          <svg
            className="h-3 w-3 text-text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      }
      className={className}
    >
      {models.map((model) => (
        <DropdownItem
          key={model}
          onClick={() => onChange(model)}
          selected={model === value}
        >
          <ModelBadge model={model} />
        </DropdownItem>
      ))}
    </Dropdown>
  );
}

// ============================================================================
// Complexity Selector Dropdown
// ============================================================================

import { ComplexityBadge } from './badge';
import type { Complexity } from '@/types';

interface ComplexitySelectorProps {
  value: Complexity;
  onChange: (complexity: Complexity) => void;
  className?: string;
}

export function ComplexitySelector({
  value,
  onChange,
  className,
}: ComplexitySelectorProps) {
  const complexities: Complexity[] = ['S', 'M', 'L', 'XL'];

  return (
    <Dropdown
      trigger={
        <button className="flex items-center gap-1 hover:opacity-80 transition-opacity">
          <ComplexityBadge complexity={value} />
          <svg
            className="h-3 w-3 text-text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      }
      className={className}
    >
      {complexities.map((complexity) => (
        <DropdownItem
          key={complexity}
          onClick={() => onChange(complexity)}
          selected={complexity === value}
        >
          <ComplexityBadge complexity={complexity} />
        </DropdownItem>
      ))}
    </Dropdown>
  );
}
