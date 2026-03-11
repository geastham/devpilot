// UI Components
// This module exports all shared UI components

// Utility function for class names
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Placeholder exports - will be populated with actual components
export const COMPONENT_VERSION = '0.1.0';
