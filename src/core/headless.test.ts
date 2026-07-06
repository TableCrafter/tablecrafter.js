import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Headless enforcement: the core must never touch the DOM.
 *
 * RFC section 1/3: "the core never touches the DOM" -- core is the headless
 * layer any framework or SSR consumer can import.  This test greps every
 * non-test source file in src/core for `document`/`window` identifier usage and
 * fails if any appears, so a future edit that reaches for the DOM is caught in
 * CI rather than at a consumer's runtime.
 */

const here = dirname(fileURLToPath(import.meta.url));

function coreSourceFiles(): string[] {
  return readdirSync(here)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => join(here, f));
}

// Match the bare identifiers `document` / `window` as whole words, ignoring
// occurrences inside comments/strings would be ideal but a strict word-boundary
// grep is the enforcement contract: keep those identifiers out of core source.
const FORBIDDEN = /\b(document|window)\b/;

describe('core is headless (zero DOM access)', () => {
  const files = coreSourceFiles();

  it('has core source files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file.split('/').pop()} contains no document/window references`, () => {
      const src = readFileSync(file, 'utf8');
      // Strip line comments and block comments before matching so documentation
      // mentioning the DOM does not trip the guard; real usage still fails.
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      const match = FORBIDDEN.exec(stripped);
      expect(
        match,
        match ? `Found forbidden DOM reference "${match[0]}" in ${file}` : ''
      ).toBeNull();
    });
  }
});
