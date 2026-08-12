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
  external: ['better-sqlite3'],
});
