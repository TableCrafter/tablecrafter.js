import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import pkg from '../package.json';

/**
 * Guards the RFC-v3 subpath export map (docs/RFC-v3.md line 54):
 *   `.`, `./core`, `./render`, `./adapters/*`, `./cells/*`, `./export/*`,
 *   `./i18n`, `./styles.css`, plus `./cdn`.
 *
 * #379: `./cells/*` wildcard and `./cdn` were missing. These tests verify the
 * map entries exist AND are backed by a real source module + a build entry, so
 * `npm run build:v3` will actually emit each target. This is deliberately
 * BUILD-INDEPENDENT: the CI Vitest job does not build, so asserting on-disk
 * `dist/` files here would fail in a fresh checkout (dist is gitignored).
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const exportsMap = pkg.exports as Record<string, unknown>;
const viteConfig = readFileSync(resolve(root, 'vite.v3.config.ts'), 'utf8');

function target(entry: unknown): string {
  if (typeof entry === 'string') return entry;
  const e = entry as { import?: string; default?: string; types?: string };
  return e.import ?? e.default ?? e.types!;
}

describe('package.json exports (RFC-v3)', () => {
  it('exposes a ./cdn subpath backed by src/cdn.ts and the IIFE build', () => {
    expect(exportsMap['./cdn']).toBeDefined();
    // Source entry the CDN build compiles from.
    expect(existsSync(resolve(root, 'src/cdn.ts'))).toBe(true);
    // The build config emits the IIFE global the ./cdn export points at.
    expect(viteConfig).toMatch(/src\/cdn\.ts/);
    expect(viteConfig).toMatch(/tablecrafter\.global\.js/);
    expect(target(exportsMap['./cdn'])).toContain('tablecrafter.global.js');
  });

  it('exposes a ./cells/* wildcard, not just the flat ./cells index', () => {
    expect(exportsMap['./cells/*']).toBeDefined();
    expect(target(exportsMap['./cells/*'])).toContain('*');
  });

  // The public per-cell modules named in the RFC feature map (cells/*).
  const cells = ['badge', 'progress', 'sparkline', 'link', 'star', 'heatmap', 'conditional', 'autoformat'];
  it.each(cells)('backs ./cells/%s with a source module and a build entry', (cell) => {
    // A real source module exists.
    expect(existsSync(resolve(root, `src/cells/${cell}.ts`)), `src/cells/${cell}.ts should exist`).toBe(true);
    // The vite build has a per-cell entry, so `build:v3` emits cells/<cell>.mjs
    // which the ./cells/* wildcard resolves to.
    expect(viteConfig, `vite.v3.config.ts should build cells/${cell}`).toContain(`'cells/${cell}'`);
  });

  it('still exposes the flat ./cells index for the full set', () => {
    expect(exportsMap['./cells']).toBeDefined();
    expect(existsSync(resolve(root, 'src/cells/index.ts'))).toBe(true);
    expect(viteConfig).toContain("'cells/index'");
  });
});
