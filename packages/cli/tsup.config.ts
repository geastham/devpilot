import { defineConfig } from 'tsup';

export default defineConfig({
  // `statusline-fast` is its own entry on purpose: it must not pull in the
  // rest of the CLI. See src/statusline-fast.ts.
  entry: ['src/index.ts', 'src/cli.ts', 'src/statusline-fast.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
