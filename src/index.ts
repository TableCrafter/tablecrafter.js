/**
 * index.ts
 *
 * Batteries-included wrapper (default export). Preserves v2 one-liner
 * ergonomics while composing the headless core with the DOM renderer.
 *
 * Usage:
 *   import TableCrafter from 'tablecrafter';
 *   const table = new TableCrafter('#el', { data: '/api/rows', columns });
 *   table.render();
 *
 * The wrapper re-exposes store methods so existing .on(), .export(), .sort()
 * call sites keep working without modification.
 */

import { createTable } from './core/state';
import type { TableCrafterStore } from './core/state';
import { mountTable } from './render/dom';
import type { DomRendererOptions, UiStrings } from './render/dom';
import type {
  TableCrafterConfig,
  TableCrafterColumn,
  TableCrafterPlugin,
  Renderer,
  TableState,
  TableCrafterEventMap,
  EventHandler,
  SortDirection,
  SortOptions,
  ColumnFilter,
  RowId,
  ExportFormat,
  ExportOptions,
  CellRendererFn,
  Store,
} from './core/types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Resolve pageSize from the v2 pagination compat shim. */
function resolvePageSize(
  config: Pick<WrapperConfig, 'pagination' | 'pageSize'>
): number | undefined {
  const p = config.pagination;
  if (p !== undefined) {
    if (typeof p === 'number') return p;
    if (p === false) return 0;
    if (p === true) return config.pageSize;
    if (typeof p === 'object' && p !== null) {
      const obj = p as { pageSize?: number };
      if (typeof obj.pageSize === 'number') return obj.pageSize;
    }
  }
  return config.pageSize;
}

// ---------------------------------------------------------------------------
// WrapperColumn
// ---------------------------------------------------------------------------

/** Column definition accepted by WrapperConfig: `field` is a v2 alias for `key`. */
export type WrapperColumn = Omit<TableCrafterColumn, 'key'> & {
  key?: string | undefined;
  field?: string | undefined;
};

// ---------------------------------------------------------------------------
// WrapperConfig
// ---------------------------------------------------------------------------

/**
 * Configuration accepted by the TableCrafter batteries wrapper.
 * Superset of TableCrafterConfig: adds renderer options, v2 compat shims,
 * and event callbacks.
 */
export interface WrapperConfig extends Omit<TableCrafterConfig, 'columns'> {
  /** Column definitions. Accepts `field` as a v2 alias for `key`. */
  columns: WrapperColumn[];

  // ---- Renderer options ------------------------------------------------
  /** Theme name applied as data-theme on the root element. */
  theme?: string | undefined;
  /** Force table, card, or auto (responsive) view mode. */
  view?: 'table' | 'card' | 'auto' | undefined;
  /** Per-column cell renderer overrides. */
  cells?: Record<string, CellRendererFn> | undefined;
  /** Enable virtual scrolling (requires pageSize=0). */
  virtual?: boolean | undefined;
  /** Responsive breakpoints configuration. */
  breakpoints?: { card: number } | undefined;
  /** UI string overrides for localisation. */
  strings?: Partial<UiStrings> | undefined;

  // ---- v2 compat -------------------------------------------------------
  /**
   * v2 pagination shorthand. Number maps directly to pageSize; object with
   * pageSize takes precedence over the top-level pageSize; false disables
   * pagination (pageSize=0); true uses pageSize or the built-in default.
   */
  pagination?: boolean | number | { pageSize?: number } | undefined;
  /**
   * v2 i18n shorthand. locale is extracted and used when the top-level
   * locale is not set.
   */
  i18n?: { locale?: string; [key: string]: unknown } | undefined;

  // ---- Callbacks -------------------------------------------------------
  onEdit?: EventHandler<TableCrafterEventMap['cell:edit']> | undefined;
  onSort?: EventHandler<TableCrafterEventMap['sort']> | undefined;
  onFilter?: EventHandler<TableCrafterEventMap['filter']> | undefined;
  onPageChange?: EventHandler<TableCrafterEventMap['page:change']> | undefined;
  onRowAdd?: EventHandler<TableCrafterEventMap['row:add']> | undefined;
  onRowUpdate?: EventHandler<TableCrafterEventMap['row:update']> | undefined;
  onRowDelete?: EventHandler<TableCrafterEventMap['row:delete']> | undefined;
  onSelectionChange?: EventHandler<TableCrafterEventMap['selection:change']> | undefined;
}

// ---------------------------------------------------------------------------
// TableCrafter
// ---------------------------------------------------------------------------

/**
 * Batteries-included TableCrafter wrapper. Composes the headless store with
 * the DOM renderer and exposes a fluent proxy API compatible with v2.
 */
export class TableCrafter {
  protected readonly store: TableCrafterStore;
  protected renderer: Renderer | null = null;
  protected element: HTMLElement | null;

  private readonly _rendererOpts: DomRendererOptions;

  constructor(selector: string | HTMLElement, config: WrapperConfig) {
    // 1. Resolve element
    if (typeof selector === 'string') {
      this.element =
        typeof document !== 'undefined'
          ? document.querySelector<HTMLElement>(selector)
          : null;
    } else {
      this.element = selector;
    }

    // 2. Normalize columns: field -> key alias; filter out columns with neither
    const normalizedColumns: TableCrafterColumn[] = (config.columns ?? [])
      .filter((c) => Boolean(c.key) || Boolean(c.field))
      .map((c) => {
        const effectiveKey = c.key || (c.field as string);
        // Spread all properties, override key; field alias is a superset prop and harmless
        return { ...c, key: effectiveKey } as unknown as TableCrafterColumn;
      });

    // 3. Apply global editable flag: mark all non-explicit columns editable
    if (config.editable === true) {
      for (const col of normalizedColumns) {
        if (col.editable === undefined) {
          col.editable = true;
        }
      }
    }

    // 4. Resolve pageSize (pagination compat shim takes precedence)
    const pageSize = resolvePageSize(config);

    // 5. Resolve locale (i18n compat shim fallback)
    const locale = config.locale ?? config.i18n?.locale;

    // 6. Build core config
    const coreConfig: TableCrafterConfig = {
      data: config.data,
      columns: normalizedColumns,
      editable: config.editable,
      pageSize,
      plugins: config.plugins,
      role: config.role,
      locale,
    };

    // 7. Create headless store
    this.store = createTable(coreConfig);

    // 8. Surface columns to the DOM renderer via the store hook
    (this.store as unknown as { __columns__: TableCrafterColumn[] }).__columns__ =
      normalizedColumns;

    // 9. Wire event callbacks onto the store emitter
    if (config.onEdit) this.store.on('cell:edit', config.onEdit as EventHandler);
    if (config.onSort) this.store.on('sort', config.onSort as EventHandler);
    if (config.onFilter) this.store.on('filter', config.onFilter as EventHandler);
    if (config.onPageChange) this.store.on('page:change', config.onPageChange as EventHandler);
    if (config.onRowAdd) this.store.on('row:add', config.onRowAdd as EventHandler);
    if (config.onRowUpdate) this.store.on('row:update', config.onRowUpdate as EventHandler);
    if (config.onRowDelete) this.store.on('row:delete', config.onRowDelete as EventHandler);
    if (config.onSelectionChange)
      this.store.on('selection:change', config.onSelectionChange as EventHandler);

    // 10. Store renderer options for render()
    this._rendererOpts = {
      theme: config.theme,
      view: config.view,
      cells: config.cells,
      virtual: config.virtual,
      breakpoints: config.breakpoints,
      strings: config.strings,
      columns: normalizedColumns,
      role: config.role,
      locale,
    };

    // 11. Auto-load if data is a URL string (do not call for inline array data)
    if (typeof config.data === 'string') {
      void this.store.load();
    }
  }

  // ---- Lifecycle ----------------------------------------------------------

  /**
   * Mount the DOM renderer to the configured element.
   *
   * Idempotent: calling render() a second time returns `this` unchanged.
   * Throws if no element was found for the selector.
   *
   * @returns `this` for chaining.
   */
  render(): this {
    if (!this.element) {
      throw new Error('TableCrafter: no element found for selector');
    }
    if (this.renderer) {
      return this; // already mounted — idempotent
    }
    this.renderer = mountTable(this.store, this.element, this._rendererOpts);
    return this;
  }

  /** Unmount the renderer and destroy the store. */
  destroy(): void {
    this.renderer?.destroy();
    this.renderer = null;
    this.store.destroy();
  }

  /** Pin a column to an edge with sticky positioning (#328). Chainable. */
  pinColumn(field: string, side: 'left' | 'right' = 'left'): this {
    this.renderer?.pinColumn(field, side);
    return this;
  }

  /** Remove a column's pinning (#328). Chainable. */
  unpinColumn(field: string): this {
    this.renderer?.unpinColumn(field);
    return this;
  }

  // ---- Sort / filter / pagination proxy -----------------------------------

  /** Sort by column. Chainable. */
  sort(column: string, direction?: SortDirection, opts?: SortOptions): this {
    this.store.sort(column, direction, opts);
    return this;
  }

  /** Navigate to a specific page. Chainable. */
  setPage(page: number): this {
    this.store.setPage(page);
    return this;
  }

  /** Change the number of rows per page. Chainable. */
  setPageSize(size: number): this {
    this.store.setPageSize(size);
    return this;
  }

  /** Set the freetext search query. Chainable. */
  search(query: string): this {
    this.store.search(query);
    return this;
  }

  /** Apply a column filter. Chainable. */
  setFilter(col: string, filter: ColumnFilter | null): this {
    this.store.setFilter(col, filter);
    return this;
  }

  /** Clear a column filter (or all filters when col is omitted). Chainable. */
  clearFilter(col?: string): this {
    this.store.clearFilter(col);
    return this;
  }

  // ---- Editing proxy ------------------------------------------------------

  /** Begin editing a cell. Chainable. */
  editCell(rowId: RowId, col: string, val: unknown): this {
    this.store.editCell(rowId, col, val);
    return this;
  }

  /** Commit the active cell edit. Chainable. */
  commitEdit(): this {
    this.store.commitEdit();
    return this;
  }

  /** Cancel the active cell edit. Chainable. */
  cancelEdit(): this {
    this.store.cancelEdit();
    return this;
  }

  /** Append a new row. Chainable. */
  addRow(data?: Record<string, unknown>): this {
    this.store.addRow(data);
    return this;
  }

  /** Duplicate an existing row. Chainable. */
  duplicateRow(rowId: RowId): this {
    this.store.duplicateRow(rowId);
    return this;
  }

  /** Delete a row. Chainable. */
  deleteRow(rowId: RowId): this {
    this.store.deleteRow(rowId);
    return this;
  }

  /** Fill a column value across multiple rows. Chainable. */
  bulkFill(ids: RowId[], col: string, val: unknown): this {
    this.store.bulkFill(ids, col, val);
    return this;
  }

  // ---- Selection proxy ----------------------------------------------------

  /** Select a row. Chainable. */
  select(rowId: RowId, multi?: boolean): this {
    this.store.select(rowId, multi);
    return this;
  }

  /** Select all rows. Chainable. */
  selectAll(): this {
    this.store.selectAll();
    return this;
  }

  /** Deselect all rows. Chainable. */
  deselectAll(): this {
    this.store.deselectAll();
    return this;
  }

  // ---- History proxy ------------------------------------------------------

  /** Undo the last data mutation. Chainable. */
  undo(): this {
    this.store.undo();
    return this;
  }

  /** Redo the last undone mutation. Chainable. */
  redo(): this {
    this.store.redo();
    return this;
  }

  // ---- Export / state / events --------------------------------------------

  /** Trigger a data export. */
  export(format: ExportFormat, opts?: ExportOptions): Promise<void> | void {
    return this.store.export(format, opts);
  }

  /** Subscribe to a store event. Chainable. */
  on<K extends keyof TableCrafterEventMap>(
    event: K,
    handler: EventHandler<TableCrafterEventMap[K]>
  ): this;
  on(event: string, handler: EventHandler): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, handler: (payload: any) => void): this {
    this.store.on(event, handler as EventHandler);
    return this;
  }

  /** Unsubscribe from a store event. Chainable. */
  off<K extends keyof TableCrafterEventMap>(
    event: K,
    handler: EventHandler<TableCrafterEventMap[K]>
  ): this;
  off(event: string, handler: EventHandler): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(event: string, handler: (payload: any) => void): this {
    this.store.off(event, handler as EventHandler);
    return this;
  }

  /** Subscribe to a store event once. Chainable. */
  once<K extends keyof TableCrafterEventMap>(
    event: K,
    handler: EventHandler<TableCrafterEventMap[K]>
  ): this;
  once(event: string, handler: EventHandler): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  once(event: string, handler: (payload: any) => void): this {
    this.store.once(event, handler as EventHandler);
    return this;
  }

  /** Install a plugin. Chainable. */
  use(plugin: TableCrafterPlugin, opts?: unknown): this {
    this.store.use(plugin, opts);
    return this;
  }

  /** Uninstall a plugin by name. Returns true if the plugin was found. */
  unuse(name: string): boolean {
    return this.store.unuse(name);
  }

  /** Return the current immutable state snapshot. */
  getState(): TableState {
    return this.store.getState();
  }

  // ---- Static bootstrap ---------------------------------------------------

  /**
   * Scan the DOM for `[data-tc-bootstrap]` elements, parse their
   * `data-tc-config` JSON, and mount a TableCrafter instance on each.
   *
   * @param scope - Optional CSS selector string, HTMLElement, or Document to
   *               restrict the scan. Defaults to the global `document`.
   * @returns A Map from each matched HTMLElement to its TableCrafter instance.
   */
  static bootstrap(
    scope?: string | HTMLElement | Document
  ): Map<HTMLElement, TableCrafter> {
    const root: ParentNode =
      scope === undefined
        ? document
        : typeof scope === 'string'
          ? (document.querySelector(scope) ?? document)
          : scope;

    const map = new Map<HTMLElement, TableCrafter>();
    const elements = root.querySelectorAll<HTMLElement>('[data-tc-bootstrap]');

    for (const el of elements) {
      const configStr = el.dataset['tcConfig'] ?? '';
      let config: WrapperConfig;
      try {
        config = JSON.parse(configStr || '{}') as WrapperConfig;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          'TableCrafter: invalid JSON in data-tc-config, skipping element',
          el,
          err
        );
        continue;
      }
      const instance = new TableCrafter(el, config);
      instance.render();
      map.set(el, instance);
    }

    return map;
  }
}

export default TableCrafter;

// Re-export the headless API and public types for tree-shaking consumers.
export { createTable } from './core/state';
export { mountTable } from './render/dom';
export type {
  Store,
  TableState,
  Action,
  TableCrafterConfig,
  TableCrafterColumn,
  TableCrafterPlugin,
  PluginContext,
  Renderer,
  RendererOptions,
  CellRendererFn,
  CellType,
  SortDirection,
  SortState,
  ColumnFilter,
  FilterOperator,
  QueryNode,
  ValidationRule,
  ValidationResult,
  RowId,
  ExportFormat,
  ExportOptions,
  TableCrafterEventMap,
} from './core/types';
