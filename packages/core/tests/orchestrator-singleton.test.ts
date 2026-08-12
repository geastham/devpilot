import { describe, it, expect, afterEach } from 'vitest';

/**
 * Regression: the orchestrator singleton must be shared across core's SEPARATE
 * BUILD ENTRIES.
 *
 * `tsup` builds five entries with `splitting: false`, so
 * `dist/orchestrator/index.*` and `dist/wave-planner/index.*` each inline their
 * own copy of `service.ts`. While the instance lived in a module-level `let`, a
 * service initialised through `@devpilot.sh/core/orchestrator` was invisible to
 * `WaveDispatchCoordinator` inside `@devpilot.sh/core/wave-planner`: every task
 * threw ORCHESTRATOR_UNAVAILABLE and was silently QUEUED. Wave dispatch reported
 * success, changed no task status, and started no agent — so it could not work
 * through the Next app at all.
 *
 * It hid for months because `/api/fleet/dispatch` calls `service.dispatch()`
 * directly and never crosses the bundle boundary. Only the coordinator path did.
 *
 * This test asserts the property that actually protects against it — the
 * instance is reachable through `globalThis`, not through module scope — so the
 * bug cannot come back if someone flips a bundler flag.
 */

const GLOBAL_KEY = '__devpilotOrchestratorService';

function globalSlot(): Record<string, unknown> {
  return globalThis as unknown as Record<string, unknown>;
}

describe('orchestrator singleton', () => {
  afterEach(async () => {
    // One test parks a plain sentinel in the slot, so `shutdown` may not exist.
    const parked = globalSlot()[GLOBAL_KEY] as { shutdown?: () => unknown } | undefined;
    if (typeof parked?.shutdown === 'function') await parked.shutdown();
    delete globalSlot()[GLOBAL_KEY];
  });

  it('stores the instance on globalThis so every bundle copy sees it', async () => {
    const { initOrchestratorService, getOrchestratorServiceOrNull } = await import(
      '../src/orchestrator/service'
    );

    expect(getOrchestratorServiceOrNull()).toBeNull();

    const service = initOrchestratorService({ mode: 'disabled' });

    // The instance is on the global, not captured in module scope. A second
    // inlined copy of this module reads the same slot.
    expect(globalSlot()[GLOBAL_KEY]).toBe(service);
    expect(getOrchestratorServiceOrNull()).toBe(service);
  });

  it('reads an instance placed on the global by another module copy', async () => {
    const { getOrchestratorServiceOrNull, isOrchestratorServiceInitialized } = await import(
      '../src/orchestrator/service'
    );

    // Stand in for "the other bundle already initialised one".
    const sentinel = { marker: 'from-another-bundle' };
    globalSlot()[GLOBAL_KEY] = sentinel;

    expect(getOrchestratorServiceOrNull()).toBe(sentinel);
    expect(isOrchestratorServiceInitialized()).toBe(true);
  });

  it('reports uninitialised when the global slot is empty', async () => {
    const { getOrchestratorServiceOrNull, isOrchestratorServiceInitialized, getOrchestratorService } =
      await import('../src/orchestrator/service');

    delete globalSlot()[GLOBAL_KEY];

    expect(getOrchestratorServiceOrNull()).toBeNull();
    expect(isOrchestratorServiceInitialized()).toBe(false);
    expect(() => getOrchestratorService()).toThrow(/not initialized/i);
  });
});
