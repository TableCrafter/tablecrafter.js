import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import pkg from '../package.json';

/**
 * Guards the RFC-v3 subpath export map (docs/RFC-v3.md line 54):
 *   `.`, `./core`, `./render`, `./adapters/*`, `./cells/*`, `./export/*`,
 *   `./i18n`, `./styles.css`, plus `./cdn`.
 *
 * #379: `./cells/*` wildcard and `./cdn` were missing. These tests assert both
 * the map entries exist AND that their build targets are present on disk, so a
 * consumer's `import 'tablecrafter/cells/badge'` actually resolves.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const exportsMap = pkg.exports as Record<string, unknown>;

function target(entry: unknown): string {
  if (typeof entry === 'string') return entry;
  const e = entry as { import?: string; default?: string; types?: string };
  return e.import ?? e.default ?? e.types!;
}

/** Resolve a wildcard export (e.g. "./cells/badge") to a concrete file path. */
function resolveSubpath(subpath: string): string {
  if (exportsMap[subpath]) return target(exportsMap[subpath]);
  // Wildcard match: find "./prefix/*" whose prefix matches.
  for (const [key, val] of Object.entries(exportsMap)) {
    if (!key.endsWith('/*')) continue;
    const prefix = key.slice(0, -1); // "./cells/"
    if (subpath.startsWith(prefix)) {
      const star = subpath.slice(prefix.length);
      return target(val).replace('*', star);
    }
  }
  throw new Error(`no export entry matches ${subpath}`);
}

describe('package.json exports (RFC-v3)', () => {
  it('exposes a ./cdn subpath pointing at a built file', () => {
    expect(exportsMap['./cdn']).toBeDefined();
    const file = resolve(root, target(exportsMap['./cdn']));
    expect(existsSync(file), `${file} should exist`).toBe(true);
  });

  it('exposes a ./cells/* wildcard, not just the flat ./cells index', () => {
    expect(exportsMap['./cells/*']).toBeDefined();
  });

  // The public per-cell modules named in the RFC feature map (cells/*).
  const cells = ['badge', 'progress', 'sparkline', 'link', 'star', 'heatmap', 'conditional', 'autoformat'];
  it.each(cells)('resolves ./cells/%s to a built .mjs', (cell) => {
    const file = resolve(root, resolveSubpath(`./cells/${cell}`));
    expect(existsSync(file), `${file} should exist`).toBe(true);
  });

  it('still exposes the flat ./cells index for the full set', () => {
    const file = resolve(root, target(exportsMap['./cells']));
    expect(existsSync(file)).toBe(true);
  });
});
