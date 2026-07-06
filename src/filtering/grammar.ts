/**
 * filtering/grammar.ts
 *
 * Search grammar parser.  Converts a freetext query string into a QueryNode
 * AST that the filter engine evaluates against each row.
 *
 * Grammar (EBNF sketch):
 *   expr      = or_expr
 *   or_expr   = and_expr ('OR' and_expr)*
 *   and_expr  = not_expr ('AND'? not_expr)*
 *   not_expr  = ('-' | 'NOT') primary | primary
 *   primary   = field_term | regex_term | phrase_term | term
 *   field_term = IDENT ':' op? (quoted | regex_literal | word)
 *   regex_term = '/' pattern '/' flags?
 *   phrase_term = '"' chars '"'
 *   term      = word (with optional wildcard * / ?)
 *
 * Semantic equivalence with v2 (src/tablecrafter.js `parseQuery` /
 * `_tokenizeQuery` / `_evalQueryAst` / `_evalFieldNode` / `_wildcardToRegex`):
 * - Implicit AND via whitespace
 * - OR keyword (case-insensitive) has lower precedence than AND
 * - `-` prefix and `NOT` keyword for negation
 * - "quoted phrase" → substring match of the full phrase value
 * - field:value → scoped substring match on that column
 * - field:>N, >=, <, <= → numeric comparisons
 * - field:/pattern/flags → regex match on that column
 * - /pattern/flags → standalone regex across all columns (v3 addition)
 * - word* / word? → wildcard matching
 *
 * v3 AST differences from v2:
 * - `kind` instead of `type`
 * - Binary left/right tree instead of n-ary `children` array
 * - `not.operand` instead of `not.child`
 * - `phrase` → mapped to `term` (substring semantics identical)
 * - `field` node extended locally with an `op` property (not in core types)
 * - Standalone `/regex/` adds a `regex` node kind (v3 addition)
 */

import type { QueryNode, TableCrafterColumn } from '../core/types';
import type { SearchEngine } from '../core/state';

// ---------------------------------------------------------------------------
// Local type extensions (in-module, not in core/types)
// ---------------------------------------------------------------------------

/**
 * Comparison operators for field:value expressions.
 * Extended from the core QueryNode field variant which only carries `value: string`.
 */
export type FieldOp = 'eq' | 'gt' | 'gte' | 'lt' | 'lte' | 'regex';

/**
 * Extended field node with a comparison operator.
 * Structurally a superset of the core `{ kind: 'field'; field: string; value: string }`.
 * The extra `op` and `regexFlags` properties are set by our parser and read by our
 * evaluator; they survive the `QueryNode` cast because both functions live in this module.
 */
export interface GrammarFieldNode {
  kind: 'field';
  field: string;
  op: FieldOp;
  /** For op='regex': the regex pattern string. Otherwise: the plain match value. */
  value: string;
  /** Regex flags when op='regex'. */
  regexFlags?: string | undefined;
}

/** Grammar-internal extended node union.  Superset of the public QueryNode. */
export type GrammarNode =
  | { kind: 'and'; left: GrammarNode; right: GrammarNode }
  | { kind: 'or'; left: GrammarNode; right: GrammarNode }
  | { kind: 'not'; operand: GrammarNode }
  | GrammarFieldNode
  | { kind: 'regex'; pattern: string; flags: string }
  | { kind: 'term'; value: string };

// ---------------------------------------------------------------------------
// Tokenizer types
// ---------------------------------------------------------------------------

type Token =
  | { type: 'term'; value: string }
  | { type: 'phrase'; value: string }
  | { type: 'regex'; pattern: string; flags: string }
  | { type: 'or' }
  | { type: 'and' }
  | { type: 'not' }
  | { type: 'field'; field: string; op: FieldOp; value: string; regexFlags?: string | undefined };

/** A token produced by the tokeniser, exported for syntax highlighting. */
export interface QueryToken {
  type: 'operator' | 'field' | 'value' | 'regex' | 'term' | 'paren';
  value: string;
  start: number;
  end: number;
}

// ---------------------------------------------------------------------------
// Tokenizer helpers (string indexing uses charAt to avoid noUncheckedIndexedAccess)
// ---------------------------------------------------------------------------

function ch(s: string, i: number): string {
  return s.charAt(i); // returns '' for out-of-bounds, never undefined
}

function readQuoted(s: string, start: number): { value: string; next: number } {
  const end = s.indexOf('"', start + 1);
  if (end === -1) return { value: s.slice(start + 1), next: s.length };
  return { value: s.slice(start + 1, end), next: end + 1 };
}

function readRegexLiteral(
  s: string,
  start: number
): { pattern: string; flags: string; next: number } {
  let i = start + 1; // skip opening /
  let pattern = '';
  while (i < s.length && ch(s, i) !== '/' && !/\s/.test(ch(s, i))) {
    pattern += ch(s, i++);
  }
  let flags = '';
  if (i < s.length && ch(s, i) === '/') {
    i++; // skip closing /
    while (i < s.length && /[gimsuy]/.test(ch(s, i))) {
      flags += ch(s, i++);
    }
  }
  return { pattern, flags, next: i };
}

/** Internal tokeniser; produces a flat list of tokens from the query string. */
function tokenizeInternal(s: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < s.length) {
    const c = ch(s, i);

    // Skip whitespace
    if (/\s/.test(c)) { i++; continue; }

    // Standalone regex literal: /pattern/flags
    if (c === '/') {
      const r = readRegexLiteral(s, i);
      tokens.push({ type: 'regex', pattern: r.pattern, flags: r.flags });
      i = r.next;
      continue;
    }

    // Negation: - followed by non-whitespace
    if (c === '-' && i + 1 < s.length && !/\s/.test(ch(s, i + 1))) {
      tokens.push({ type: 'not' });
      i++;
      continue;
    }

    // Quoted phrase
    if (c === '"') {
      const q = readQuoted(s, i);
      tokens.push({ type: 'phrase', value: q.value });
      i = q.next;
      continue;
    }

    // Read word (up to whitespace, quote, colon, or slash)
    const wordStart = i;
    while (i < s.length && !/[\s":/]/.test(ch(s, i))) i++;
    const word = s.slice(wordStart, i);

    if (!word) { i++; continue; }

    const wordUp = word.toUpperCase();
    if (wordUp === 'OR') { tokens.push({ type: 'or' }); continue; }
    if (wordUp === 'AND') { tokens.push({ type: 'and' }); continue; }
    if (wordUp === 'NOT') { tokens.push({ type: 'not' }); continue; }

    // Field:value expression
    if (i < s.length && ch(s, i) === ':') {
      i++; // consume colon

      let op: FieldOp = 'eq';
      if (i < s.length) {
        const c1 = ch(s, i);
        const c2 = ch(s, i + 1);
        if (c1 === '>' && c2 === '=') { op = 'gte'; i += 2; }
        else if (c1 === '<' && c2 === '=') { op = 'lte'; i += 2; }
        else if (c1 === '>') { op = 'gt'; i++; }
        else if (c1 === '<') { op = 'lt'; i++; }
        else if (c1 === '=') { i++; } // explicit eq, skip =
      }

      if (i < s.length && ch(s, i) === '"') {
        const q = readQuoted(s, i);
        tokens.push({ type: 'field', field: word, op, value: q.value });
        i = q.next;
      } else if (i < s.length && ch(s, i) === '/') {
        const r = readRegexLiteral(s, i);
        tokens.push({ type: 'field', field: word, op: 'regex', value: r.pattern, regexFlags: r.flags });
        i = r.next;
      } else {
        const valStart = i;
        while (i < s.length && !/\s/.test(ch(s, i))) i++;
        tokens.push({ type: 'field', field: word, op, value: s.slice(valStart, i) });
      }
      continue;
    }

    tokens.push({ type: 'term', value: word });
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Parser: token stream → binary GrammarNode tree
// ---------------------------------------------------------------------------

/** Build a left-associative AND chain from an array of nodes. */
function andChain(nodes: GrammarNode[]): GrammarNode | null {
  if (nodes.length === 0) return null;
  // Safe: length > 0 checked above
  let result: GrammarNode = nodes[0]!;
  for (let k = 1; k < nodes.length; k++) {
    result = { kind: 'and', left: result, right: nodes[k]! };
  }
  return result;
}

/** Build a left-associative OR chain from an array of nodes. */
function orChain(nodes: GrammarNode[]): GrammarNode | null {
  if (nodes.length === 0) return null;
  let result: GrammarNode = nodes[0]!;
  for (let k = 1; k < nodes.length; k++) {
    result = { kind: 'or', left: result, right: nodes[k]! };
  }
  return result;
}

function tokenToNode(token: Token): GrammarNode | null {
  switch (token.type) {
    case 'term':   return { kind: 'term', value: token.value };
    case 'phrase': return { kind: 'term', value: token.value }; // phrase → term
    case 'regex':  return { kind: 'regex', pattern: token.pattern, flags: token.flags };
    case 'field':
      return {
        kind: 'field',
        field: token.field,
        op: token.op,
        value: token.value,
        regexFlags: token.regexFlags,
      } as GrammarFieldNode;
    default: return null;
  }
}

/**
 * Build a binary GrammarNode tree from the token stream.
 *
 * OR has lower precedence than AND (as in standard search query grammars).
 * Implicit AND via whitespace; explicit AND keyword ignored.
 * NOT/- applies to the immediately following atom.
 */
function parseTokens(tokens: Token[]): GrammarNode | null {
  // Split stream at every OR token into "and segments"
  const orGroups: Token[][] = [];
  let current: Token[] = [];
  for (const tok of tokens) {
    if (tok.type === 'or') {
      orGroups.push(current);
      current = [];
    } else if (tok.type !== 'and') {
      current.push(tok);
    }
    // 'and' keyword ≡ whitespace: ignored
  }
  orGroups.push(current);

  // Within each and-segment, collect atoms (NOT applies to next atom)
  const orNodes: GrammarNode[] = [];
  for (const group of orGroups) {
    const andNodes: GrammarNode[] = [];
    let idx = 0;
    while (idx < group.length) {
      const tok = group[idx]!; // safe: idx < group.length
      if (tok.type === 'not') {
        idx++;
        if (idx < group.length) {
          const inner = tokenToNode(group[idx]!); // safe: idx < group.length
          if (inner !== null) andNodes.push({ kind: 'not', operand: inner });
          idx++;
        }
      } else {
        const node = tokenToNode(tok);
        if (node !== null) andNodes.push(node);
        idx++;
      }
    }
    const andTree = andChain(andNodes);
    if (andTree !== null) orNodes.push(andTree);
  }

  return orChain(orNodes);
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

function toStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function rowValues(row: unknown): string[] {
  if (!isPlainObject(row)) return [toStr(row)];
  return Object.values(row).map(toStr);
}

function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp('^' + escaped + '$', 'i');
}

/**
 * Evaluate a QueryNode (or GrammarNode cast as QueryNode) against a row.
 *
 * @param node       - AST node to evaluate.
 * @param row        - Full row data object.
 * @param searchKeys - Optional column keys to restrict term/regex search.
 *                     `field:` nodes always use the full row.
 */
function evalNode(node: QueryNode, row: unknown, searchKeys?: string[]): boolean {
  switch (node.kind) {
    case 'and':
      return evalNode(node.left, row, searchKeys) && evalNode(node.right, row, searchKeys);
    case 'or':
      return evalNode(node.left, row, searchKeys) || evalNode(node.right, row, searchKeys);
    case 'not':
      return !evalNode(node.operand, row, searchKeys);
    case 'term': {
      const pattern = node.value;
      const vals = searchKeys ? scopedRowValues(row, searchKeys) : rowValues(row);
      if (pattern.includes('*') || pattern.includes('?')) {
        const re = wildcardToRegex(pattern);
        return vals.some((v) => re.test(v));
      }
      const needle = pattern.toLowerCase();
      if (!needle) return true;
      return vals.some((v) => v.toLowerCase().includes(needle));
    }
    case 'regex': {
      const vals = searchKeys ? scopedRowValues(row, searchKeys) : rowValues(row);
      try {
        const re = new RegExp(node.pattern, node.flags || undefined);
        return vals.some((v) => re.test(v));
      } catch {
        return vals.some((v) =>
          v.toLowerCase().includes(node.pattern.toLowerCase())
        );
      }
    }
    case 'field': {
      // field: always reads directly from the full row, ignoring column scope
      const fn = node as unknown as GrammarFieldNode;
      const raw = isPlainObject(row) ? row[fn.field] : undefined;
      return evalFieldNode(fn, raw);
    }
  }
}

/** Extract string values for a specific set of column keys. */
function scopedRowValues(row: unknown, keys: string[]): string[] {
  if (!isPlainObject(row)) return [toStr(row)];
  return keys.map((k) => toStr(row[k]));
}

/** Evaluate a field-scoped node against the raw cell value. */
function evalFieldNode(node: GrammarFieldNode, raw: unknown): boolean {
  const { op, value } = node;

  if (op === 'regex') {
    try {
      const re = new RegExp(value, node.regexFlags ?? 'i');
      return re.test(toStr(raw));
    } catch {
      return toStr(raw).toLowerCase().includes(value.toLowerCase());
    }
  }

  if (op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte') {
    const cellNum = parseFloat(toStr(raw));
    const cmpNum = parseFloat(value);
    if (Number.isNaN(cellNum) || Number.isNaN(cmpNum)) return false;
    if (op === 'gt') return cellNum > cmpNum;
    if (op === 'gte') return cellNum >= cmpNum;
    if (op === 'lt') return cellNum < cmpNum;
    /* lte */ return cellNum <= cmpNum;
  }

  // op === 'eq': substring with optional wildcard support (v2-equivalent)
  const cellStr = toStr(raw);
  const valStr = String(value);
  if (valStr.includes('*') || valStr.includes('?')) {
    return wildcardToRegex(valStr).test(cellStr);
  }
  return cellStr.toLowerCase().includes(valStr.toLowerCase());
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a freetext search query string into a QueryNode AST.
 * Returns null for empty / whitespace-only input.
 *
 * The returned GrammarNode is cast to QueryNode at the boundary.
 * Because createGrammarEngine() supplies both parse and match from this module,
 * the internal GrammarFieldNode.op survives the round-trip.
 */
export function parseQuery(input: string): QueryNode | null {
  const s = String(input ?? '').trim();
  if (!s) return null;
  const tokens = tokenizeInternal(s);
  if (tokens.length === 0) return null;
  const node = parseTokens(tokens);
  return node as unknown as QueryNode;
}

/**
 * Evaluate a QueryNode AST against a row object.
 * Returns true if the row satisfies the query.
 *
 * @param node    - AST produced by parseQuery (or createGrammarEngine().parse).
 * @param row     - Row data object to test.
 * @param _locale - Reserved for future locale-aware string comparison.
 */
export function evalQuery(node: QueryNode, row: unknown, _locale?: string): boolean {
  return evalNode(node, row);
}

/**
 * Tokenise a query string into displayable tokens for syntax highlighting.
 * Each token carries its character offsets in the original string.
 */
export function tokenise(input: string): QueryToken[] {
  const s = String(input ?? '');
  const result: QueryToken[] = [];
  let i = 0;

  while (i < s.length) {
    const start = i;
    const c = ch(s, i);

    if (/\s/.test(c)) { i++; continue; }

    if (c === '/') {
      const r = readRegexLiteral(s, i);
      result.push({ type: 'regex', value: s.slice(start, r.next), start, end: r.next });
      i = r.next;
      continue;
    }

    if (c === '-' && i + 1 < s.length && !/\s/.test(ch(s, i + 1))) {
      result.push({ type: 'operator', value: '-', start, end: i + 1 });
      i++;
      continue;
    }

    if (c === '"') {
      const q = readQuoted(s, i);
      result.push({ type: 'value', value: s.slice(start, q.next), start, end: q.next });
      i = q.next;
      continue;
    }

    const wordStart = i;
    while (i < s.length && !/[\s":/]/.test(ch(s, i))) i++;
    const word = s.slice(wordStart, i);
    if (!word) { i++; continue; }

    const wordUp = word.toUpperCase();
    if (wordUp === 'OR' || wordUp === 'AND' || wordUp === 'NOT') {
      result.push({ type: 'operator', value: word, start, end: i });
      continue;
    }

    if (i < s.length && ch(s, i) === ':') {
      const fieldEnd = i;
      result.push({ type: 'field', value: word, start, end: fieldEnd });
      i++; // consume colon
      // Skip comparison op chars
      const c1 = ch(s, i);
      const c2 = ch(s, i + 1);
      if (c1 === '>' && c2 === '=') i += 2;
      else if (c1 === '<' && c2 === '=') i += 2;
      else if (c1 === '>' || c1 === '<' || c1 === '=') i++;

      const valStart = i;
      if (i < s.length && ch(s, i) === '"') {
        const q = readQuoted(s, i);
        result.push({ type: 'value', value: s.slice(valStart, q.next), start: valStart, end: q.next });
        i = q.next;
      } else if (i < s.length && ch(s, i) === '/') {
        const r = readRegexLiteral(s, i);
        result.push({ type: 'regex', value: s.slice(valStart, r.next), start: valStart, end: r.next });
        i = r.next;
      } else {
        while (i < s.length && !/\s/.test(ch(s, i))) i++;
        if (i > valStart) {
          result.push({ type: 'value', value: s.slice(valStart, i), start: valStart, end: i });
        }
      }
      continue;
    }

    result.push({ type: 'term', value: word, start, end: i });
  }

  return result;
}

/**
 * Create a SearchEngine backed by this grammar parser and evaluator.
 * Register with the store via `store.setSearchEngine(createGrammarEngine())`.
 *
 * When a non-empty columns list is provided by the store, bare terms and
 * standalone regexes only search those columns (matching the default engine's
 * behaviour in core/state).  `field:` expressions always read the named row
 * property directly, so users can query fields that are not displayed.
 */
export function createGrammarEngine(): SearchEngine {
  return {
    parse(query: string): QueryNode | null {
      return parseQuery(query);
    },
    match(row: unknown, ast: QueryNode | null, columns: TableCrafterColumn[]): boolean {
      if (ast === null) return true;
      const searchKeys =
        columns.length > 0 ? columns.map((c) => c.key) : undefined;
      return evalNode(ast, row, searchKeys);
    },
  };
}
