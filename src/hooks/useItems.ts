'use client';

import { useEffect, useCallback } from 'react';
import { useHorizonStore } from '@/stores';
import type { HorizonItem } from '@/types';

/**
 * Hook to fetch and manage horizon items from the API
 */
export function useItems() {
  const setItems = useHorizonStore((state) => state.setItems);
  const setLoading = useHorizonStore((state) => state.setLoading);
  const setError = useHorizonStore((state) => state.setError);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/items');
      if (!response.ok) {
        throw new Error(`Failed to fetch items: ${response.statusText}`);
      }

      const items: HorizonItem[] = await response.json();

      // Transform dates from ISO strings to Date objects
      const transformedItems = items.map((item) => ({
        ...item,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
        plan: item.plan
          ? {
              ...item.plan,
              generatedAt: item.plan.generatedAt
                ? new Date(item.plan.generatedAt)
                : new Date(),
              memorySessionsUsed: (item.plan.memorySessionsUsed || []).map(
                (session: { date: string | Date; ticketId: string; summary: string; constraintApplied: string }) => ({
                  ...session,
                  date: new Date(session.date),
                })
              ),
            }
          : null,
      }));

      setItems(transformedItems);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to fetch items');
    } finally {
      setLoading(false);
    }
  }, [setItems, setLoading, setError]);

  // Fetch on mount
  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  return { refetch: fetchItems };
}
