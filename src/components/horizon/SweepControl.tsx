'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Sweeping finished and stranded work off the board.
 *
 * Columns only ever grew. A completed run stayed forever, and a stranded one —
 * AVA-10 read "Executing" for hours after its completion callbacks were pointed
 * at a port with nothing listening — sat there looking like live work. Past a
 * few of those the board stops being scannable, which is the only thing it is
 * for.
 *
 * It shows what it would remove before removing it, and says why each item
 * qualifies. A sweep that silently decided what was finished would be the
 * fastest way to stop trusting the board.
 */

interface Sweepable {
  id: string;
  title: string;
  linearTicketId: string | null;
  reason: 'finished' | 'stranded';
}

const REASON_LABEL: Record<Sweepable['reason'], string> = {
  finished: 'finished',
  stranded: 'no activity for hours',
};

export function SweepControl({ onSwept }: { onSwept?: () => void }) {
  const [items, setItems] = useState<Sweepable[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<string[] | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/items/sweep');
      if (!res.ok) return;
      const json = await res.json();
      setItems(json.sweepable ?? []);
    } catch {
      // A board that renders is worth more than one that errors because a
      // housekeeping check failed.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function sweep() {
    setBusy(true);
    try {
      const res = await fetch('/api/items/sweep', { method: 'POST' });
      const json = await res.json();
      // Hold the ids so the action is reversible for as long as the notice is
      // on screen; archiving keeps zone, plan and history, so nothing is lost.
      setUndo(json.itemIds ?? []);
      setOpen(false);
      await refresh();
      onSwept?.();
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (!undo?.length) return;
    setBusy(true);
    try {
      await fetch('/api/items/sweep', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: undo }),
      });
      setUndo(null);
      await refresh();
      onSwept?.();
    } finally {
      setBusy(false);
    }
  }

  if (undo?.length) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <span>
          Swept {undo.length} item{undo.length === 1 ? '' : 's'}
        </span>
        <button
          onClick={() => void restore()}
          disabled={busy}
          className="text-accent-primary hover:underline"
        >
          Undo
        </button>
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-text-muted transition-colors hover:text-text-primary"
      >
        Sweep {items.length} finished
      </button>

      {open && (
        <div className="absolute right-0 top-6 z-50 w-80 rounded-lg border border-border-default bg-bg-panel p-3 shadow-panel">
          <p className="mb-2 text-xs text-text-secondary">
            These leave the board. They keep their plan and history, and Undo brings them
            back.
          </p>
          <ul className="mb-3 max-h-56 space-y-1 overflow-y-auto">
            {items.map((item) => (
              <li key={item.id} className="flex items-baseline gap-2 text-xs">
                <span className="font-mono text-text-muted">
                  {item.linearTicketId ?? '—'}
                </span>
                <span className="min-w-0 flex-1 truncate text-text-secondary">
                  {item.title}
                </span>
                <span
                  className={
                    item.reason === 'stranded' ? 'text-accent-amber' : 'text-text-muted'
                  }
                >
                  {REASON_LABEL[item.reason]}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void sweep()} disabled={busy}>
              {busy ? 'Sweeping…' : `Sweep ${items.length}`}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
