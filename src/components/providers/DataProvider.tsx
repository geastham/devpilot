'use client';

import { useItems, useFleetState, useSSE } from '@/hooks';

interface DataProviderProps {
  children: React.ReactNode;
}

export function DataProvider({ children }: DataProviderProps) {
  // Fetch horizon items from API
  useItems();

  // Fetch fleet state (sessions, score, runway, activity events)
  useFleetState();

  // Connect to SSE for real-time updates
  useSSE();

  return <>{children}</>;
}
