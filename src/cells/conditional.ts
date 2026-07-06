/**
 * cells/conditional.ts
 *
 * Conditional formatting cell renderer and rules engine.
 * Supports dataBar, colorScale, and icon set formats driven by a rule list.
 * Phase 0: typed stub.
 */

import type { CellRendererFn, TableCrafterColumn } from '../core/types';

/** A single conditional formatting rule. */
export interface ConditionalRule {
  type: 'dataBar' | 'colorScale' | 'icon';
  condition: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'between' | 'always';
  value?: number | undefined;
  value2?: number | undefined;
  /** CSS colour string (for colorScale). */
  color?: string | undefined;
  /** Icon name (for icon sets). */
  icon?: string | undefined;
}

export const renderConditional: CellRendererFn = (
  _value: unknown,
  _row: unknown,
  _column: TableCrafterColumn
): string | HTMLElement => {
  throw new Error('renderConditional: not implemented -- Phase 2');
};

/**
 * Evaluate a list of ConditionalRules against a value and return the first
 * matching rule, or null if none match.
 */
export function evalConditionalRules(
  _value: unknown,
  _rules: ConditionalRule[]
): ConditionalRule | null {
  throw new Error('evalConditionalRules: not implemented -- Phase 2');
}
