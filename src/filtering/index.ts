/**
 * filtering/index.ts
 *
 * Per-column filter helpers and filter-type auto-detection.
 * All functions are pure (no DOM, no side-effects) so they can be called from
 * the store reducer, a headless consumer, or the renderer's filter-UI builder.
 *
 * Auto-detection logic ported from v2 `detectFilterTypes()` / `isDateField()` /
 * `isNumericField()` (src/tablecrafter.js ~lines 1766–1835).
 */

import type {
  TableState,
  FilterPayload,
  ColumnFilter,
  TableCrafterColumn,
} from '../core/types';
import type { SearchEngine } from '../core/state';
export { createGrammarEngine } from './grammar';
export { createFuzzyEngine, fuzzyMatch, highlightMatch, isComplexAst } from './fuzzy';
export type { FuzzyResult } from './fuzzy';
export type { GrammarFieldNode, GrammarNode, FieldOp, QueryToken } from './grammar';

// ---------------------------------------------------------------------------
// Filter-type auto-detection (renderer consumption)
// ---------------------------------------------------------------------------

/**
 * Logical filter-UI type.  The renderer picks a control widget based on this.
 *
 * - `date`        → date-range picker
 * - `number`      → numeric range inputs
 * - `multiselect` → checkbox / multi-select dropdown
 * - `text`        → plain text input (default)
 */
export type FilterType = 'date' | 'number' | 'multiselect' | 'text';

/**
 * Date string patterns recognised by auto-detection (v2-equivalent).
 * Must match strictly to avoid false positives from plain numbers.
 */
const DATE_PATTERNS: RegExp[] = [
  /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
  /^\d{2}\/\d{2}\/\d{4}$/, // MM/DD/YYYY
  /^\d{2}-\d{2}-\d{4}$/, // MM-DD-YYYY
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, // ISO-8601 datetime
];

/**
 * Return true when the string looks like a recognised date format.
 * Mirrors v2 `isDateField` (single-value variant for public use).
 */
export function isDateValue(s: string): boolean {
  if (!s || s.length < 6) return false;
  const str = String(s);
  if (DATE_PATTERNS.some((p) => p.test(str))) return true;
  // Accept strings that Date.parse() understands but are not plain numbers
  return str.length > 6 && !Number.isNaN(Date.parse(str)) && Number.isNaN(Number(str));
}

/**
 * Return true when the string represents a finite number.
 * Mirrors v2 `isNumericField` (single-value variant for public use).
 */
export function isNumericValue(s: string): boolean {
  if (!s && s !== '0') return false;
  const n = parseFloat(String(s));
  return !Number.isNaN(n) && Number.isFinite(n);
}

/**
 * Field-name patterns that should not be treated as multiselect even when
 * cardinality is low.  Mirrors v2's regexp guard in `detectFilterTypes`.
 */
const TEXT_FIELD_PATTERN = /name|email|title|desc|phone|address|subject/i;

/**
 * Field-name patterns that should not be treated as a date field.
 * v2 explicitly skips `sku|id|ref|code|serial|part` for date detection.
 */
const NON_DATE_FIELD_PATTERN = /sku|id|ref|code|serial|part/i;

/**
 * Detect the best filter UI type for a column given its sample values.
 *
 * Algorithm (v2-equivalent):
 * 1. Sample up to 5 non-null values.  If all look like dates → `date`.
 * 2. Sample up to 10 non-null values.  If all are numeric → `number`.
 * 3. If unique value count is 2–20 AND the field name is not a common free-text
 *    identifier → `multiselect`.
 * 4. Otherwise → `text`.
 *
 * @param values    - All values in the column (may be mixed types).
 * @param fieldName - Optional column key for field-name heuristics.
 */
export function detectFilterType(values: unknown[], fieldName?: string): FilterType {
  const nonNull = values.filter((v) => v !== null && v !== undefined && v !== '');
  if (nonNull.length === 0) return 'text';

  const strings = nonNull.map((v) => String(v));

  // 1. Date detection (sample 5 values; skip fields whose names look like IDs)
  if (!fieldName || !NON_DATE_FIELD_PATTERN.test(fieldName)) {
    const dateSample = strings.slice(0, 5);
    if (dateSample.length > 0 && dateSample.every((s) => isDateValue(s))) {
      return 'date';
    }
  }

  // 2. Numeric detection (sample 10 values)
  const numSample = strings.slice(0, 10);
  if (numSample.length > 0 && numSample.every((s) => isNumericValue(s))) {
    return 'number';
  }

  // 3. Low-cardinality multiselect (≤20 unique values, >1, not a text identifier)
  const unique = new Set(strings);
  if (
    unique.size >= 2 &&
    unique.size <= 20 &&
    (!fieldName || !TEXT_FIELD_PATTERN.test(fieldName))
  ) {
    return 'multiselect';
  }

  return 'text';
}

/**
 * Detect the default `ColumnFilter` operator for a column.
 * The renderer uses this to pre-populate the operator dropdown.
 *
 * Mapping (v2-informed):
 * - `select` / `checkbox` / `boolean` → `in` (multi-value matching)
 * - `number` → `eq` (exact, user upgrades to range)
 * - `date` → `eq` (exact, user upgrades to range)
 * - everything else → `contains` (substring, the most common text op)
 */
export function detectFilterOperator(column: TableCrafterColumn): ColumnFilter['operator'] {
  const t = column.type;
  if (t === 'select' || t === 'checkbox') return 'in';
  if (t === 'number') return 'eq';
  if (t === 'date') return 'eq';
  return 'contains';
}

// ---------------------------------------------------------------------------
// Low-level row filter test
// ---------------------------------------------------------------------------

function toStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

function numeric(v: unknown): number | null {
  const n = parseFloat(toStr(v));
  return Number.isNaN(n) ? null : n;
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

/**
 * Test a single row against a ColumnFilter.
 * Returns true if the row passes the filter (i.e. should be shown).
 *
 * This is the low-level predicate; the store and applyFilter both call it.
 */
export function testFilter(row: unknown, column: string, filter: ColumnFilter): boolean {
  const cell =
    typeof row === 'object' && row !== null && !Array.isArray(row)
      ? (row as Record<string, unknown>)[column]
      : undefined;
  const { operator, value } = filter;

  switch (operator) {
    case 'eq':
      return cell === value;
    case 'neq':
      return cell !== value;
    case 'contains':
      return toStr(cell).toLowerCase().includes(toStr(value).toLowerCase());
    case 'notContains':
      return !toStr(cell).toLowerCase().includes(toStr(value).toLowerCase());
    case 'startsWith':
      return toStr(cell).toLowerCase().startsWith(toStr(value).toLowerCase());
    case 'endsWith':
      return toStr(cell).toLowerCase().endsWith(toStr(value).toLowerCase());
    case 'gt': {
      const cn = numeric(cell);
      const vn = numeric(value);
      if (cn !== null && vn !== null) return cn > vn;
      return toStr(cell) > toStr(value);
    }
    case 'gte': {
      const cn = numeric(cell);
      const vn = numeric(value);
      if (cn !== null && vn !== null) return cn >= vn;
      return toStr(cell) >= toStr(value);
    }
    case 'lt': {
      const cn = numeric(cell);
      const vn = numeric(value);
      if (cn !== null && vn !== null) return cn < vn;
      return toStr(cell) < toStr(value);
    }
    case 'lte': {
      const cn = numeric(cell);
      const vn = numeric(value);
      if (cn !== null && vn !== null) return cn <= vn;
      return toStr(cell) <= toStr(value);
    }
    case 'in':
      return Array.isArray(value) && value.includes(cell);
    case 'notIn':
      return !(Array.isArray(value) && value.includes(cell));
    case 'empty':
      return isEmpty(cell);
    case 'notEmpty':
      return !isEmpty(cell);
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Pure state reducers
// ---------------------------------------------------------------------------

/**
 * Apply a column filter action to the state, recomputing derived row sets.
 * Passing `payload.filter = null` clears the filter for that column.
 *
 * The returned `sortedRows` equals `filteredRows` in natural order; sorting
 * is a concern of the `sorting/` module.  The caller should compose both if
 * needed.
 */
export function applyFilter(
  state: TableState,
  payload: FilterPayload
): Pick<
  TableState,
  'filters' | 'filteredRows' | 'sortedRows' | 'displayRows' | 'page' | 'pageCount' | 'totalRows'
> {
  // Build the new filters map
  const nextFilters: Record<string, ColumnFilter | undefined> = {
    ...state.filters,
  };
  if (payload.filter === null) {
    delete nextFilters[payload.column];
  } else {
    nextFilters[payload.column] = payload.filter;
  }

  return computeFilteredState(state, nextFilters);
}

/**
 * Clear one or all column filters, recomputing derived row sets.
 *
 * @param state   - Current table state.
 * @param column  - If provided, clears only that column's filter.
 *                  If omitted, clears all filters.
 */
export function clearFilter(
  state: TableState,
  column?: string
): Pick<
  TableState,
  'filters' | 'filteredRows' | 'sortedRows' | 'displayRows' | 'page' | 'pageCount' | 'totalRows'
> {
  let nextFilters: Record<string, ColumnFilter | undefined>;
  if (column === undefined) {
    nextFilters = {};
  } else {
    nextFilters = { ...state.filters };
    delete nextFilters[column];
  }
  return computeFilteredState(state, nextFilters);
}

// ---------------------------------------------------------------------------
// Internal derivation helper
// ---------------------------------------------------------------------------

function computeFilteredState(
  state: TableState,
  nextFilters: Record<string, ColumnFilter | undefined>
): Pick<
  TableState,
  'filters' | 'filteredRows' | 'sortedRows' | 'displayRows' | 'page' | 'pageCount' | 'totalRows'
> {
  const activeFilters = Object.entries(nextFilters).filter(
    ([, f]) => f !== undefined
  ) as [string, ColumnFilter][];

  const filteredRows = state.rows.filter((row) => {
    for (const [col, filter] of activeFilters) {
      if (!testFilter(row, col, filter)) return false;
    }
    return true;
  });

  const totalRows = filteredRows.length;
  const { pageSize } = state;

  let page = state.page;
  let pageCount: number;
  let displayRows: unknown[];

  if (pageSize <= 0) {
    page = 1;
    pageCount = 1;
    displayRows = filteredRows.slice();
  } else {
    pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
    if (page < 1) page = 1;
    if (page > pageCount) page = pageCount;
    const start = (page - 1) * pageSize;
    displayRows = filteredRows.slice(start, start + pageSize);
  }

  return {
    filters: nextFilters,
    filteredRows,
    sortedRows: filteredRows.slice(), // caller may re-sort
    displayRows,
    page,
    pageCount,
    totalRows,
  };
}

// ---------------------------------------------------------------------------
// Engine composition
// ---------------------------------------------------------------------------

/**
 * Compose multiple SearchEngines into one.
 *
 * The composed engine's `parse` uses the first engine.
 * The composed engine's `match` returns true only when ALL engines agree that
 * the row matches (logical AND of all engine decisions).
 *
 * This lets you layer additional semantics on top of the grammar engine — for
 * example, adding a custom domain-specific matcher after the grammar one.
 *
 * @example
 * ```ts
 * const engine = composeEngines(createGrammarEngine(), myDomainEngine);
 * store.setSearchEngine(engine);
 * ```
 */
export function composeEngines(...engines: SearchEngine[]): SearchEngine {
  if (engines.length === 0) {
    // Identity engine: matches everything
    return {
      parse: () => null,
      match: () => true,
    };
  }
  if (engines.length === 1) return engines[0]!;

  const first = engines[0]!;
  return {
    parse(query: string) {
      return first.parse(query);
    },
    match(row, ast, columns) {
      return engines.every((e) => e.match(row, ast, columns));
    },
  };
}
