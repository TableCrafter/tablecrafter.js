/**
 * validation/index.ts
 *
 * Built-in validation rules: required, minLength, maxLength, min, max,
 * pattern, unique, oneOf, phone, date, and custom.
 * Validation runs on edit commit inside the editing module.
 * Phase 0: typed stub.
 */

import type {
  ValidationRule,
  ValidationResult,
  TableCrafterColumn,
  TableState,
} from '../core/types';

/**
 * Run all validation rules for a column against a proposed value.
 * Passes the full rows array for unique-constraint checking.
 */
export function validateCell(
  _value: unknown,
  _column: TableCrafterColumn,
  _state: TableState
): ValidationResult {
  throw new Error('validateCell: not implemented -- Phase 2');
}

/**
 * Evaluate a single ValidationRule against a value.
 * Returns the error string, or null if the value passes.
 */
export function evalRule(
  _value: unknown,
  _rule: ValidationRule,
  _context: { rows: unknown[]; column: TableCrafterColumn }
): string | null {
  throw new Error('evalRule: not implemented -- Phase 2');
}
