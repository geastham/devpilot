import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Local copy of the cockpit's `cn`.
 *
 * Importing it from the app would invert the dependency — the package would
 * depend on the application that consumes it. It is four lines; duplicating it
 * is cheaper than the coupling.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
