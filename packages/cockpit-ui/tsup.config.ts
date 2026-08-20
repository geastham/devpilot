import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  // Matches the other packages: splitting duplicates module state, which has
  // bitten this repo before with `globalThis` singletons.
  splitting: false,
  external: ['react', 'react-dom'],
  // The components are client components in Next terms; the directive has to
  // survive bundling or every consumer must re-wrap them.
  banner: { js: '"use client";' },
});
