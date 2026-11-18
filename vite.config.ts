/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

/**
 * Builds the service worker from src/sw-template.js, injecting the list of
 * hashed build assets and public files so the app shell works offline.
 * Kept in-repo (instead of a PWA plugin) to avoid extra dependencies.
 */
function serviceWorkerPlugin(): Plugin {
  return {
    name: 'bolo-urdu-sw',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const publicDir = join(process.cwd(), 'public');
      const publicFiles = listFiles(publicDir)
        .map((f) => relative(publicDir, f).replace(/\\/g, '/'))
        .filter((f) => !f.startsWith('.') && !f.endsWith('.mp3')); // audio is cached as it's played
      const assets = Object.keys(bundle);
      const precache = ['./', ...assets, ...publicFiles].map((p) => (p === './' ? p : `./${p}`));
      const version = createHash('sha256').update(precache.join('|') + Date.now()).digest('hex').slice(0, 10);
      const template = readFileSync(join(process.cwd(), 'src', 'sw-template.js'), 'utf8');
      const source = template
        .replace('__PRECACHE_LIST__', JSON.stringify(precache))
        .replace('__CACHE_VERSION__', version);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  // Use the native real path as root: on Windows, folders redirected by app virtualization or
  // junctions otherwise resolve to a different path than the root, and modules fail to load.
  root: realpathSync.native(process.cwd()),
  base: './',
  plugins: [react(), serviceWorkerPlugin()],
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
