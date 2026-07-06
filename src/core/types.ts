/**
 * core/types.ts
 *
 * Shared public types for TableCrafter v3.
 * All exported symbols are re-exported from every subpath entry and from the
 * batteries wrapper (src/index.ts).  Changes to this file after the store
 * contract is frozen require an RFC amendment.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** A row identifier -- string keys from data sources, numeric array indices. */
export type RowId = string | number;

/** All first-class cell types recognised by the renderer and cell registry. */
export type CellType =
  | 'text'
  | 'number'
  | 'date'
  | 'boolean'
  | 'select'
  | 'checkbox'
  | 'badge'
  | 'progress'
  | 'sparkline'
  | 'link'
  | 'star'
  | 'conditional';

/** Sort direction. */
export type SortDirection = 'asc' | 'desc';

/** Export formats supported by the export modules. */
export type ExportFormat = 'csv' | 'json' | 'print' | 'xlsx' | 'pdf';

// ---------------------------------------------------------------------------
// Column configuration
// ---------------------------------------------------------------------------

export interface TableCrafterColumn {
  /** Data property key. */
  key: string;
  /** Display label.  Defaults to `key` if omitted. */
  label?: string | undefined;
  /** Logical cell type used for auto-detection and editor selection. */
  type?: CellType | undefined;
  /** Allow inline editing for this column. */
  editable?: boolean | undefined;
  /** Allow sorting on this column. */
  sortable?: boolean | undefined;
  /** Allow filtering on this column. */
  filterable?: boolean | undefined;
  /** Hide this column from the rendered table. */
  hidden?: boolean | undefined;
  /** Pin column to the left or right edge. */
  pinned?: 'left' | 'right' | undefined;
  /** Minimum column width in px. */
  minWidth?: number | undefined;
  /** Custom cell renderer name registered via the cell registry. */
  renderer?: string | undefined;
  /** Validation rules applied on edit commit. */
  validation?: ValidationRule[] | undefined;
  /** Role-based permission advisory. */
  permission?: ColumnPermission | undefined;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ValidationRuleType =
  | 'required'
  | 'minLength'
  | 'maxLength'
  | 'min'
  | 'max'
  | 'pattern'
  | 'unique'
  | 'oneOf'
  | 'phone'
  | 'date'
  | 'custom';

export interface ValidationRule {
  type: ValidationRuleType;
  value?: unknown;
  message?: string | undefined;
  validate?: ((v: unknown) => boolean | string) | undefined;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export interface ColumnPermission {
  /** Roles that may edit this cell. */
  editableBy?: string[] | undefined;
  /** Roles that may view this cell. */
  visibleTo?: string[] | undefined;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export interface SortState {
  column: string;
  direction: SortDirection;
}

/** Options for the Store.sort() imperative helper. */
export interface SortOptions {
  /**
   * When true, push/update this key in the multi-sort priority list instead of
   * replacing the entire sort state (v2 `sort(field, { append: true })` parity).
   */
  append?: boolean | undefined;
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'notIn'
  | 'empty'
  | 'notEmpty';

export interface ColumnFilter {
  operator: FilterOperator;
  value: unknown;
}

/** AST node produced by the search grammar parser. */
export type QueryNode =
  | { kind: 'and'; left: QueryNode; right: QueryNode }
  | { kind: 'or'; left: QueryNode; right: QueryNode }
  | { kind: 'not'; operand: QueryNode }
  | { kind: 'field'; field: string; value: string }
  | { kind: 'regex'; pattern: string; flags: string }
  | { kind: 'term'; value: string };

// ---------------------------------------------------------------------------
// Table state
// ---------------------------------------------------------------------------

export interface EditingCell {
  rowId: RowId;
  column: string;
  originalValue: unknown;
}

export interface TableState {
  /** Raw rows from the data source. */
  rows: unknown[];
  /** Rows after filtering and searching. */
  filteredRows: unknown[];
  /** Rows after sorting, ready for pagination. */
  sortedRows: unknown[];
  /** Current page slice shown to the renderer. */
  displayRows: unknown[];
  /** Active sort keys in priority order (empty array = no sort). */
  sort: SortState[];
  /** Per-column filter values. */
  filters: Record<string, ColumnFilter | undefined>;
  /** Current freetext search query. */
  searchQuery: string;
  /** Parsed AST from the search grammar (null when no query). */
  searchAst: QueryNode | null;
  /** 1-based current page. */
  page: number;
  /** Rows per page. */
  pageSize: number;
  /** Total number of pages given current filter result. */
  pageCount: number;
  /** Total rows after filtering (before pagination). */
  totalRows: number;
  /** Selected row IDs. */
  selection: Set<RowId>;
  /** Cell currently being edited, or null. */
  editingCell: EditingCell | null;
  /** Whether a remote fetch is in progress. */
  loading: boolean;
  /** Last error message, or null. */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface SortPayload {
  column: string;
  direction?: SortDirection | undefined;
  /** Forwarded from Store.sort() opts; see SortOptions. */
  opts?: SortOptions | undefined;
}

export interface FilterPayload {
  column: string;
  filter: ColumnFilter | null;
}

export interface EditCellPayload {
  rowId: RowId;
  column: string;
  value: unknown;
}

export interface BulkFillPayload {
  rowIds: RowId[];
  column: string;
  value: unknown;
}

/** Discriminated union of every dispatchable action. */
export type Action =
  | { type: 'SORT'; payload: SortPayload }
  | { type: 'FILTER'; payload: FilterPayload }
  | { type: 'FILTER_CLEAR'; payload?: { column?: string | undefined } | undefined }
  | { type: 'SEARCH'; payload: { query: string } }
  | { type: 'PAGE'; payload: { page: number } }
  | { type: 'PAGE_SIZE'; payload: { pageSize: number } }
  | { type: 'EDIT_CELL'; payload: EditCellPayload }
  | { type: 'COMMIT_EDIT' }
  | { type: 'CANCEL_EDIT' }
  | { type: 'ADD_ROW'; payload?: { data?: Record<string, unknown> | undefined } | undefined }
  | { type: 'DUPLICATE_ROW'; payload: { rowId: RowId } }
  | { type: 'DELETE_ROW'; payload: { rowId: RowId } }
  | { type: 'BULK_FILL'; payload: BulkFillPayload }
  | { type: 'SELECT'; payload: { rowId: RowId; multi?: boolean | undefined } }
  | { type: 'SELECT_ALL' }
  | { type: 'DESELECT_ALL' }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'HYDRATE'; payload: { rows: unknown[] } }
  | { type: 'SET_ROWS'; payload: { rows: unknown[] } }
  | { type: 'SET_LOADING'; payload: { loading: boolean } }
  | { type: 'SET_ERROR'; payload: { error: string | null } };

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface TableCrafterEventMap {
  'cell:edit': { rowId: RowId; column: string; value: unknown; previousValue: unknown };
  'row:add': { row: unknown };
  'row:update': { rowId: RowId; data: Record<string, unknown> };
  'row:delete': { rowId: RowId };
  'sort': SortState[];
  'filter': { column: string; filter: ColumnFilter | null };
  'page:change': { page: number; pageSize: number };
  'selection:change': { selection: Set<RowId> };
}

export type EventHandler<T = unknown> = (payload: T) => void;

// ---------------------------------------------------------------------------
// Store (THE FROZEN CONTRACT -- see RFC section 9, risk 1)
// ---------------------------------------------------------------------------

export interface ExportOptions {
  filename?: string | undefined;
  sheetName?: string | undefined;
}

/**
 * The core store returned by createTable().
 *
 * This interface is frozen as of Phase 0.  Any changes after the Phase 1 core
 * implementation require an RFC amendment.  Phase 2 agents import this type
 * and must not redefine it.
 */
export interface Store {
  /** Return the current immutable state snapshot. */
  getState(): TableState;
  /** Subscribe to state changes.  Returns an unsubscribe function. */
  subscribe(listener: (state: TableState) => void): () => void;
  /** Dispatch an action to update state. */
  dispatch(action: Action): void;

  // Event emitter (mirrors v2 events API, fires from the store)
  on<K extends keyof TableCrafterEventMap>(
    event: K,
    handler: EventHandler<TableCrafterEventMap[K]>
  ): Store;
  on(event: string, handler: EventHandler): Store;
  off<K extends keyof TableCrafterEventMap>(
    event: K,
    handler: EventHandler<TableCrafterEventMap[K]>
  ): Store;
  off(event: string, handler: EventHandler): Store;
  once<K extends keyof TableCrafterEventMap>(
    event: K,
    handler: EventHandler<TableCrafterEventMap[K]>
  ): Store;
  once(event: string, handler: EventHandler): Store;

  // Convenience imperative helpers (sugar over dispatch)
  sort(column: string, direction?: SortDirection, opts?: SortOptions): void;
  setFilter(column: string, filter: ColumnFilter | null): void;
  clearFilter(column?: string): void;
  search(query: string): void;
  setPage(page: number): void;
  setPageSize(pageSize: number): void;
  editCell(rowId: RowId, column: string, value: unknown): void;
  commitEdit(): void;
  cancelEdit(): void;
  addRow(data?: Record<string, unknown>): void;
  duplicateRow(rowId: RowId): void;
  deleteRow(rowId: RowId): void;
  bulkFill(rowIds: RowId[], column: string, value: unknown): void;
  select(rowId: RowId, multi?: boolean): void;
  selectAll(): void;
  deselectAll(): void;
  undo(): void;
  redo(): void;
  export(format: ExportFormat, options?: ExportOptions): Promise<void> | void;
}

// ---------------------------------------------------------------------------
// Plugin system
// ---------------------------------------------------------------------------

export interface PluginContext {
  /** The bound store. */
  store: Store;
  /** Renderer handle -- undefined when plugin runs headless. */
  renderer?: Renderer | undefined;
  /** Shortcut to store.on. */
  on: Store['on'];
  /** Shortcut to store.dispatch. */
  dispatch: Store['dispatch'];
  /** Register a named custom cell renderer with the active renderer. */
  registerCell?: ((name: string, renderer: CellRendererFn) => void) | undefined;
}

export interface TableCrafterPlugin {
  /** Unique plugin name.  Duplicate names throw on registration. */
  name: string;
  install(ctx: PluginContext, options?: unknown): void;
  uninstall?: ((ctx: PluginContext) => void) | undefined;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface TableCrafterConfig {
  /** Row data or URL to fetch. */
  data: unknown[] | string;
  /** Column definitions. */
  columns: TableCrafterColumn[];
  /** Enable inline cell editing globally. */
  editable?: boolean | undefined;
  /** Rows per page (0 = no pagination). */
  pageSize?: number | undefined;
  /** Plugins to auto-register on createTable(). */
  plugins?: TableCrafterPlugin[] | undefined;
  /** Current user role for permission checks. */
  role?: string | undefined;
  /** Locale string passed to Intl APIs. */
  locale?: string | undefined;
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export type CellRendererFn = (
  value: unknown,
  row: unknown,
  column: TableCrafterColumn
) => string | HTMLElement;

export interface RendererOptions {
  view?: 'table' | 'card' | 'auto' | undefined;
  theme?: string | undefined;
  cells?: Record<string, CellRendererFn> | undefined;
  virtual?: boolean | undefined;
  breakpoints?: { card: number } | undefined;
}

/** Handle returned by mountTable(). */
export interface Renderer {
  /** Unmount the renderer and tear down all listeners. */
  destroy(): void;
  /** Imperative update trigger (called automatically via subscribe). */
  update(state: TableState): void;
}
