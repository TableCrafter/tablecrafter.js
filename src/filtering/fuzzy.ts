/**
 * filtering/fuzzy.ts
 *
 * Optional fuzzy string matcher.  Used by the search engine when the query
 * contains a term without field: prefix and exact matching is disabled.
 * Phase 0: typed stub.
 */

/** Result from a fuzzy match operation. */
export interface FuzzyResult {
  /** Whether the needle was found. */
  match: boolean;
  /** 0-1 score (1 = perfect). */
  score: number;
  /** Indices of matching characters in the haystack for highlighting. */
  indices: number[];
}

/**
 * Test whether needle is a fuzzy match against haystack.
 * Uses a trigram + Levenshtein approach calibrated to typo tolerance.
 */
export function fuzzyMatch(
  _needle: string,
  _haystack: string,
  _threshold?: number
): FuzzyResult {
  throw new Error('fuzzyMatch: not implemented -- Phase 2');
}

/**
 * Wrap matched character indices in a span for highlighting.
 * Safe for use in innerHTML -- escapes haystack HTML entities.
 */
export function highlightMatch(
  _haystack: string,
  _indices: number[],
  _wrapTag?: string
): string {
  throw new Error('highlightMatch: not implemented -- Phase 2');
}
