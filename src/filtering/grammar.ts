/**
 * filtering/grammar.ts
 *
 * Search grammar parser.  Converts a freetext query string into a QueryNode
 * AST that the filter engine evaluates against each row.
 *
 * Grammar (EBNF sketch):
 *   expr     = or_expr
 *   or_expr  = and_expr ('OR' and_expr)*
 *   and_expr = not_expr ('AND'? not_expr)*
 *   not_expr = 'NOT'? primary
 *   primary  = field_term | regex_term | term | '(' expr ')'
 *   field_term = IDENT ':' value
 *   regex_term = '/' pattern '/' flags?
 *   term     = word
 *
 * Phase 0: typed stub.
 */

import type { QueryNode } from '../core/types';

/**
 * Parse a freetext search query string into a QueryNode AST.
 * Returns null for empty/whitespace-only input.
 */
export function parseQuery(_input: string): QueryNode | null {
  throw new Error('parseQuery: not implemented -- Phase 2');
}

/**
 * Evaluate a QueryNode AST against a row object.
 * Returns true if the row satisfies the query.
 */
export function evalQuery(
  _node: QueryNode,
  _row: unknown,
  _locale?: string
): boolean {
  throw new Error('evalQuery: not implemented -- Phase 2');
}

/**
 * Tokenise a query string into raw tokens for display (e.g. syntax highlighting).
 */
export function tokenise(_input: string): QueryToken[] {
  throw new Error('tokenise: not implemented -- Phase 2');
}

/** A token produced by the tokeniser. */
export interface QueryToken {
  type: 'operator' | 'field' | 'value' | 'regex' | 'term' | 'paren';
  value: string;
  start: number;
  end: number;
}
