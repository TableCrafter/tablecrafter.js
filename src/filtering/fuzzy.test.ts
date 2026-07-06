/**
 * fuzzy.test.ts
 *
 * Tests for the optional fuzzy matching engine.
 */

import { describe, it, expect } from 'vitest';
import {
  fuzzyMatch,
  highlightMatch,
  isComplexAst,
  createFuzzyEngine,
  type FuzzyResult,
} from './fuzzy';
import { parseQuery, createGrammarEngine } from './grammar';
import type { QueryNode } from '../core/types';

// ---------------------------------------------------------------------------
// fuzzyMatch
// ---------------------------------------------------------------------------

describe('fuzzyMatch: exact match', () => {
  it('exact substring → score 1, match true', () => {
    const r = fuzzyMatch('alice', 'Alice Smith');
    expect(r.match).toBe(true);
    expect(r.score).toBe(1);
  });

  it('indices span the exact matched chars', () => {
    const r = fuzzyMatch('ali', 'Alice');
    expect(r.match).toBe(true);
    expect(r.indices).toEqual([0, 1, 2]);
  });

  it('empty needle always matches with score 1', () => {
    const r = fuzzyMatch('', 'anything');
    expect(r.match).toBe(true);
    expect(r.score).toBe(1);
  });

  it('empty haystack → no match', () => {
    const r = fuzzyMatch('foo', '');
    expect(r.match).toBe(false);
    expect(r.score).toBe(0);
  });
});

describe('fuzzyMatch: fuzzy (sequential char) matching', () => {
  it('out-of-order chars → no match (greedy sequential)', () => {
    // 'bca' cannot match 'abc' because 'c' must come after 'b' and 'a' after 'b'
    const r = fuzzyMatch('zzz', 'abc');
    expect(r.match).toBe(false);
  });

  it('all chars present in order → match', () => {
    // 'ace' found in 'abcde' at positions 0, 2, 4
    const r = fuzzyMatch('ace', 'abcde', 0.1);
    expect(r.match).toBe(true);
    expect(r.indices).toEqual([0, 2, 4]);
  });

  it('consecutive run improves score over scattered match', () => {
    const consecutive = fuzzyMatch('abc', 'abc xyz', 0.0);
    const scattered = fuzzyMatch('abc', 'a_b_c xyz', 0.0);
    expect(consecutive.score).toBeGreaterThan(scattered.score);
  });

  it('score is between 0 and 1', () => {
    const r = fuzzyMatch('test', 'testing');
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(1);
  });
});

describe('fuzzyMatch: threshold', () => {
  it('below threshold → match false', () => {
    // Needle chars scattered so score would be low; use very high threshold
    const r = fuzzyMatch('az', 'abcdefghijklmnopqrstuvwxyz', 0.99);
    expect(r.match).toBe(false);
  });

  it('default threshold (0.4) admits moderate matches', () => {
    // "ali" in "Alice" is an exact substring → score 1 → always matches
    const r = fuzzyMatch('ali', 'Alice');
    expect(r.match).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// highlightMatch
// ---------------------------------------------------------------------------

describe('highlightMatch', () => {
  it('wraps matched chars in <mark> by default', () => {
    const html = highlightMatch('Alice', [0, 1, 2]);
    expect(html).toContain('<mark>Ali</mark>');
  });

  it('accepts custom wrap tag', () => {
    const html = highlightMatch('foo', [0, 1, 2], 'strong');
    expect(html).toContain('<strong>foo</strong>');
  });

  it('merges consecutive indices into one tag', () => {
    const html = highlightMatch('abcde', [1, 2, 3]);
    expect(html).toBe('a<mark>bcd</mark>e');
  });

  it('handles non-consecutive indices', () => {
    const html = highlightMatch('abcde', [0, 2, 4]);
    expect(html).toBe('<mark>a</mark>b<mark>c</mark>d<mark>e</mark>');
  });

  it('escapes HTML entities in haystack', () => {
    const html = highlightMatch('<b>hello</b>', []);
    expect(html).toContain('&lt;b&gt;');
    expect(html).not.toContain('<b>');
  });

  it('returns escaped haystack when indices are empty', () => {
    expect(highlightMatch('a&b', [])).toBe('a&amp;b');
  });
});

// ---------------------------------------------------------------------------
// isComplexAst
// ---------------------------------------------------------------------------

describe('isComplexAst', () => {
  it('null AST → false', () => {
    expect(isComplexAst(null)).toBe(false);
  });

  it('single term → false', () => {
    const ast = parseQuery('alice')!;
    expect(isComplexAst(ast)).toBe(false);
  });

  it('AND of terms → false', () => {
    const ast = parseQuery('alice smith')!;
    expect(isComplexAst(ast)).toBe(false);
  });

  it('field: → true', () => {
    const ast = parseQuery('name:alice')!;
    expect(isComplexAst(ast)).toBe(true);
  });

  it('OR node → true', () => {
    const ast = parseQuery('alice OR bob')!;
    expect(isComplexAst(ast)).toBe(true);
  });

  it('NOT node → true', () => {
    const ast = parseQuery('-inactive')!;
    expect(isComplexAst(ast)).toBe(true);
  });

  it('regex node → true', () => {
    const ast = parseQuery('/foo/')!;
    expect(isComplexAst(ast)).toBe(true);
  });

  it('AND with a complex child → true', () => {
    const ast = parseQuery('alice -bob')!;
    expect(isComplexAst(ast)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createFuzzyEngine
// ---------------------------------------------------------------------------

describe('createFuzzyEngine: delegation', () => {
  const rows = [
    { name: 'Alice',   status: 'active' },
    { name: 'Bob',     status: 'inactive' },
    { name: 'Charlie', status: 'active' },
  ];

  it('empty query matches all rows', () => {
    const engine = createFuzzyEngine();
    expect(engine.match(rows[0], null, [])).toBe(true);
  });

  it('simple term → fuzzy match (broad threshold)', () => {
    const engine = createFuzzyEngine(0.1);
    const ast = engine.parse('ali');
    // 'ali' is a substring of 'Alice' → exact match → score 1
    expect(engine.match({ name: 'Alice' }, ast, [])).toBe(true);
    expect(engine.match({ name: 'Bob' }, ast, [])).toBe(false);
  });

  it('complex query (field:) → falls back to exact grammar engine', () => {
    const engine = createFuzzyEngine();
    const ast = engine.parse('status:active');
    // Exact grammar engine substring semantics: 'inactive' CONTAINS 'active',
    // so use a status value that shares no substring
    expect(engine.match({ name: 'Alice', status: 'active' }, ast, [])).toBe(true);
    expect(engine.match({ name: 'Bob', status: 'closed' }, ast, [])).toBe(false);
  });

  it('complex query (OR) → falls back to grammar engine', () => {
    const engine = createFuzzyEngine();
    const ast = engine.parse('alice OR bob');
    expect(engine.match({ name: 'Alice' }, ast, [])).toBe(true);
    expect(engine.match({ name: 'Bob' }, ast, [])).toBe(true);
    expect(engine.match({ name: 'Charlie' }, ast, [])).toBe(false);
  });

  it('complex query (NOT) → falls back to grammar engine', () => {
    const engine = createFuzzyEngine();
    const ast = engine.parse('-inactive');
    expect(engine.match({ name: 'Alice', status: 'active' }, ast, [])).toBe(true);
    expect(engine.match({ name: 'Bob', status: 'inactive' }, ast, [])).toBe(false);
  });

  it('AND of terms → each term fuzzy-matched independently', () => {
    const engine = createFuzzyEngine(0.1);
    // Both 'ali' and 'act' must fuzzy-match some column value
    const ast = engine.parse('ali act');
    expect(engine.match({ name: 'Alice', status: 'active' }, ast, [])).toBe(true);
    expect(engine.match({ name: 'Alice', status: 'inactive' }, ast, [])).toBe(true); // 'act' in 'inactive'
    expect(engine.match({ name: 'Bob', status: 'active' }, ast, [])).toBe(false); // 'ali' not in Bob row
  });

  it('respects column list for cell value extraction', () => {
    const engine = createFuzzyEngine(0.1);
    const ast = engine.parse('ali');
    const columns = [{ key: 'status' }]; // restrict to status column
    // 'ali' is not in 'active' or 'inactive'
    expect(engine.match({ name: 'Alice', status: 'active' }, ast, columns)).toBe(false);
  });

  it('parse delegates to inner grammar engine', () => {
    const engine = createFuzzyEngine();
    const inner = createGrammarEngine();
    const q = 'foo:>42';
    expect(JSON.stringify(engine.parse(q))).toBe(JSON.stringify(inner.parse(q)));
  });
});
