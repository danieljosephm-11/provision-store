import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  splitting: false,
  sourcemap: false,
  // `@ps/shared` is authored in TypeScript and imported through its source
  // entry. Bundle it into the API output so the production server runs from
  // `dist` without needing a separate shared build or extension rewriting.
  noExternal: ['@ps/shared'],
});
