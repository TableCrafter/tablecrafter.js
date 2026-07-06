/**
 * filtering/fuzzy.ts
 *
 * Optional fuzzy string matcher.  Wraps the grammar SearchEngine and activates
 * fuzzy matching when the query is a single bare term (no field:, OR, or NOT
 * nodes in the AST).  Complex queries fall back to the wrapped engine's exact
 * evaluation so the user always gets correct boolean results.
 *
 * Algorithm: sequential character matching with a scoring model that rewards
 * consecutive runs, word-start positions, and prefix matches.  Levenshtein
 * distance is not used (pure greedy sequential scan is fast and sufficient for
 * interactive search).
 */

import type { QueryNode, TableCrafterColumn } from '../core/types';
import type { SearchEngine } from '../core/state';
import { createGrammarEngine } from './grammar';

// Re-export grammar utilities for consumers that import from this module
export { parseQuery, evalQuery, createGrammarEngine } from './grammar';

// ---------------------------------------------------------------------------
// FuzzyResult
// ---------------------------------------------------------------------------

/** Result from a fuzzy match operation. */
export interface FuzzyResult {
  /** Whether the needle was found at or above the threshold. */
  match: boolean;
  /** 0–1 score where 1 is a perfect/exact match. */
  score: number;
  /** Indices of matched characters in the haystack, for highlighting. */
  indices: number[];
}

// ---------------------------------------------------------------------------
// Core fuzzy algorithm
// ---------------------------------------------------------------------------

const DEFAULT_THRESHOLD = 0.4;

/**
 * Test whether `needle` fuzzy-matches `haystack`.
 *
 * Scoring heuristics (each in 0–1 range, combined with weights):
 * - Sequential character coverage: matched / needle.length
 * - Consecutive-run bonus: runs of ≥2 consecutive chars score higher
 * - Word-start bonus: a matched char that starts a word (after space / punct)
 * - Prefix bonus: first char of haystack matches first char of needle
 *
 * @param needle     - Search term (typically a user-typed word).
 * @param haystack   - Cell value to test against.
 * @param threshold  - Minimum score to count as a match (default 0.4).
 */
export function fuzzyMatch(
  needle: string,
  haystack: string,
  threshold = DEFAULT_THRESHOLD
): FuzzyResult {
  if (!needle) return { match: true, score: 1, indices: [] };
  if (!haystack) return { match: false, score: 0, indices: [] };

  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();

  // Fast path: exact substring
  const exactIdx = h.indexOf(n);
  if (exactIdx !== -1) {
    const indices = Array.from({ length: n.length }, (_, k) => exactIdx + k);
    return { match: true, score: 1, indices };
  }

  // Sequential character scan (greedy, leftmost match)
  const matched: number[] = [];
  let hIdx = 0;
  for (let ni = 0; ni < n.length; ni++) {
    const found = h.indexOf(n.charAt(ni), hIdx);
    if (found === -1) break;
    matched.push(found);
    hIdx = found + 1;
  }

  if (matched.length === 0) return { match: false, score: 0, indices: [] };

  // Coverage: fraction of needle chars we found
  const coverage = matched.length / n.length;

  // Consecutive run score: reward unbroken sequences
  let runs = 0;
  let runLen = 1;
  for (let k = 1; k < matched.length; k++) {
    if (matched[k]! === matched[k - 1]! + 1) {
      runLen++;
    } else {
      if (runLen >= 2) runs += runLen;
      runLen = 1;
    }
  }
  if (runLen >= 2) runs += runLen;
  const runScore = matched.length > 1 ? runs / (matched.length - 1 + runs + 1) : 0;

  // Word-start bonus: fraction of matched chars that start a word
  const wordBoundary = /[\s\-_./\\()\[\]{},;:@#!?]/;
  let wordStartCount = 0;
  for (const idx of matched) {
    const prev = idx === 0 ? '' : haystack.charAt(idx - 1);
    if (idx === 0 || wordBoundary.test(prev)) wordStartCount++;
  }
  const wordScore = matched.length > 0 ? wordStartCount / matched.length : 0;

  // Prefix bonus: first matched char is at position 0
  const prefixBonus = matched[0] === 0 ? 0.2 : 0;

  // Weighted combination
  const score = Math.min(
    1,
    coverage * 0.5 + runScore * 0.25 + wordScore * 0.15 + prefixBonus
  );

  return {
    match: coverage === 1 && score >= threshold,
    score,
    indices: matched,
  };
}

// ---------------------------------------------------------------------------
// HTML highlighting
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Wrap the matched character positions in the haystack with a highlight tag.
 * Adjacent consecutive matched indices are merged into a single tag.
 * The returned string is safe for use in `innerHTML` (HTML entities escaped).
 *
 * @param haystack  - Original cell value string.
 * @param indices   - Array of matched character positions (may be unsorted).
 * @param wrapTag   - HTML tag name for wrapping (default: `mark`).
 */
export function highlightMatch(
  haystack: string,
  indices: number[],
  wrapTag = 'mark'
): string {
  if (!indices.length) return escapeHtml(haystack);

  const sorted = [...new Set(indices)].sort((a, b) => a - b);
  const tag = escapeHtml(wrapTag);
  let result = '';
  let pos = 0;

  let k = 0;
  while (k < sorted.length) {
    const rangeStart = sorted[k]!; // safe: k < sorted.length
    // Extend to consecutive run
    let rangeEnd = rangeStart;
    while (k + 1 < sorted.length && sorted[k + 1]! === rangeEnd + 1) {
      rangeEnd = sorted[++k]!;
    }
    k++;

    // Emit unmatched prefix
    if (pos < rangeStart) {
      result += escapeHtml(haystack.slice(pos, rangeStart));
    }
    // Emit highlighted run
    result += `<${tag}>${escapeHtml(haystack.slice(rangeStart, rangeEnd + 1))}</${tag}>`;
    pos = rangeEnd + 1;
  }

  // Trailing unmatched suffix
  if (pos < haystack.length) {
    result += escapeHtml(haystack.slice(pos));
  }

  return result;
}

// ---------------------------------------------------------------------------
// AST complexity probe
// ---------------------------------------------------------------------------

/**
 * Returns true when the AST contains any `field`, `or`, `not`, or `regex` node.
 * Used to decide whether fuzzy matching should be suppressed.
 *
 * Fuzzy matching is semantically meaningful only for a single bare term
 * (e.g. `alice`).  The moment the query contains operators that change the
 * match set in non-trivial ways (negation, OR branches, field-scoped tests)
 * the user expects exact boolean semantics, so we fall back to the grammar
 * engine's exact evaluation.
 */
export function isComplexAst(node: QueryNode | null): boolean {
  if (node === null) return false;
  switch (node.kind) {
    case 'field':
    case 'not':
    case 'or':
    case 'regex':
      return true;
    case 'and':
      return isComplexAst(node.left) || isComplexAst(node.right);
    case 'term':
      return false;
  }
}

// ---------------------------------------------------------------------------
// Fuzzy SearchEngine wrapper
// ---------------------------------------------------------------------------

/**
 * Create a fuzzy SearchEngine that wraps an inner engine (defaults to the
 * grammar engine).
 *
 * Behaviour:
 * - If the parsed AST is null (empty query) → match everything.
 * - If the AST is complex (contains field/or/not/regex) → delegate to the
 *   inner engine for exact boolean evaluation.
 * - Otherwise (single or AND-of-terms) → fuzzy-match each term independently
 *   across all column values; all terms must fuzzy-match at least one column
 *   value (AND semantics preserved).
 *
 * @param threshold  - Fuzzy match threshold, 0–1 (default 0.4).
 * @param inner      - Fallback exact-match engine (default: grammar engine).
 */
export function createFuzzyEngine(
  threshold = DEFAULT_THRESHOLD,
  inner: SearchEngine = createGrammarEngine()
): SearchEngine {
  return {
    parse(query: string): QueryNode | null {
      return inner.parse(query);
    },

    match(row: unknown, ast: QueryNode | null, columns: TableCrafterColumn[]): boolean {
      if (ast === null) return true;

      // Delegate to exact engine for complex queries
      if (isComplexAst(ast)) {
        return inner.match(row, ast, columns);
      }

      // Collect bare terms from the (possibly AND-chained) AST
      const terms = collectTerms(ast);

      if (terms.length === 0) {
        return inner.match(row, ast, columns);
      }

      // Gather searchable string values from the row
      const cellValues = getCellValues(row, columns);

      // ALL terms must fuzzy-match at least one cell value
      return terms.every((term) =>
        cellValues.some((cv) => fuzzyMatch(term, cv, threshold).match)
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collect all `term` node values from an AND-chain AST. */
function collectTerms(node: QueryNode): string[] {
  switch (node.kind) {
    case 'term':
      return [node.value];
    case 'and':
      return [...collectTerms(node.left), ...collectTerms(node.right)];
    default:
      return [];
  }
}

/** Return searchable string values for a row, respecting column list if given. */
function getCellValues(row: unknown, columns: TableCrafterColumn[]): string[] {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) {
    return [String(row ?? '')];
  }
  const rec = row as Record<string, unknown>;
  const keys =
    columns.length > 0 ? columns.map((c) => c.key) : Object.keys(rec);
  return keys.map((k) => {
    const v = rec[k];
    return v === null || v === undefined ? '' : String(v);
  });
}
