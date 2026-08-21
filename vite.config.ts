import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

// One id per deployed build. The service worker keys its cache on this, so a
// stale build is never what a returning player gets. Vercel exposes the commit
// SHA at build time; local builds fall back to the package version.
const buildId = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? `dev-${pkg.version}`;

export default defineConfig({
  base: './',
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
  server: {
    host: true,
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    strictPort: false,
  },
});
