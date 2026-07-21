/**
 * filtering/url-filters.ts
 *
 * Bidirectional mapping between the URL query string and column filter state
 * for bookmarkable filtered views (#337). Query params use a `tc_` prefix
 * (e.g. `?tc_status=active`) and map to `contains` filters, mirroring the
 * plugin's `?gt_col_x=value` pre-filtering.
 *
 * Pure functions — no `window` access; callers pass `location.search`.
 */

import type { ColumnFilter } from '../core/types';
import type { FilterState } from './presets';

const PREFIX = 'tc_';

/** Parse `?tc_{field}=value` params into `contains` column filters. */
export function parseUrlFilters(search: string): FilterState {
  const params = new URLSearchParams(search);
  const filters: FilterState = {};
  for (const [key, value] of params) {
    if (key.startsWith(PREFIX)) {
      const column = key.slice(PREFIX.length);
      if (column) filters[column] = { operator: 'contains', value } as ColumnFilter;
    }
  }
  return filters;
}

/**
 * Serialize filter state into a query string, replacing any existing `tc_`
 * params while preserving all unrelated params from `existingSearch`.
 */
export function serializeUrlFilters(filters: FilterState, existingSearch = ''): string {
  const params = new URLSearchParams(existingSearch);
  for (const key of [...params.keys()]) {
    if (key.startsWith(PREFIX)) params.delete(key);
  }
  for (const [column, filter] of Object.entries(filters)) {
    if (filter && filter.value !== undefined && filter.value !== null && filter.value !== '') {
      params.set(`${PREFIX}${column}`, String(filter.value));
    }
  }
  return params.toString();
}
