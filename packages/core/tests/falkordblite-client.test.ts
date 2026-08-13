import { describe, it, expect } from 'vitest';
import {
  FalkorLiteClient,
  falkorLitePlatformSupported,
  falkorLitePreflight,
} from '../src/mempalace/falkordblite-client';

/**
 * These tests deliberately do NOT start the engine.
 *
 * `falkordblite` requires a `redis-server` on PATH matching the machine's
 * architecture, which CI cannot assume — and the whole point of the preflight
 * and degradation paths is what happens when that is missing. Exercising them is
 * more valuable than a happy path that only runs on one developer's laptop.
 *
 * The engine round trip is tracked as unvalidated in docs/LEDGER.md rather than
 * faked here.
 */
describe('falkor-lite platform gate', () => {
  it('accepts only the platforms falkordblite publishes binaries for', () => {
    expect(falkorLitePlatformSupported('linux', 'x64')).toBe(true);
    expect(falkorLitePlatformSupported('darwin', 'arm64')).toBe(true);
    // Intel Macs and Linux arm64 have no published binary; Windows needs WSL2.
    expect(falkorLitePlatformSupported('darwin', 'x64')).toBe(false);
    expect(falkorLitePlatformSupported('linux', 'arm64')).toBe(false);
    expect(falkorLitePlatformSupported('win32', 'x64')).toBe(false);
  });
});

describe('falkor-lite preflight', () => {
  it('names the missing piece and how to fix it', async () => {
    const result = await falkorLitePreflight();
    if (result.ok) {
      expect(result.ok).toBe(true);
      return;
    }
    // A bare "unavailable" costs someone an afternoon. Both fields are the
    // product here.
    expect(result.reason.length).toBeGreaterThan(10);
    expect(result.remedy.length).toBeGreaterThan(10);
  });
});

describe('falkor-lite degradation', () => {
  /**
   * Memory improves a plan; it must never gate one. Every one of these runs on
   * a machine where the engine cannot start, and none may throw.
   */
  const client = new FalkorLiteClient({ path: '/nonexistent-devpilot-test' });

  it('returns empty recall rather than throwing', async () => {
    await expect(client.recall({ wingSlug: 'w', topic: 't' })).resolves.toMatchObject({
      topic: 't',
      closets: [],
    });
  });

  it('returns empty search rather than throwing', async () => {
    await expect(client.search({ query: 'q', wingSlug: 'w' })).resolves.toEqual({
      hits: [],
      totalScanned: 0,
    });
  });

  it('reports a failed write rather than throwing', async () => {
    const result = await client.addDrawer({
      wingSlug: 'w',
      roomSlug: 'runs',
      memoryType: 'fact',
      label: 'l',
      content: 'c',
    });
    expect(result.created).toBe(false);
  });

  it('returns an empty wake-up rather than throwing', async () => {
    await expect(client.wakeUp({ wingSlug: 'w' })).resolves.toMatchObject({
      criticalFacts: [],
    });
  });

  it('closes cleanly even when nothing ever opened', async () => {
    await expect(client.close()).resolves.toBeUndefined();
  });
});
