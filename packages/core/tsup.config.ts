import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/db/index.ts',
    'src/orchestrator/index.ts',
    'src/wiki/index.ts',
    'src/wave-planner/index.ts',
    // Dependency-free on purpose: the score model is imported by CLIENT
    // components, and pulling it from the barrel drags better-sqlite3 and
    // node:fs into the browser bundle. Safe as a separate entry despite
    // splitting:false — it is pure constants and functions with no module state.
    'src/score/index.ts',
  ],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  // Native/optional deps must NOT be bundled. tsup inlines CJS into the ESM
  // output and rewrites its internal require() calls, which breaks falkordblite
  // with "Dynamic require of fs/promises is not supported" at open() time —
  // silently, because the client degrades rather than throwing.
  external: ['better-sqlite3', 'falkordblite'],
});
