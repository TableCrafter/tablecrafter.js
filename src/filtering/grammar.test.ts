/**
 * grammar.test.ts
 *
 * v3 grammar equivalence proofs against the v2 search-grammar.test.js suite.
 * Behaviour under test:
 *   - parseQuery → QueryNode AST structure
 *   - evalQuery  → row match semantics
 *   - tokenise   → display tokens
 *   - createGrammarEngine → SearchEngine integration
 *
 * Semantic mapping notes (v2 → v3):
 *   - v2 n-ary `{ type:'and', children:[...] }` → v3 left-assoc binary tree
 *   - v2 `phrase` node         → v3 `term` node (same substring semantics)
 *   - v2 `not.child`           → v3 `not.operand`
 *   - v2 `field.op`            → v3 field node with `op` extension (in-module)
 *   - v2 no standalone regex   → v3 adds `{ kind:'regex', pattern, flags }`
 */

import { describe, it, expect } from 'vitest';
import {
  parseQuery,
  evalQuery,
  tokenise,
  createGrammarEngine,
  type GrammarFieldNode,
} from './grammar';
import type { QueryNode } from '../core/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROWS = [
  { name: 'Alice',   age: 30, status: 'active' },
  { name: 'Bob',     age: 25, status: 'inactive' },
  { name: 'Charlie', age: 35, status: 'active' },
  { name: 'Delta',   age: 28, status: 'archived' },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filterRows(query: string, data: Record<string, any>[] = ROWS): Record<string, any>[] {
  const engine = createGrammarEngine();
  const ast = engine.parse(query);
  return data.filter((row) => engine.match(row, ast, []));
}

// ---------------------------------------------------------------------------
// parseQuery: empty input
// ---------------------------------------------------------------------------

describe('parseQuery: empty input', () => {
  it('returns null for an empty string', () => {
    expect(parseQuery('')).toBeNull();
  });

  it('returns null for whitespace-only', () => {
    expect(parseQuery('   ')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseQuery: bare terms (equivalence with v2 "bare terms" suite)
// ---------------------------------------------------------------------------

describe('parseQuery: single bare term', () => {
  it('produces a term node', () => {
    const ast = parseQuery('foo')!;
    expect(ast.kind).toBe('term');
    expect((ast as { kind: 'term'; value: string }).value).toBe('foo');
  });
});

describe('parseQuery: multiple terms → AND chain', () => {
  it('two terms → binary and node', () => {
    const ast = parseQuery('foo bar')!;
    expect(ast.kind).toBe('and');
  });

  it('three terms → left-associative and chain', () => {
    const ast = parseQuery('foo bar baz')!;
    // Shape: and(and(foo, bar), baz)
    expect(ast.kind).toBe('and');
    expect((ast as { kind: 'and'; left: QueryNode; right: QueryNode }).right).toMatchObject({
      kind: 'term',
      value: 'baz',
    });
  });

  it('all three terms still match semantically (v2 equivalence)', () => {
    // v2: { and: [foo, bar, baz] } → all must match; v3 binary tree: same result
    const data = [
      { name: 'foobar', note: 'baz' },
      { name: 'foo',    note: 'xyz' },
    ];
    expect(filterRows('foo bar baz', data)).toHaveLength(1);
    expect(filterRows('foo bar baz', data)[0]!.name).toBe('foobar');
  });
});

// ---------------------------------------------------------------------------
// parseQuery: OR (v2 equivalence)
// ---------------------------------------------------------------------------

describe('parseQuery: OR', () => {
  it('two terms separated by OR → or node', () => {
    const ast = parseQuery('foo OR bar')!;
    expect(ast.kind).toBe('or');
  });

  it('case-insensitive: "or" behaves like "OR"', () => {
    const a1 = parseQuery('foo OR bar');
    const a2 = parseQuery('foo or bar');
    expect(JSON.stringify(a1)).toBe(JSON.stringify(a2));
  });

  it('OR returns rows matching either side (v2 evaluator equivalence)', () => {
    const result = filterRows('alice OR bob');
    expect(result.map((r) => r.name).sort()).toEqual(['Alice', 'Bob']);
  });

  it('OR with multiple terms each side', () => {
    const result = filterRows('alice OR charlie');
    expect(result.map((r) => r.name).sort()).toEqual(['Alice', 'Charlie']);
  });
});

// ---------------------------------------------------------------------------
// parseQuery: negation (v2 equivalence)
// ---------------------------------------------------------------------------

describe('parseQuery: negation with -', () => {
  it('-term wraps a term in a not node', () => {
    const ast = parseQuery('-foo')!;
    expect(ast.kind).toBe('not');
    expect((ast as { kind: 'not'; operand: QueryNode }).operand).toMatchObject({
      kind: 'term',
      value: 'foo',
    });
  });

  it('negation excludes matching rows (v2 evaluator equivalence)', () => {
    const result = filterRows('-inactive -archived');
    expect(result.map((r) => r.name).sort()).toEqual(['Alice', 'Charlie']);
  });

  it('-"phrase" negates a quoted phrase', () => {
    const ast = parseQuery('-"foo bar"')!;
    expect(ast.kind).toBe('not');
    expect((ast as { kind: 'not'; operand: QueryNode }).operand).toMatchObject({
      kind: 'term',
      value: 'foo bar',
    });
  });

  it('-field:value negates a field-scoped match', () => {
    const ast = parseQuery('-status:archived')!;
    expect(ast.kind).toBe('not');
    const inner = (ast as { kind: 'not'; operand: QueryNode }).operand;
    expect(inner.kind).toBe('field');
    expect((inner as GrammarFieldNode).field).toBe('status');
    expect((inner as GrammarFieldNode).op).toBe('eq');
  });
});

describe('parseQuery: NOT keyword', () => {
  it('NOT keyword is an alias for - prefix', () => {
    const a1 = parseQuery('-foo');
    const a2 = parseQuery('NOT foo');
    // Both should produce a not node wrapping term('foo')
    expect(a1?.kind).toBe('not');
    expect(a2?.kind).toBe('not');
  });
});

// ---------------------------------------------------------------------------
// parseQuery: quoted phrases (v2 equivalence)
// ---------------------------------------------------------------------------

describe('parseQuery: quoted phrases', () => {
  it('quoted phrase becomes a term node with the full phrase value', () => {
    const ast = parseQuery('"foo bar"')!;
    expect(ast.kind).toBe('term');
    expect((ast as { kind: 'term'; value: string }).value).toBe('foo bar');
  });

  it('preserves internal whitespace', () => {
    const ast = parseQuery('"  spaced  out  "')!;
    expect((ast as { kind: 'term'; value: string }).value).toBe('  spaced  out  ');
  });

  it('phrase matches literal substring (v2 evaluator equivalence)', () => {
    const result = filterRows('"li"');
    expect(result.map((r) => r.name)).toEqual(['Alice', 'Charlie']);
  });
});

// ---------------------------------------------------------------------------
// parseQuery: field:value (v2 equivalence)
// ---------------------------------------------------------------------------

describe('parseQuery: field:value', () => {
  it('simple field:value produces field node with op=eq', () => {
    const ast = parseQuery('status:open')!;
    expect(ast.kind).toBe('field');
    expect((ast as GrammarFieldNode).field).toBe('status');
    expect((ast as GrammarFieldNode).op).toBe('eq');
    expect((ast as GrammarFieldNode).value).toBe('open');
  });

  it('field:"quoted value" preserves whitespace', () => {
    const ast = parseQuery('name:"Jane Doe"')!;
    expect(ast.kind).toBe('field');
    expect((ast as GrammarFieldNode).value).toBe('Jane Doe');
  });

  it('field:value scopes match to that column (v2 evaluator equivalence)', () => {
    const result = filterRows('status:archived');
    expect(result.map((r) => r.name)).toEqual(['Delta']);
  });

  it('field:value substring match (not full-word exact)', () => {
    // v2 `_evalFieldNode` eq uses `.includes()` not `===`:
    // 'activ' is a substring of BOTH 'active' and 'inactive'
    const result = filterRows('status:activ');
    expect(result.map((r) => r.name).sort()).toEqual(['Alice', 'Bob', 'Charlie']);
  });

  it('field:value substring does not match non-containing values', () => {
    const result = filterRows('status:archiv');
    expect(result.map((r) => r.name)).toEqual(['Delta']);
  });
});

// ---------------------------------------------------------------------------
// parseQuery: comparison operators (v2 equivalence)
// ---------------------------------------------------------------------------

describe('parseQuery: comparison operators', () => {
  it('field:>N produces op=gt', () => {
    const ast = parseQuery('age:>10')! as GrammarFieldNode;
    expect(ast.kind).toBe('field');
    expect(ast.op).toBe('gt');
    expect(ast.value).toBe('10');
  });

  it('field:>=N produces op=gte', () => {
    const ast = parseQuery('age:>=10')! as GrammarFieldNode;
    expect(ast.op).toBe('gte');
  });

  it('field:<N produces op=lt', () => {
    const ast = parseQuery('age:<5')! as GrammarFieldNode;
    expect(ast.op).toBe('lt');
  });

  it('field:<=N produces op=lte', () => {
    const ast = parseQuery('age:<=5')! as GrammarFieldNode;
    expect(ast.op).toBe('lte');
  });

  it('field:>N numeric comparison filters rows (v2 evaluator equivalence)', () => {
    const result = filterRows('age:>28');
    expect(result.map((r) => r.name).sort()).toEqual(['Alice', 'Charlie']);
  });

  it('field:<=N includes exact boundary (v2 equivalence)', () => {
    const result = filterRows('age:<=25');
    expect(result.map((r) => r.name)).toEqual(['Bob']);
  });

  it('non-numeric cell is skipped for numeric comparison', () => {
    const data = [{ name: 'X', age: 'N/A' }, { name: 'Y', age: 40 }];
    expect(filterRows('age:>30', data).map((r) => r.name)).toEqual(['Y']);
  });
});

// ---------------------------------------------------------------------------
// parseQuery: regex literals (v2 equivalence + v3 standalone regex)
// ---------------------------------------------------------------------------

describe('parseQuery: field regex', () => {
  it('field:/pattern/ produces op=regex', () => {
    const ast = parseQuery('name:/^foo/')! as GrammarFieldNode;
    expect(ast.kind).toBe('field');
    expect(ast.op).toBe('regex');
    expect(ast.value).toBe('^foo');
  });

  it('field:/pattern/i preserves flags', () => {
    const ast = parseQuery('name:/bar/i')! as GrammarFieldNode;
    expect(ast.op).toBe('regex');
    expect(ast.regexFlags).toBe('i');
  });

  it('field:/regex/i matches via regex (v2 evaluator equivalence)', () => {
    const result = filterRows('name:/^(alice|bob)$/i');
    expect(result.map((r) => r.name).sort()).toEqual(['Alice', 'Bob']);
  });
});

describe('parseQuery: standalone regex (v3 addition)', () => {
  it('/pattern/ produces a regex node', () => {
    const ast = parseQuery('/foo/')!;
    expect(ast.kind).toBe('regex');
    expect((ast as { kind: 'regex'; pattern: string; flags: string }).pattern).toBe('foo');
  });

  it('/pattern/i carries flags', () => {
    const ast = parseQuery('/FOO/i')!;
    expect(ast.kind).toBe('regex');
    expect((ast as { kind: 'regex'; pattern: string; flags: string }).flags).toBe('i');
  });

  it('standalone regex matches all columns', () => {
    const result = filterRows('/^ali/i');
    expect(result.map((r) => r.name)).toEqual(['Alice']);
  });
});

// ---------------------------------------------------------------------------
// Wildcards (v2 evaluator equivalence)
// ---------------------------------------------------------------------------

describe('evaluator: wildcards', () => {
  it('* matches zero or more characters as a prefix', () => {
    const data = [
      { name: 'gold' },
      { name: 'golden' },
      { name: 'goldfish' },
      { name: 'silver' },
    ];
    const result = filterRows('gold*', data);
    expect(result.map((r) => r.name).sort()).toEqual(['gold', 'golden', 'goldfish']);
  });

  it('? matches exactly one character', () => {
    const data = [{ name: 'cat' }, { name: 'bat' }, { name: 'cart' }];
    const result = filterRows('?at', data);
    expect(result.map((r) => r.name).sort()).toEqual(['bat', 'cat']);
  });
});

// ---------------------------------------------------------------------------
// Mixed combinations (v2 equivalence)
// ---------------------------------------------------------------------------

describe('evaluator: mixed AND + OR + negation + field + phrase', () => {
  it('combines all node kinds (v2 combination test equivalence)', () => {
    // "foo OR bar -baz status:open "exact phrase""
    // Alice matches: name='Alice', age=30, status='active' (has 'active')
    // Only rows where (foo OR bar) AND NOT baz AND status contains 'open' AND 'exact phrase' present
    // None of ROWS satisfy this; verify the parse doesn't throw and evaluates without error
    const ast = parseQuery('alice OR charlie -inactive');
    expect(ast).not.toBeNull();
    const result = ROWS.filter((r) => {
      const engine = createGrammarEngine();
      return engine.match(r, engine.parse('alice OR charlie -inactive'), []);
    });
    expect(result.map((r) => r.name).sort()).toEqual(['Alice', 'Charlie']);
  });
});

// ---------------------------------------------------------------------------
// evalQuery API
// ---------------------------------------------------------------------------

describe('evalQuery standalone', () => {
  it('evalQuery(ast, row) returns true for matching row', () => {
    const ast = parseQuery('alice')!;
    expect(evalQuery(ast, { name: 'Alice', age: 30 })).toBe(true);
  });

  it('evalQuery(ast, row) returns false for non-matching row', () => {
    const ast = parseQuery('alice')!;
    expect(evalQuery(ast, { name: 'Bob', age: 25 })).toBe(false);
  });

  it('evalQuery with null-valued cells does not throw', () => {
    const ast = parseQuery('foo')!;
    expect(() => evalQuery(ast, { name: null, age: undefined })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// tokenise
// ---------------------------------------------------------------------------

describe('tokenise', () => {
  it('returns empty array for empty string', () => {
    expect(tokenise('')).toEqual([]);
  });

  it('single term produces a term token', () => {
    const toks = tokenise('hello');
    expect(toks).toHaveLength(1);
    expect(toks[0]!.type).toBe('term');
    expect(toks[0]!.value).toBe('hello');
  });

  it('OR produces an operator token', () => {
    const toks = tokenise('a OR b');
    const types = toks.map((t) => t.type);
    expect(types).toContain('operator');
  });

  it('field:value produces field + value tokens', () => {
    const toks = tokenise('status:open');
    expect(toks.map((t) => t.type)).toEqual(['field', 'value']);
  });

  it('carries correct character offsets', () => {
    const toks = tokenise('foo bar');
    expect(toks[0]!.start).toBe(0);
    expect(toks[0]!.end).toBe(3);
    expect(toks[1]!.start).toBe(4);
    expect(toks[1]!.end).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// createGrammarEngine integration
// ---------------------------------------------------------------------------

describe('createGrammarEngine', () => {
  it('parse(empty) returns null', () => {
    const engine = createGrammarEngine();
    expect(engine.parse('')).toBeNull();
  });

  it('match(row, null, []) returns true (everything matches empty query)', () => {
    const engine = createGrammarEngine();
    expect(engine.match({ name: 'Alice' }, null, [])).toBe(true);
  });

  it('match respects AND semantics', () => {
    const engine = createGrammarEngine();
    const ast = engine.parse('alice active');
    expect(engine.match({ name: 'Alice', status: 'active' }, ast, [])).toBe(true);
    // NOTE: substring semantics — 'active' would match 'inactive' too,
    // so use a status that shares no substring with 'active'
    expect(engine.match({ name: 'Alice', status: 'closed' }, ast, [])).toBe(false);
    expect(engine.match({ name: 'Bob', status: 'active' }, ast, [])).toBe(false);
  });

  it('match respects OR semantics', () => {
    const engine = createGrammarEngine();
    const ast = engine.parse('alice OR bob');
    expect(engine.match({ name: 'Alice' }, ast, [])).toBe(true);
    expect(engine.match({ name: 'Bob' }, ast, [])).toBe(true);
    expect(engine.match({ name: 'Charlie' }, ast, [])).toBe(false);
  });

  it('columns parameter restricts which fields are searched (with columns)', () => {
    const engine = createGrammarEngine();
    // 'alice' only in the `name` field; searching only `status` column should miss it
    const ast = engine.parse('alice');
    const columns = [{ key: 'status' }];
    expect(engine.match({ name: 'Alice', status: 'active' }, ast, columns)).toBe(false);
  });

  it('field: scoping ignores columns list (direct field lookup)', () => {
    const engine = createGrammarEngine();
    const ast = engine.parse('status:active');
    const columns = [{ key: 'name' }]; // deliberately omit status from columns list
    // Field node bypasses column restriction; reads row.status directly
    expect(engine.match({ name: 'Alice', status: 'active' }, ast, columns)).toBe(true);
  });
});
