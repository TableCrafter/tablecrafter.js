/**
 * core/state.ts
 *
 * Store factory.  createTable() is the single entry point for all v3 consumers.
 *
 * The store holds the entire table state over an in-memory row set and derives
 * filteredRows -> sortedRows -> displayRows on every mutation.  Sorting,
 * filtering, editing, validation, export and data-loading each expose a
 * well-defined SEAM that the Phase 2 leaf modules register into; the store
 * ships a working default for every seam so the headless core is usable on its
 * own.
 *
 * Composition order (ported from the v2 monolith `_computeFilteredData` +
 * `_applySortKeys` + `getPaginatedData`):
 *
 *   rows  --(column filters AND search)-->  filteredRows
 *   filteredRows  --(stable sort)-->        sortedRows
 *   sortedRows  --(page slice)-->           displayRows
 *
 * ZERO DOM access anywhere in this module (enforced by headless.test.ts).
 */

import type {
  Store,
  TableState,
  TableCrafterConfig,
  TableCrafterColumn,
  TableCrafterPlugin,
  PluginContext,
  Action,
  SortDirection,
  SortState,
  ColumnFilter,
  QueryNode,
  RowId,
  EditingCell,
  ExportFormat,
  ExportOptions,
  ValidationResult,
  EventHandler,
} from './types';
import { createEventEmitter } from './events';
import type { EventEmitter } from './events';
import { createPluginRegistry } from './plugins';
import type { PluginRegistry } from './plugins';

// ---------------------------------------------------------------------------
// Phase 2 seam interfaces (handoff contract for the fan-out agents)
// ---------------------------------------------------------------------------

/**
 * Sorting seam (Phase 2 `sorting/`).  A comparator returns <0, 0 or >0 and is
 * applied ascending; the store negates the result for descending sorts and
 * always tie-breaks on original index for stability.
 */
export type Comparator = (
  a: unknown,
  b: unknown,
  rowA: unknown,
  rowB: unknown
) => number;

/**
 * Search seam (Phase 2 `filtering/grammar.ts` + `filtering/fuzzy.ts`).
 * `parse` turns a raw query into a QueryNode AST (or null for an empty query);
 * `match` decides whether a row satisfies that AST.  The default engine does a
 * plain case-insensitive substring test across all columns.
 */
export interface SearchEngine {
  parse(query: string): QueryNode | null;
  match(
    row: unknown,
    ast: QueryNode | null,
    columns: TableCrafterColumn[]
  ): boolean;
}

/**
 * Validation seam (Phase 2 `validation/`).  Called on edit commit; returning
 * an invalid result blocks the commit and surfaces the errors on state.error.
 * The default validator always passes.
 */
export type Validator = (
  value: unknown,
  column: TableCrafterColumn,
  row: unknown,
  allRows: unknown[]
) => ValidationResult;

/**
 * Export seam (Phase 2 `export/*`).  Modules register a handler per format via
 * `registerExportFormat`; `store.export(format)` looks it up and invokes it
 * with a fresh state snapshot.
 */
export type ExportHandler = (
  state: TableState,
  options: ExportOptions | undefined,
  columns: TableCrafterColumn[]
) => void | Promise<void>;

/**
 * Data-source seam (Phase 2 `adapters/*`).  A loader resolves the configured
 * string source to a row array.  The default loader uses `globalThis.fetch`
 * and parses JSON.  Loading fires beforeLoad/afterLoad plugin hooks.
 */
export type DataLoader = (source: string, signal?: AbortSignal) => Promise<unknown[]>;

/**
 * The concrete store returned by createTable(): the frozen `Store` contract
 * plus the Phase 2 registration seams and the plugin/loader surface.  Assignable
 * to `Store` (the contract test asserts this), so consumers typed against
 * `Store` never see the extra members.
 */
export interface TableCrafterStore extends Store {
  // Plugin surface
  use(plugin: TableCrafterPlugin, options?: unknown): TableCrafterStore;
  unuse(name: string): boolean;
  listPlugins(): string[];

  // Phase 2 seams
  setComparator(column: string, comparator: Comparator): void;
  setSearchEngine(engine: SearchEngine): void;
  setValidator(validator: Validator): void;
  registerExportFormat(format: string, handler: ExportHandler): void;
  setLoader(loader: DataLoader): void;

  // Data lifecycle
  load(): Promise<void>;
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_PAGE_SIZE = 25;
const HISTORY_CAP = 100;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function toSearchString(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

/** v2-faithful default comparator: nulls last (ascending), else `<` ordering. */
function defaultCompare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (a as any) < (b as any) ? -1 : 1;
}

/** Default search engine: plain case-insensitive substring across columns. */
function createDefaultSearchEngine(): SearchEngine {
  return {
    parse(query: string): QueryNode | null {
      const trimmed = query.trim();
      return trimmed ? { kind: 'term', value: trimmed } : null;
    },
    match(row: unknown, ast: QueryNode | null, columns: TableCrafterColumn[]): boolean {
      if (ast === null) return true;
      const needle = ast.kind === 'term' ? ast.value.toLowerCase() : '';
      if (!needle) return true;
      if (!isRecord(row)) return false;
      const keys =
        columns.length > 0 ? columns.map((c) => c.key) : Object.keys(row);
      for (const key of keys) {
        if (toSearchString(row[key]).toLowerCase().includes(needle)) return true;
      }
      return false;
    },
  };
}

/** Default validator: always valid.  Phase 2 validation/ replaces this. */
const defaultValidator: Validator = () => ({ valid: true, errors: [] });

/** Default loader: fetch JSON via globalThis.fetch (no DOM, no window). */
const defaultLoader: DataLoader = async (source, signal) => {
  const f = (globalThis as { fetch?: typeof fetch }).fetch;
  if (typeof f !== 'function') {
    throw new Error(
      'TableCrafter: no fetch available; call setLoader() to supply a data loader'
    );
  }
  const res = await f(source, signal ? { signal } : undefined);
  const json: unknown = await res.json();
  return Array.isArray(json) ? json : [];
};

// ---------------------------------------------------------------------------
// Column filter evaluation
// ---------------------------------------------------------------------------

function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

function numeric(v: unknown): number | null {
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function relational(
  cell: unknown,
  target: unknown,
  op: 'gt' | 'gte' | 'lt' | 'lte'
): boolean {
  const cn = numeric(cell);
  const tn = numeric(target);
  let cmp: number;
  if (cn !== null && tn !== null) {
    cmp = cn < tn ? -1 : cn > tn ? 1 : 0;
  } else {
    const cs = toSearchString(cell);
    const ts = toSearchString(target);
    cmp = cs < ts ? -1 : cs > ts ? 1 : 0;
  }
  switch (op) {
    case 'gt':
      return cmp > 0;
    case 'gte':
      return cmp >= 0;
    case 'lt':
      return cmp < 0;
    case 'lte':
      return cmp <= 0;
  }
}

function matchColumnFilter(cell: unknown, filter: ColumnFilter): boolean {
  const { operator, value } = filter;
  switch (operator) {
    case 'eq':
      return cell === value;
    case 'neq':
      return cell !== value;
    case 'contains':
      return toSearchString(cell).toLowerCase().includes(toSearchString(value).toLowerCase());
    case 'notContains':
      return !toSearchString(cell).toLowerCase().includes(toSearchString(value).toLowerCase());
    case 'startsWith':
      return toSearchString(cell).toLowerCase().startsWith(toSearchString(value).toLowerCase());
    case 'endsWith':
      return toSearchString(cell).toLowerCase().endsWith(toSearchString(value).toLowerCase());
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return relational(cell, value, operator);
    case 'in':
      return Array.isArray(value) && value.includes(cell);
    case 'notIn':
      return !(Array.isArray(value) && value.includes(cell));
    case 'empty':
      return isEmptyValue(cell);
    case 'notEmpty':
      return !isEmptyValue(cell);
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Store factory
// ---------------------------------------------------------------------------

/**
 * Create a headless TableCrafter store from a configuration object.
 *
 * @param config - Table configuration including data, columns, and options.
 * @returns A fully-typed TableCrafterStore (assignable to the frozen Store).
 */
export function createTable(config: TableCrafterConfig): TableCrafterStore {
  if (!config || typeof config !== 'object') {
    throw new Error('TableCrafter: createTable(config) requires a config object');
  }

  const columns: TableCrafterColumn[] = Array.isArray(config.columns)
    ? config.columns.slice()
    : [];

  // ---- mutable internal model -------------------------------------------
  let rows: unknown[] = Array.isArray(config.data) ? config.data.slice() : [];
  const source: string | null =
    typeof config.data === 'string' ? config.data : null;

  let sort: SortState | null = null;
  const filters = new Map<string, ColumnFilter>();
  let searchQuery = '';
  let searchAst: QueryNode | null = null;
  let page = 1;
  let pageSize =
    typeof config.pageSize === 'number' && config.pageSize >= 0
      ? config.pageSize
      : DEFAULT_PAGE_SIZE;
  const selection = new Set<RowId>();
  let editingCell: EditingCell | null = null;
  let pendingEditValue: unknown = undefined;
  let loading = false;
  let error: string | null = null;

  // ---- seams -------------------------------------------------------------
  const comparators = new Map<string, Comparator>();
  let searchEngine: SearchEngine = createDefaultSearchEngine();
  let validator: Validator = defaultValidator;
  const exportRegistry = new Map<string, ExportHandler>();
  let loader: DataLoader = defaultLoader;

  // ---- history -----------------------------------------------------------
  const undoStack: unknown[][] = [];
  const redoStack: unknown[][] = [];

  // ---- infra -------------------------------------------------------------
  const emitter: EventEmitter = createEventEmitter();
  const subscribers = new Set<(state: TableState) => void>();
  let currentState: TableState;

  // ---- row identity ------------------------------------------------------
  function rowIdOf(row: unknown, index: number): RowId {
    if (isRecord(row) && Object.prototype.hasOwnProperty.call(row, 'id')) {
      const id = row['id'];
      if (typeof id === 'string' || typeof id === 'number') return id;
    }
    return index;
  }

  function resolveRow(rowId: RowId): { row: unknown; index: number } | null {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (isRecord(row) && Object.prototype.hasOwnProperty.call(row, 'id')) {
        const id = row['id'];
        if ((typeof id === 'string' || typeof id === 'number') && id === rowId) {
          return { row, index: i };
        }
      }
    }
    if (
      typeof rowId === 'number' &&
      Number.isInteger(rowId) &&
      rowId >= 0 &&
      rowId < rows.length
    ) {
      return { row: rows[rowId], index: rowId };
    }
    return null;
  }

  // ---- derivation --------------------------------------------------------
  function computeFiltered(): unknown[] {
    const hasFilters = filters.size > 0;
    if (!hasFilters && searchAst === null) return rows.slice();
    return rows.filter((row) => {
      if (hasFilters) {
        for (const [column, filter] of filters) {
          const cell = isRecord(row) ? row[column] : undefined;
          if (!matchColumnFilter(cell, filter)) return false;
        }
      }
      if (searchAst !== null && !searchEngine.match(row, searchAst, columns)) {
        return false;
      }
      return true;
    });
  }

  function computeSorted(filtered: unknown[]): unknown[] {
    if (sort === null) return filtered.slice();
    const active = sort;
    const cmp = comparators.get(active.column);
    const dir = active.direction === 'desc' ? -1 : 1;
    const indexed = filtered.map((row, idx) => ({ row, idx }));
    indexed.sort((a, b) => {
      const av = isRecord(a.row) ? a.row[active.column] : undefined;
      const bv = isRecord(b.row) ? b.row[active.column] : undefined;
      const base = cmp ? cmp(av, bv, a.row, b.row) : defaultCompare(av, bv);
      if (base !== 0) return dir * base;
      return a.idx - b.idx; // stable tie-break
    });
    return indexed.map((e) => e.row);
  }

  function recompute(): void {
    const filteredRows = computeFiltered();
    const sortedRows = computeSorted(filteredRows);
    const totalRows = filteredRows.length;

    let pageCount: number;
    let displayRows: unknown[];
    if (pageSize <= 0) {
      pageCount = 1;
      page = 1;
      displayRows = sortedRows;
    } else {
      pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
      if (page < 1) page = 1;
      if (page > pageCount) page = pageCount;
      const start = (page - 1) * pageSize;
      displayRows = sortedRows.slice(start, start + pageSize);
    }

    const filterObj: Record<string, ColumnFilter | undefined> = {};
    for (const [k, v] of filters) filterObj[k] = v;

    currentState = {
      rows: rows.slice(),
      filteredRows,
      sortedRows,
      displayRows,
      sort: sort ? { ...sort } : null,
      filters: filterObj,
      searchQuery,
      searchAst: searchAst ? { ...searchAst } : null,
      page,
      pageSize,
      pageCount,
      totalRows,
      selection: new Set(selection),
      editingCell: editingCell ? { ...editingCell } : null,
      loading,
      error,
    };
  }

  function notify(): void {
    recompute();
    const snapshot = currentState;
    // Snapshot listeners so subscribe()/unsubscribe() during dispatch is safe.
    for (const listener of Array.from(subscribers)) {
      try {
        listener(snapshot);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('TableCrafter: uncaught error in subscribe listener', err);
      }
    }
  }

  // ---- history helpers ---------------------------------------------------
  function snapshotRows(): unknown[] {
    return rows.map((r) => (isRecord(r) ? { ...r } : r));
  }
  function pushHistory(): void {
    undoStack.push(snapshotRows());
    if (undoStack.length > HISTORY_CAP) undoStack.shift();
    redoStack.length = 0;
  }

  // ---- plugin registry ---------------------------------------------------
  let store: TableCrafterStore;
  function buildContext(): PluginContext {
    return {
      store,
      on: store.on.bind(store),
      dispatch: store.dispatch.bind(store),
    };
  }
  const plugins: PluginRegistry = createPluginRegistry(
    // store is assigned just below; the registry only reads it lazily via buildContext
    { dispatch: (a: Action) => store.dispatch(a) } as unknown as Store,
    buildContext
  );

  // ---- operations --------------------------------------------------------
  function doSort(column: string, direction?: SortDirection): void {
    let nextDir: SortDirection;
    if (direction) {
      nextDir = direction;
    } else if (sort && sort.column === column) {
      nextDir = sort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      nextDir = 'asc';
    }
    if (!plugins.fireHook('beforeSort', { column, direction: nextDir })) return;
    sort = { column, direction: nextDir };
    page = 1;
    notify();
    emitter.emit('sort', { column: sort.column, direction: sort.direction });
    plugins.fireHook('afterSort', { column, direction: nextDir });
  }

  function doSetFilter(column: string, filter: ColumnFilter | null): void {
    if (filter === null) {
      filters.delete(column);
    } else {
      filters.set(column, filter);
    }
    page = 1;
    notify();
    emitter.emit('filter', { column, filter });
  }

  function doClearFilter(column?: string): void {
    if (column === undefined) {
      filters.clear();
    } else {
      filters.delete(column);
    }
    page = 1;
    notify();
    emitter.emit('filter', { column: column ?? '', filter: null });
  }

  function doSearch(query: string): void {
    searchQuery = query;
    searchAst = searchEngine.parse(query);
    page = 1;
    notify();
  }

  function doSetPage(next: number): void {
    let target = Math.floor(next);
    const count =
      pageSize <= 0 ? 1 : Math.max(1, Math.ceil(computeFiltered().length / pageSize));
    if (target < 1) target = 1;
    if (target > count) target = count;
    if (target === page) return;
    page = target;
    notify();
    emitter.emit('page:change', { page, pageSize });
  }

  function doSetPageSize(next: number): void {
    const size = Math.max(0, Math.floor(next));
    if (size === pageSize) return;
    pageSize = size;
    page = 1;
    notify();
    emitter.emit('page:change', { page, pageSize });
  }

  function doEditCell(rowId: RowId, column: string, value: unknown): void {
    const found = resolveRow(rowId);
    if (!found) return;
    editingCell = {
      rowId: rowIdOf(found.row, found.index),
      column,
      originalValue: isRecord(found.row) ? found.row[column] : undefined,
    };
    pendingEditValue = value;
    error = null;
    notify();
  }

  function doCommitEdit(): void {
    if (!editingCell) return;
    const session = editingCell;
    const found = resolveRow(session.rowId);
    if (!found || !isRecord(found.row)) {
      editingCell = null;
      pendingEditValue = undefined;
      notify();
      return;
    }
    const column = columns.find((c) => c.key === session.column);
    const result = validator(
      pendingEditValue,
      column ?? { key: session.column },
      found.row,
      rows
    );
    if (!result.valid) {
      error = result.errors[0] ?? 'Validation failed';
      notify();
      return; // keep session open
    }
    if (
      !plugins.fireHook('beforeEdit', {
        rowId: session.rowId,
        column: session.column,
        value: pendingEditValue,
      })
    ) {
      // cancelled by plugin
      editingCell = null;
      pendingEditValue = undefined;
      notify();
      return;
    }

    const previousValue = session.originalValue;
    const newValue = pendingEditValue;
    pushHistory();
    (found.row as Record<string, unknown>)[session.column] = newValue;
    error = null;
    editingCell = null;
    pendingEditValue = undefined;
    notify();

    emitter.emit('cell:edit', {
      rowId: session.rowId,
      column: session.column,
      value: newValue,
      previousValue,
    });
    emitter.emit('row:update', {
      rowId: session.rowId,
      data: { ...(found.row as Record<string, unknown>) },
    });
    plugins.fireHook('afterEdit', {
      rowId: session.rowId,
      column: session.column,
      previousValue,
      value: newValue,
    });
  }

  function doCancelEdit(): void {
    if (!editingCell) return;
    editingCell = null;
    pendingEditValue = undefined;
    error = null;
    notify();
  }

  function doAddRow(data?: Record<string, unknown>): void {
    pushHistory();
    const row: Record<string, unknown> = { ...(data ?? {}) };
    rows.push(row);
    notify();
    emitter.emit('row:add', { row });
  }

  function doDuplicateRow(rowId: RowId): void {
    const found = resolveRow(rowId);
    if (!found) return;
    pushHistory();
    const clone: Record<string, unknown> = isRecord(found.row)
      ? { ...found.row }
      : {};
    // Drop the natural key so the duplicate gets a fresh index-based identity.
    if ('id' in clone) delete clone['id'];
    rows.splice(found.index + 1, 0, clone);
    notify();
    emitter.emit('row:add', { row: clone });
  }

  function doDeleteRow(rowId: RowId): void {
    const found = resolveRow(rowId);
    if (!found) return;
    const canonical = rowIdOf(found.row, found.index);
    pushHistory();
    rows.splice(found.index, 1);
    selection.delete(canonical);
    notify();
    emitter.emit('row:delete', { rowId: canonical });
  }

  function doBulkFill(rowIds: RowId[], column: string, value: unknown): void {
    if (!Array.isArray(rowIds) || rowIds.length === 0) return;
    const targets = rowIds
      .map((id) => resolveRow(id))
      .filter((r): r is { row: unknown; index: number } => r !== null && isRecord(r.row));
    if (targets.length === 0) return;
    pushHistory();
    for (const t of targets) {
      (t.row as Record<string, unknown>)[column] = value;
    }
    notify();
    for (const t of targets) {
      emitter.emit('row:update', {
        rowId: rowIdOf(t.row, t.index),
        data: { ...(t.row as Record<string, unknown>) },
      });
    }
  }

  function doSelect(rowId: RowId, multi?: boolean): void {
    const found = resolveRow(rowId);
    if (!found) return;
    const canonical = rowIdOf(found.row, found.index);
    if (multi) {
      if (selection.has(canonical)) selection.delete(canonical);
      else selection.add(canonical);
    } else {
      selection.clear();
      selection.add(canonical);
    }
    notify();
    emitter.emit('selection:change', { selection: new Set(selection) });
  }

  function doSelectAll(): void {
    selection.clear();
    rows.forEach((row, idx) => selection.add(rowIdOf(row, idx)));
    notify();
    emitter.emit('selection:change', { selection: new Set(selection) });
  }

  function doDeselectAll(): void {
    if (selection.size === 0) return;
    selection.clear();
    notify();
    emitter.emit('selection:change', { selection: new Set(selection) });
  }

  function doUndo(): void {
    const prev = undoStack.pop();
    if (!prev) return;
    redoStack.push(snapshotRows());
    rows = prev;
    editingCell = null;
    pendingEditValue = undefined;
    notify();
  }

  function doRedo(): void {
    const next = redoStack.pop();
    if (!next) return;
    undoStack.push(snapshotRows());
    if (undoStack.length > HISTORY_CAP) undoStack.shift();
    rows = next;
    editingCell = null;
    pendingEditValue = undefined;
    notify();
  }

  function doSetRows(next: unknown[]): void {
    rows = Array.isArray(next) ? next.slice() : [];
    editingCell = null;
    pendingEditValue = undefined;
    error = null;
    loading = false;
    if (page < 1) page = 1;
    notify();
  }

  // ---- action dispatch ---------------------------------------------------
  function dispatch(action: Action): void {
    switch (action.type) {
      case 'SORT':
        doSort(action.payload.column, action.payload.direction);
        break;
      case 'FILTER':
        doSetFilter(action.payload.column, action.payload.filter);
        break;
      case 'FILTER_CLEAR':
        doClearFilter(action.payload?.column);
        break;
      case 'SEARCH':
        doSearch(action.payload.query);
        break;
      case 'PAGE':
        doSetPage(action.payload.page);
        break;
      case 'PAGE_SIZE':
        doSetPageSize(action.payload.pageSize);
        break;
      case 'EDIT_CELL':
        doEditCell(action.payload.rowId, action.payload.column, action.payload.value);
        break;
      case 'COMMIT_EDIT':
        doCommitEdit();
        break;
      case 'CANCEL_EDIT':
        doCancelEdit();
        break;
      case 'ADD_ROW':
        doAddRow(action.payload?.data);
        break;
      case 'DUPLICATE_ROW':
        doDuplicateRow(action.payload.rowId);
        break;
      case 'DELETE_ROW':
        doDeleteRow(action.payload.rowId);
        break;
      case 'BULK_FILL':
        doBulkFill(action.payload.rowIds, action.payload.column, action.payload.value);
        break;
      case 'SELECT':
        doSelect(action.payload.rowId, action.payload.multi);
        break;
      case 'SELECT_ALL':
        doSelectAll();
        break;
      case 'DESELECT_ALL':
        doDeselectAll();
        break;
      case 'UNDO':
        doUndo();
        break;
      case 'REDO':
        doRedo();
        break;
      case 'HYDRATE':
      case 'SET_ROWS':
        doSetRows(action.payload.rows);
        break;
      case 'SET_LOADING':
        loading = action.payload.loading;
        notify();
        break;
      case 'SET_ERROR':
        error = action.payload.error;
        notify();
        break;
      default: {
        // Exhaustiveness guard.
        const _never: never = action;
        void _never;
      }
    }
  }

  // ---- load --------------------------------------------------------------
  async function load(): Promise<void> {
    if (source === null) return;
    if (!plugins.fireHook('beforeLoad', { source })) return;
    loading = true;
    error = null;
    notify();
    try {
      const fetched = await loader(source);
      plugins.fireHook('afterLoad', { rows: fetched });
      doSetRows(fetched);
    } catch (err) {
      loading = false;
      error = err instanceof Error ? err.message : String(err);
      notify();
    }
  }

  // ---- export ------------------------------------------------------------
  function exportData(
    format: ExportFormat,
    options?: ExportOptions
  ): Promise<void> | void {
    const handler = exportRegistry.get(format);
    if (!handler) {
      throw new Error(
        `TableCrafter: no exporter registered for "${format}"; import the matching export module and registerExportFormat()`
      );
    }
    recompute();
    return handler(currentState, options, columns);
  }

  // ---- assemble store ----------------------------------------------------
  recompute();

  store = {
    getState(): TableState {
      return currentState;
    },
    subscribe(listener: (state: TableState) => void): () => void {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },
    dispatch,

    on(event: string, handler: EventHandler): TableCrafterStore {
      emitter.on(event, handler);
      return store;
    },
    off(event: string, handler: EventHandler): TableCrafterStore {
      emitter.off(event, handler);
      return store;
    },
    once(event: string, handler: EventHandler): TableCrafterStore {
      emitter.once(event, handler);
      return store;
    },

    sort: doSort,
    setFilter: doSetFilter,
    clearFilter: doClearFilter,
    search: doSearch,
    setPage: doSetPage,
    setPageSize: doSetPageSize,
    editCell: doEditCell,
    commitEdit: doCommitEdit,
    cancelEdit: doCancelEdit,
    addRow: doAddRow,
    duplicateRow: doDuplicateRow,
    deleteRow: doDeleteRow,
    bulkFill: doBulkFill,
    select: doSelect,
    selectAll: doSelectAll,
    deselectAll: doDeselectAll,
    undo: doUndo,
    redo: doRedo,
    export: exportData,

    // ---- extended surface (assignable-to-Store superset) ----------------
    use(plugin: TableCrafterPlugin, options?: unknown): TableCrafterStore {
      plugins.use(plugin, options);
      return store;
    },
    unuse(name: string): boolean {
      return plugins.unuse(name);
    },
    listPlugins(): string[] {
      return plugins.list();
    },
    setComparator(column: string, comparator: Comparator): void {
      comparators.set(column, comparator);
      notify();
    },
    setSearchEngine(engine: SearchEngine): void {
      searchEngine = engine;
      searchAst = searchEngine.parse(searchQuery);
      notify();
    },
    setValidator(v: Validator): void {
      validator = v;
    },
    registerExportFormat(format: string, handler: ExportHandler): void {
      exportRegistry.set(format, handler);
    },
    setLoader(l: DataLoader): void {
      loader = l;
    },
    load,
    destroy(): void {
      plugins.fireHook('destroy', { state: currentState });
      plugins.clear();
      emitter.clear();
      subscribers.clear();
      rows = [];
      selection.clear();
      undoStack.length = 0;
      redoStack.length = 0;
      editingCell = null;
      recompute();
    },
  } as TableCrafterStore;

  // Auto-register plugins declared in config.
  if (Array.isArray(config.plugins)) {
    for (const plugin of config.plugins) {
      plugins.use(plugin);
    }
  }

  return store;
}
