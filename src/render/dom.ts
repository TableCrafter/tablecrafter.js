/**
 * render/dom.ts
 *
 * Default DOM renderer.  Mounts a headless TableCrafter store to a container
 * element and reconciles the DOM on every state change.
 *
 * Integration hub for Phase 3: consumes the cell registry (cells/), permission
 * helpers (permissions/), sort badges (sorting/), i18n formatting (i18n/), and
 * the sibling render modules a11y.ts + virtual.ts.
 *
 * Design highlights:
 *  - Subscription-driven reconcile ladder (coarsest -> cheapest).
 *  - Event delegation from tc-root only (no per-cell listeners); 4px drag
 *    threshold for range selection.
 *  - Popover-API context menu with positioned-div fallback.
 *  - Native <dialog> instance created for modals (add-row / bulk-edit).
 *  - document.startViewTransition progressive enhancement on full rebuilds.
 *  - Container-query card mode with ResizeObserver fallback.
 *  - CSS @layer + custom-property theming (see render/dom.css).
 *  - AbortController teardown for all listeners.
 *  - Keyboard action keys arrive from a11y.ts as CustomEvents
 *    (tablecrafter:edit/commit/cancel/select) which dom.ts maps to dispatches.
 *
 * DEVIATIONS FROM THE SPEC (documented, see PR body):
 *  1. Diffing ladder: the spec assumes the core store keeps the same
 *     `displayRows` reference for selection/editing-only mutations.  The shipped
 *     core/state.ts `recompute()` allocates fresh arrays on every notify(), so
 *     the reference always differs.  The row *objects* are identical (shallow
 *     slice), so we detect "rows unchanged" via a shallow per-row `===` compare
 *     (`sameRows`) to preserve the intended cheap-path optimisation.
 *  2. Columns: the frozen Store contract does not expose the config column
 *     definitions.  Columns are supplied via an additive `options.columns`
 *     (falling back to deriving keys from the first data row).
 *  3. Role/locale: not exposed by the frozen Store either; read from additive
 *     `options.role` / `options.locale` (locale also auto-detected from
 *     <html lang> per the i18n module contract).
 */

import type {
  Store,
  Renderer,
  RendererOptions,
  TableState,
  TableCrafterColumn,
  CellRendererFn,
  RowId,
  Action,
  ValidationRule,
  TableCrafterEventMap,
} from '../core/types';

import { createCellRegistry } from '../cells/registry';
import type { CellRegistry } from '../cells/registry';
import { canViewCell, canEditCell } from '../permissions/index';
import { getSortBadges } from '../sorting/index';
import { createI18n, detectLocale } from '../i18n/index';
import type { I18nInstance } from '../i18n/index';
import { fuzzyMatch, createFuzzyEngine } from '../filtering/fuzzy';
import type { SearchEngine } from '../core/state';

import {
  applyAriaGrid,
  mountRovingTabindex,
  createLiveRegion,
  preserveFocusThroughPatch,
} from './a11y';
import { mountVirtualScroll } from './virtual';
import type { VirtualScrollController } from './virtual';

// ---------------------------------------------------------------------------
// UI strings (Phase 4 makes these overridable via RendererOptions.strings).
// ---------------------------------------------------------------------------

export interface UiStrings {
  noResults: string;
  loading: string;
  error: string;
  previous: string;
  next: string;
  pageOf: string; // "Page {current} of {total}"
  addNew: string;
  search: string;
  ctxEdit: string;
  ctxDuplicate: string;
  ctxDelete: string;
  showingResults: string; // "Showing {n} of {total} results"
  sortedBy: string; // "Sorted by {column} {direction}"
  tableLoaded: string; // "Table loaded, {n} rows"
  cellUpdated: string; // "{column} updated"
  clearFilter: string;
  pageSize: string; // "Rows per page"
  goToPage: string; // "Go to page"
  undoToast: string; // "Undo: {column} restored to \"{value}\""
  redoToast: string; // "Redo: {column} set to \"{value}\""
  savePreset: string;
  presetNamePrompt: string;
  deletePreset: string; // "Delete preset {name}"
}

const UI_STRINGS: UiStrings = {
  noResults: 'No results found',
  loading: 'Loading...',
  error: 'Unable to load data.',
  previous: 'Previous',
  next: 'Next',
  pageOf: 'Page {current} of {total}',
  addNew: 'Add New',
  search: 'Search...',
  ctxEdit: 'Edit',
  ctxDuplicate: 'Duplicate',
  ctxDelete: 'Delete',
  showingResults: 'Showing {n} of {total} results',
  sortedBy: 'Sorted by {column} {direction}',
  tableLoaded: 'Table loaded, {n} rows',
  cellUpdated: '{column} updated',
  clearFilter: 'Clear filter',
  pageSize: 'Rows per page',
  goToPage: 'Go to page',
  undoToast: 'Undo: {column} restored to "{value}"',
  redoToast: 'Redo: {column} set to "{value}"',
  savePreset: 'Save preset',
  presetNamePrompt: 'Preset name',
  deletePreset: 'Delete preset {name}',
};

/**
 * Options accepted by mountTable.  A superset of the frozen RendererOptions
 * with additive fields the renderer needs but the frozen Store contract does
 * not surface (columns, role, locale) plus a Phase-4 string-override hook.
 */
export interface DomRendererOptions extends RendererOptions {
  /** Column definitions (the frozen Store does not expose its config columns). */
  columns?: TableCrafterColumn[] | undefined;
  /** Current user role for advisory column visibility checks. */
  role?: string | undefined;
  /** BCP-47 locale override; otherwise auto-detected from <html lang>. */
  locale?: string | undefined;
  /** Per-mount UI string overrides. */
  strings?: Partial<UiStrings> | undefined;
  /**
   * When true, wires createFuzzyEngine as the active search engine on the store.
   * This enables approximate-match searching (single bare terms) while delegating
   * complex grammar queries to exact evaluation.
   */
  fuzzy?: boolean | undefined;
  /**
   * Page-size options shown in the rows-per-page selector.
   * Defaults to [10, 25, 50, 100].
   */
  pageSizes?: number[] | undefined;
  /**
   * Saved filter preset controller (#337). When provided, the toolbar shows a
   * "Save preset" button and a list of saved presets with apply/delete. The
   * wrapper wires this to its localStorage-backed preset API.
   */
  presets?: PresetController | undefined;
}

/** Filter preset UI hooks, provided by the wrapper (#337). */
export interface PresetController {
  /** Names of all saved presets. */
  list(): string[];
  /** Save the current filter state under a name. */
  save(name: string): void;
  /** Apply a saved preset. */
  apply(name: string): void;
  /** Delete a saved preset. */
  remove(name: string): void;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  attrs?: Record<string, string>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (attrs) for (const k in attrs) node.setAttribute(k, attrs[k]!);
  return node;
}

function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : `{${name}}`
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Shallow per-row reference compare (see file header deviation note 1). */
function sameRows(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function selectionEqual(a: Set<RowId>, b: Set<RowId>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

function sameSort(a: TableState['sort'], b: TableState['sort']): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.column !== b[i]!.column || a[i]!.direction !== b[i]!.direction) return false;
  }
  return true;
}

function coerceRowId(idStr: string): RowId {
  const n = Number(idStr);
  return idStr !== '' && !Number.isNaN(n) && String(n) === idStr ? n : idStr;
}

function cssEscape(value: string): string {
  const cssApi = (globalThis as { CSS?: { escape?: (s: string) => string } }).CSS;
  if (cssApi && typeof cssApi.escape === 'function') return cssApi.escape(value);
  return value.replace(/["\\\]]/g, '\\$&');
}

function readColumns(store: Store, opts: DomRendererOptions): TableCrafterColumn[] {
  if (Array.isArray(opts.columns) && opts.columns.length > 0) return opts.columns;
  const hook = (store as unknown as { __columns__?: TableCrafterColumn[] }).__columns__;
  if (Array.isArray(hook) && hook.length > 0) return hook;
  const first = store.getState().rows[0];
  if (first && typeof first === 'object') {
    return Object.keys(first as Record<string, unknown>).map((key) => ({ key }));
  }
  return [];
}

// ---------------------------------------------------------------------------
// mountTable
// ---------------------------------------------------------------------------

/**
 * Mount a TableCrafter store to a DOM element.
 *
 * @param store   - The headless store returned by createTable().
 * @param element - The container element.  A managed div.tc-root is appended;
 *                  the element is not cleared.
 * @param options - Renderer options.
 * @returns A Renderer handle with destroy() and update().
 */
export function mountTable(
  store: Store,
  element: HTMLElement,
  options: DomRendererOptions = {}
): Renderer {
  const opts = options;
  const strings: UiStrings = { ...UI_STRINGS, ...(opts.strings ?? {}) };
  const role = opts.role;
  const cardBreakpoint = opts.breakpoints?.card ?? 640;
  const viewMode: 'table' | 'card' | 'auto' = opts.view ?? 'auto';

  const htmlLang =
    typeof document !== 'undefined' ? document.documentElement.lang : '';
  const locale = opts.locale ?? detectLocale(htmlLang);
  const i18n: I18nInstance = createI18n({ locale });

  const registry: CellRegistry = createCellRegistry();
  const cellOverride = (column: TableCrafterColumn): CellRendererFn | undefined =>
    opts.cells?.[column.key];

  const columns: TableCrafterColumn[] = readColumns(store, opts);

  const ac = new AbortController();
  const { signal } = ac;
  const dispatch = (action: Action): void => store.dispatch(action);

  // ---- Opt-in fuzzy search engine --------------------------------------
  if (opts.fuzzy === true) {
    const extStore = store as unknown as { setSearchEngine?: (e: SearchEngine) => void };
    extStore.setSearchEngine?.(createFuzzyEngine());
  }

  // ---- DOM skeleton -----------------------------------------------------
  const root = el('div', 'tc-root');
  root.dataset.theme = opts.theme ?? 'default';
  if (i18n.isRTL()) root.dir = 'rtl';

  const toolbar = el('div', 'tc-toolbar');
  const searchInput = el('input', 'tc-search', {
    type: 'search',
    placeholder: strings.search,
    'aria-label': strings.search,
  });
  const filterSummary = el('div', 'tc-filter-summary');
  const addBtn = el('button', 'tc-add-row', { type: 'button' });
  addBtn.textContent = strings.addNew;
  toolbar.append(searchInput, filterSummary, addBtn);

  // ---- saved filter presets (#337) --------------------------------------
  if (opts.presets) {
    const presets = opts.presets;
    const presetBar = el('div', 'tc-preset-bar');
    const renderPresetBar = (): void => {
      presetBar.textContent = '';
      const saveBtn = el('button', 'tc-preset-save', { type: 'button' });
      saveBtn.textContent = strings.savePreset;
      saveBtn.addEventListener(
        'click',
        () => {
          const name = typeof window !== 'undefined' ? window.prompt(strings.presetNamePrompt) : null;
          if (name && name.trim()) {
            presets.save(name.trim());
            renderPresetBar();
          }
        },
        { signal: ac.signal }
      );
      presetBar.appendChild(saveBtn);
      for (const name of presets.list()) {
        const item = el('span', 'tc-preset-item');
        const applyBtn = el('button', 'tc-preset-apply', { type: 'button' });
        applyBtn.textContent = name;
        applyBtn.addEventListener('click', () => presets.apply(name), { signal: ac.signal });
        const delBtn = el('button', 'tc-preset-delete', {
          type: 'button',
          'aria-label': fmt(strings.deletePreset, { name }),
        });
        delBtn.textContent = '×';
        delBtn.addEventListener(
          'click',
          () => {
            presets.remove(name);
            renderPresetBar();
          },
          { signal: ac.signal }
        );
        item.append(applyBtn, delBtn);
        presetBar.appendChild(item);
      }
    };
    renderPresetBar();
    toolbar.appendChild(presetBar);
  }

  const wrapper = el('div', 'tc-table-wrapper');
  const table = el('table', 'tc-table', { role: 'grid' });
  const thead = el('thead');
  const tbody = el('tbody');
  table.append(thead, tbody);
  const cards = el('div', 'tc-cards-container', { role: 'list' });
  wrapper.append(table, cards);

  const overlay = el('div', 'tc-overlay tc-hidden', { 'aria-hidden': 'true' });
  overlay.appendChild(el('div', 'tc-spinner'));
  wrapper.append(overlay);

  const pagination = el('div', 'tc-pagination');
  const dialog = el('dialog', 'tc-dialog');
  const menu = el('div', 'tc-context-menu tc-hidden');
  menu.id = `tc-menu-${Math.random().toString(36).slice(2, 8)}`;

  root.append(toolbar, wrapper, pagination, dialog, menu);
  element.appendChild(root);

  const liveRegion = createLiveRegion();

  // ---- undo/redo toast (#332) -------------------------------------------
  // Non-blocking, auto-dismissing confirmation of undo/redo. The headless
  // store emits history:undo / history:redo with the changed field/values;
  // this renders a transient toast and mirrors it to the live region so
  // screen-reader users hear the same confirmation.
  const TOAST_MS = 3000;
  const toastLayer = el('div', 'tc-toast-layer');
  root.appendChild(toastLayer);
  const toastTimers = new Set<ReturnType<typeof setTimeout>>();

  function columnLabel(key: string): string {
    if (!key) return '';
    return columns.find((c) => c.key === key)?.label ?? key;
  }

  function showToast(message: string): void {
    const toast = el('div', 'tc-toast', { role: 'status', 'aria-live': 'polite' });
    toast.textContent = message;
    toastLayer.appendChild(toast);
    liveRegion.announce(message);
    const timer = setTimeout(() => {
      toast.remove();
      toastTimers.delete(timer);
    }, TOAST_MS);
    toastTimers.add(timer);
  }

  const onUndo = (p: TableCrafterEventMap['history:undo']): void => {
    showToast(fmt(strings.undoToast, { column: columnLabel(p.column), value: String(p.value ?? '') }));
  };
  const onRedo = (p: TableCrafterEventMap['history:redo']): void => {
    showToast(fmt(strings.redoToast, { column: columnLabel(p.column), value: String(p.value ?? '') }));
  };
  store.on('history:undo', onUndo);
  store.on('history:redo', onRedo);

  // ---- state tracking ---------------------------------------------------
  let latestState: TableState | null = null;
  let currentSelection: Set<RowId> = new Set();
  let rowIdFor: (row: unknown) => RowId = () => -1;

  function refreshRowIdFn(state: TableState): void {
    const map = new Map<unknown, number>();
    state.rows.forEach((r, i) => {
      if (!map.has(r)) map.set(r, i);
    });
    rowIdFor = (row: unknown): RowId => {
      if (isRecord(row) && Object.prototype.hasOwnProperty.call(row, 'id')) {
        const id = row['id'];
        if (typeof id === 'string' || typeof id === 'number') return id;
      }
      return map.get(row) ?? -1;
    };
  }

  function visibleColumns(): TableCrafterColumn[] {
    return columns.filter((c) => c.hidden !== true && canViewCell(c, role));
  }

  // ---- column pinning (#328) --------------------------------------------
  const DEFAULT_PIN_WIDTH = 120;
  function pinWidth(col: TableCrafterColumn): number {
    return col.width ?? col.minWidth ?? DEFAULT_PIN_WIDTH;
  }

  /**
   * Cumulative sticky offsets for pinned columns, keyed by column key.
   * Left-pinned columns accumulate from the left edge in visible order;
   * right-pinned columns accumulate from the right edge in reverse.
   */
  function pinOffsets(): Map<string, { side: 'left' | 'right'; offset: number }> {
    const cols = visibleColumns();
    const map = new Map<string, { side: 'left' | 'right'; offset: number }>();
    let left = 0;
    for (const col of cols) {
      if (col.pinned === 'left') {
        map.set(col.key, { side: 'left', offset: left });
        left += pinWidth(col);
      }
    }
    let right = 0;
    for (let i = cols.length - 1; i >= 0; i--) {
      const col = cols[i]!;
      if (col.pinned === 'right') {
        map.set(col.key, { side: 'right', offset: right });
        right += pinWidth(col);
      }
    }
    return map;
  }

  /** Apply (or clear) sticky pin classes + inline offset on a header/body cell. */
  function applyPin(
    cell: HTMLElement,
    col: TableCrafterColumn,
    offsets: Map<string, { side: 'left' | 'right'; offset: number }>
  ): void {
    const pin = offsets.get(col.key);
    cell.classList.remove('tc-pinned', 'tc-pinned-left', 'tc-pinned-right');
    cell.style.removeProperty('left');
    cell.style.removeProperty('right');
    if (!pin) return;
    cell.classList.add('tc-pinned', `tc-pinned-${pin.side}`);
    cell.style[pin.side] = `${pin.offset}px`;
  }

  // ---- value formatting + cell content ----------------------------------
  function formatValue(value: unknown, type?: TableCrafterColumn['type']): string {
    if (value === null || value === undefined) return '';
    if (type === 'number') return i18n.formatNumber(Number(value));
    if (type === 'date') return i18n.formatDate(value as string | number | Date);
    if (type === 'boolean' || type === 'checkbox') return value ? '✓' : '';
    return String(value);
  }

  // ---- search highlighting helpers -------------------------------------

  /**
   * Collect matched character indices for highlighting a cell value against a
   * query AST.  Returns null when the node kind is too complex for highlighting
   * (or/not/regex), or an empty array when there is no match in this column.
   *
   * The caller merges results from AND children; field nodes only contribute
   * indices when their field key matches the column being rendered.
   */
  function collectHighlightIndices(
    text: string,
    node: import('../core/types').QueryNode,
    colKey: string
  ): number[] | null {
    switch (node.kind) {
      case 'term': {
        const result = fuzzyMatch(node.value, text);
        return result.indices;
      }
      case 'field': {
        if (node.field !== colKey) return []; // different column — no highlight here
        const result = fuzzyMatch(node.value, text);
        return result.indices;
      }
      case 'and': {
        const left = collectHighlightIndices(text, node.left, colKey);
        const right = collectHighlightIndices(text, node.right, colKey);
        if (left === null || right === null) return null;
        return [...new Set([...left, ...right])].sort((a, b) => a - b);
      }
      case 'or':
      case 'not':
      case 'regex':
        return null; // complex — skip highlighting
    }
  }

  /**
   * Apply search highlighting to a cell element via DOM nodes (no innerHTML of
   * user data).  Matched runs are wrapped in <mark class="tc-highlight">;
   * unmatched text becomes plain text nodes.  Returns true when at least one
   * mark was inserted.
   */
  function applySearchHighlight(
    td: HTMLElement,
    text: string,
    node: import('../core/types').QueryNode,
    colKey: string
  ): boolean {
    const indices = collectHighlightIndices(text, node, colKey);
    if (!indices || indices.length === 0) return false;

    // Deduplicate and sort
    const sorted = [...new Set(indices)].sort((a, b) => a - b);

    // Build consecutive ranges
    const ranges: Array<[number, number]> = [];
    let k = 0;
    while (k < sorted.length) {
      const rangeStart = sorted[k]!;
      let rangeEnd = rangeStart;
      while (k + 1 < sorted.length && sorted[k + 1]! === rangeEnd + 1) {
        rangeEnd = sorted[++k]!;
      }
      k++;
      ranges.push([rangeStart, rangeEnd]);
    }

    // Emit text nodes + mark elements (no innerHTML of user content)
    let pos = 0;
    for (const [start, end] of ranges) {
      if (pos < start) {
        td.appendChild(document.createTextNode(text.slice(pos, start)));
      }
      const mark = document.createElement('mark');
      mark.className = 'tc-highlight';
      mark.textContent = text.slice(start, end + 1);
      td.appendChild(mark);
      pos = end + 1;
    }
    if (pos < text.length) {
      td.appendChild(document.createTextNode(text.slice(pos)));
    }
    return true;
  }

  function renderCellContent(
    td: HTMLElement,
    value: unknown,
    row: unknown,
    column: TableCrafterColumn
  ): void {
    td.textContent = '';
    let fn: CellRendererFn | undefined = cellOverride(column);
    if (!fn && column.renderer) fn = registry.get(column.renderer);
    if (!fn && column.type) fn = registry.get(column.type);
    if (fn) {
      // Custom renderers own their own output; no highlight overlay applied.
      const out = fn(value, row, column);
      if (typeof out === 'string') td.textContent = out;
      else td.appendChild(out);
      return;
    }

    const text = formatValue(value, column.type);
    const ast = latestState?.searchAst ?? null;

    if (ast !== null && text !== '') {
      const highlighted = applySearchHighlight(td, text, ast, column.key);
      if (highlighted) return;
    }

    td.textContent = text;
  }

  // ---- editing state ----------------------------------------------------
  interface OpenEditor {
    rowId: RowId;
    column: string;
    td: HTMLElement;
    input: HTMLElement;
  }
  let openEditor: OpenEditor | null = null;

  function isEditingCell(rowId: RowId, column: string): boolean {
    const ec = latestState?.editingCell;
    return !!ec && ec.rowId === rowId && ec.column === column;
  }

  // ---- header -----------------------------------------------------------
  function buildHead(state: TableState): void {
    thead.textContent = '';
    const cols = visibleColumns();
    const tr = el('tr', undefined, { role: 'row' });
    const badges = getSortBadges(state);
    const offsets = pinOffsets();
    cols.forEach((col) => {
      const th = el('th', 'tc-th', { role: 'columnheader', 'data-col': col.key });
      if (col.sortable !== false) th.classList.add('tc-sortable');
      applyPin(th, col, offsets);
      const label = el('span', 'tc-th-label');
      label.textContent = col.label ?? col.key;
      th.appendChild(label);
      const active = state.sort.find((s) => s.column === col.key);
      if (active) {
        const ind = el('span', 'tc-sort-indicator');
        ind.textContent = active.direction === 'asc' ? '▲' : '▼';
        th.appendChild(ind);
        if (state.sort.length > 1 && badges[col.key]) {
          const b = el('span', 'tc-sort-priority');
          b.textContent = String(badges[col.key]);
          th.appendChild(b);
        }
      }
      tr.appendChild(th);
    });
    thead.appendChild(tr);
  }

  // ---- row / card builders ----------------------------------------------
  function buildRow(row: unknown, _absIndex: number): HTMLTableRowElement {
    const cols = visibleColumns();
    const rowId = rowIdFor(row);
    const tr = el('tr', 'tc-row', { role: 'row' });
    tr.dataset.rowId = String(rowId);
    if (hasId(currentSelection, String(rowId))) tr.classList.add('tc-selected');
    const offsets = pinOffsets();
    cols.forEach((col) => {
      const td = el('td', 'tc-cell', { role: 'gridcell', 'data-col': col.key });
      td.dataset.rowId = String(rowId);
      applyPin(td, col, offsets);
      const editable = col.editable === true && canEditCell(col, role);
      if (editable) td.dataset.editable = 'true';
      const value = isRecord(row) ? row[col.key] : undefined;
      if (isEditingCell(rowId, col.key)) {
        materializeEditor(td, row, col, value);
      } else {
        renderCellContent(td, value, row, col);
      }
      tr.appendChild(td);
    });
    return tr;
  }

  function buildCard(row: unknown, _absIndex: number): HTMLElement {
    const cols = visibleColumns();
    const rowId = rowIdFor(row);
    const card = el('div', 'tc-card', { role: 'listitem' });
    card.dataset.rowId = String(rowId);
    if (hasId(currentSelection, String(rowId))) card.classList.add('tc-selected');
    cols.forEach((col) => {
      const field = el('div', 'tc-card-field');
      const label = el('div', 'tc-card-label');
      label.textContent = col.label ?? col.key;
      const val = el('div', 'tc-card-value', { 'data-col': col.key });
      val.dataset.rowId = String(rowId);
      if (col.editable === true && canEditCell(col, role)) val.dataset.editable = 'true';
      const value = isRecord(row) ? row[col.key] : undefined;
      renderCellContent(val, value, row, col);
      field.append(label, val);
      card.appendChild(field);
    });
    return card;
  }

  // ---- body -------------------------------------------------------------
  function renderBodyRows(state: TableState): void {
    tbody.textContent = '';
    cards.textContent = '';
    const rows = state.displayRows;
    if (rows.length === 0) {
      const tr = el('tr', 'tc-no-results-row', { role: 'row' });
      const td = el('td', 'tc-no-results', { role: 'gridcell' });
      td.colSpan = Math.max(1, visibleColumns().length);
      td.textContent = strings.noResults;
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    const frag = document.createDocumentFragment();
    const cardFrag = document.createDocumentFragment();
    rows.forEach((row, i) => {
      frag.appendChild(buildRow(row, i));
      cardFrag.appendChild(buildCard(row, i));
    });
    tbody.appendChild(frag);
    cards.appendChild(cardFrag);
  }

  // ---- pagination -------------------------------------------------------
  function renderPagination(state: TableState): void {
    pagination.textContent = '';
    if (state.pageSize <= 0 || state.pageCount <= 1) {
      pagination.classList.add('tc-hidden');
      return;
    }
    pagination.classList.remove('tc-hidden');

    // Page-size selector
    const defaultPageSizes = [10, 25, 50, 100];
    const pageSizes = opts.pageSizes ?? defaultPageSizes;
    // Include current pageSize in the list when absent, sorted ascending
    const sizeList = pageSizes.includes(state.pageSize)
      ? pageSizes
      : [...pageSizes, state.pageSize].sort((a, b) => a - b);
    const sizeSelect = el('select', 'tc-page-size-select', {
      'aria-label': strings.pageSize,
    });
    for (const size of sizeList) {
      const opt = el('option');
      opt.value = String(size);
      opt.textContent = String(size);
      if (size === state.pageSize) opt.selected = true;
      sizeSelect.appendChild(opt);
    }

    // Prev button
    const prev = el('button', 'tc-page-prev', { type: 'button' });
    prev.textContent = strings.previous;
    prev.disabled = state.page <= 1;

    // Page info
    const info = el('span', 'tc-page-info');
    info.textContent = fmt(strings.pageOf, { current: state.page, total: state.pageCount });

    // Next button
    const next = el('button', 'tc-page-next', { type: 'button' });
    next.textContent = strings.next;
    next.disabled = state.page >= state.pageCount;

    // Jump-to-page input
    const jumpInput = el('input', 'tc-page-jump', {
      type: 'number',
      min: '1',
      max: String(state.pageCount),
      value: String(state.page),
      'aria-label': strings.goToPage,
    });

    pagination.append(sizeSelect, prev, info, next, jumpInput);
  }

  // ---- filter summary + search sync -------------------------------------
  function renderFilterSummary(state: TableState): void {
    filterSummary.textContent = '';
    for (const key in state.filters) {
      const f = state.filters[key];
      if (!f) continue;
      const chip = el('span', 'tc-filter-chip');
      chip.textContent = `${key}: ${String(f.value)}`;
      const x = el('button', 'tc-filter-clear', {
        type: 'button',
        'data-col': key,
        'aria-label': strings.clearFilter,
      });
      x.textContent = '×';
      chip.appendChild(x);
      filterSummary.appendChild(chip);
    }
    if (searchInput.value !== state.searchQuery) searchInput.value = state.searchQuery;
  }

  // ---- loading / error / busy ------------------------------------------
  function renderStatus(state: TableState): void {
    overlay.classList.toggle('tc-hidden', !state.loading);
    overlay.setAttribute('aria-hidden', state.loading ? 'false' : 'true');
    root.classList.toggle('tc-loading', state.loading);
    table.setAttribute('aria-busy', state.loading ? 'true' : 'false');
    const existing = wrapper.querySelector('.tc-error');
    if (state.error) {
      const msg = existing ?? el('div', 'tc-error', { role: 'alert' });
      msg.textContent = state.error;
      if (!existing) wrapper.appendChild(msg);
    } else if (existing) {
      existing.remove();
    }
  }

  // ---- editor materialization -------------------------------------------
  function selectOptionsFor(column: TableCrafterColumn): string[] {
    const oneOf = (column.validation ?? []).find((r: ValidationRule) => r.type === 'oneOf');
    if (oneOf && Array.isArray(oneOf.value)) return oneOf.value.map((v) => String(v));
    const colOpts = (column as { options?: unknown }).options;
    if (Array.isArray(colOpts)) return colOpts.map((v) => String(v));
    return [];
  }

  function createEditorElement(column: TableCrafterColumn, value: unknown): HTMLElement {
    const type = column.type;
    if (type === 'boolean' || type === 'checkbox') {
      const input = el('input', 'tc-editor', { type: 'checkbox' });
      (input as HTMLInputElement).checked = Boolean(value);
      return input;
    }
    if (type === 'select') {
      const sel = el('select', 'tc-editor');
      for (const o of selectOptionsFor(column)) {
        const opt = el('option');
        opt.value = o;
        opt.textContent = o;
        if (String(value) === o) opt.selected = true;
        sel.appendChild(opt);
      }
      return sel;
    }
    if (type === 'star') {
      const fs = el('fieldset', 'tc-editor tc-star-editor');
      const cur = Number(value) || 0;
      for (let i = 1; i <= 5; i++) {
        const label = el('label', 'tc-star-option');
        const radio = el('input', undefined, { type: 'radio', name: 'tc-star', value: String(i) });
        (radio as HTMLInputElement).checked = i === cur;
        label.appendChild(radio);
        fs.appendChild(label);
      }
      return fs;
    }
    const inputType = type === 'number' ? 'number' : type === 'date' ? 'date' : 'text';
    const input = el('input', 'tc-editor', { type: inputType });
    (input as HTMLInputElement).value =
      value === null || value === undefined ? '' : String(value);
    return input;
  }

  function readEditorValue(input: HTMLElement, column: TableCrafterColumn): unknown {
    const type = column.type;
    if (type === 'boolean' || type === 'checkbox') return (input as HTMLInputElement).checked;
    if (type === 'star') {
      const checked = input.querySelector<HTMLInputElement>('input:checked');
      return checked ? Number(checked.value) : 0;
    }
    const raw = (input as HTMLInputElement | HTMLSelectElement).value;
    if (type === 'number') {
      const n = Number(raw);
      return raw === '' ? '' : Number.isNaN(n) ? raw : n;
    }
    return raw;
  }

  function materializeEditor(
    td: HTMLElement,
    row: unknown,
    column: TableCrafterColumn,
    value: unknown
  ): void {
    td.textContent = '';
    td.dataset.editing = 'true';
    const input = createEditorElement(column, value);
    td.appendChild(input);
    const rowId = rowIdFor(row);
    const isSelectLike =
      column.type === 'select' || column.type === 'boolean' || column.type === 'checkbox';

    const emit = (): void => {
      dispatch({
        type: 'EDIT_CELL',
        payload: { rowId, column: column.key, value: readEditorValue(input, column) },
      });
    };
    input.addEventListener('input', emit, { signal });
    input.addEventListener('change', emit, { signal });
    input.addEventListener(
      'blur',
      () => {
        emit();
        dispatch({ type: 'COMMIT_EDIT' });
      },
      { signal }
    );
    input.addEventListener(
      'keydown',
      (ev) => {
        const e = ev as KeyboardEvent;
        if (e.key === 'Escape') {
          e.preventDefault();
          dispatch({ type: 'CANCEL_EDIT' });
        } else if (e.key === 'Enter' && !isSelectLike) {
          e.preventDefault();
          emit();
          dispatch({ type: 'COMMIT_EDIT' });
        }
      },
      { signal }
    );

    openEditor = { rowId, column: column.key, td, input };
    input.focus();
  }

  function findTd(rowId: RowId, column: string): HTMLElement | null {
    return tbody.querySelector<HTMLElement>(
      `td[data-row-id="${cssEscape(String(rowId))}"][data-col="${cssEscape(column)}"]`
    );
  }

  function restoreCell(rowId: RowId, column: string): void {
    const td = findTd(rowId, column);
    if (!td || !latestState) return;
    delete td.dataset.editing;
    const col = columns.find((c) => c.key === column);
    if (!col) return;
    const row = latestState.displayRows.find((r) => rowIdFor(r) === rowId);
    if (row === undefined) return;
    renderCellContent(td, isRecord(row) ? row[column] : undefined, row, col);
  }

  function patchEditing(next: TableState, prev: TableState): void {
    const nc = next.editingCell;
    if (openEditor && (!nc || openEditor.rowId !== nc.rowId || openEditor.column !== nc.column)) {
      const { rowId, column } = openEditor;
      openEditor = null;
      restoreCell(rowId, column);
    }
    if (nc && (!openEditor || openEditor.rowId !== nc.rowId || openEditor.column !== nc.column)) {
      const td = findTd(nc.rowId, nc.column);
      const col = columns.find((c) => c.key === nc.column);
      const row = next.displayRows.find((r) => rowIdFor(r) === nc.rowId);
      if (td && col && row !== undefined) {
        materializeEditor(td, row, col, isRecord(row) ? row[nc.column] : undefined);
      }
    }
    if (prev.editingCell && !nc && !next.error) {
      const col = columns.find((c) => c.key === prev.editingCell!.column);
      liveRegion.announce(
        fmt(strings.cellUpdated, { column: col?.label ?? prev.editingCell.column })
      );
    }
  }

  // ---- selection --------------------------------------------------------
  function hasId(set: Set<RowId>, idStr: string): boolean {
    for (const id of set) if (String(id) === idStr) return true;
    return false;
  }

  function patchSelection(next: TableState): void {
    const sel = next.selection;
    tbody.querySelectorAll<HTMLElement>('tr[data-row-id]').forEach((tr) => {
      const selected = hasId(sel, tr.dataset.rowId!);
      tr.classList.toggle('tc-selected', selected);
      tr.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    cards.querySelectorAll<HTMLElement>('.tc-card[data-row-id]').forEach((c) => {
      c.classList.toggle('tc-selected', hasId(sel, c.dataset.rowId!));
    });
  }

  // ---- full rebuild -----------------------------------------------------
  function vsOffset(): number {
    return virtualCtrl?.getCurrentRange()?.start ?? 0;
  }

  function rebuild(state: TableState): void {
    const patch = (): void => {
      buildHead(state);
      if (!virtualCtrl) renderBodyRows(state);
      applyAriaGrid(table, state, visibleColumns(), vsOffset());
    };
    const runPatch = (): void => preserveFocusThroughPatch(wrapper, patch);
    if (typeof document.startViewTransition === 'function') {
      document.startViewTransition(runPatch);
    } else {
      runPatch();
    }
    renderPagination(state);
    renderFilterSummary(state);
    if (virtualCtrl) virtualCtrl.update(state);
  }

  // ---- announcements ----------------------------------------------------
  function announceDiffs(next: TableState, prev: TableState): void {
    if (next.loading && !prev.loading) {
      liveRegion.announce(strings.loading);
      return;
    }
    if (!next.loading && prev.loading) {
      liveRegion.announce(fmt(strings.tableLoaded, { n: next.totalRows }));
    }
    if (next.error && next.error !== prev.error) {
      liveRegion.announce(`${strings.error} ${next.error}`);
      return;
    }
    if (!sameSort(next.sort, prev.sort) && next.sort.length > 0) {
      const primary = next.sort[0]!;
      const col = columns.find((c) => c.key === primary.column);
      liveRegion.announce(
        fmt(strings.sortedBy, {
          column: col?.label ?? primary.column,
          direction: primary.direction === 'asc' ? 'ascending' : 'descending',
        })
      );
    }
    const filterChanged =
      next.searchQuery !== prev.searchQuery ||
      Object.keys(next.filters).length !== Object.keys(prev.filters).length;
    if (filterChanged) {
      liveRegion.announce(fmt(strings.showingResults, { n: next.totalRows, total: next.rows.length }));
    } else if (next.page !== prev.page) {
      liveRegion.announce(fmt(strings.pageOf, { current: next.page, total: next.pageCount }));
    }
  }

  // ---- reconcile ladder -------------------------------------------------
  function reconcile(next: TableState, prev: TableState | null): void {
    latestState = next;
    currentSelection = next.selection;
    refreshRowIdFn(next);

    if (prev === null) {
      buildHead(next);
      maybeMountVirtual(next);
      if (!virtualCtrl) renderBodyRows(next);
      renderPagination(next);
      renderFilterSummary(next);
      renderStatus(next);
      applyAriaGrid(table, next, visibleColumns(), vsOffset());
      if (virtualCtrl) virtualCtrl.update(next);
      return;
    }

    const rowsChanged = !sameRows(next.displayRows, prev.displayRows);
    // Also rebuild when the search query changes to apply or clear highlights, even
    // if the displayRows set happens to contain the same row references.
    const searchChanged = next.searchQuery !== prev.searchQuery;
    if (rowsChanged || searchChanged) {
      rebuild(next);
    } else if (next.editingCell !== prev.editingCell) {
      patchEditing(next, prev);
      applyAriaGrid(table, next, visibleColumns(), vsOffset());
    } else if (!selectionEqual(next.selection, prev.selection)) {
      patchSelection(next);
      applyAriaGrid(table, next, visibleColumns(), vsOffset());
    }

    if (next.loading !== prev.loading || next.error !== prev.error) {
      renderStatus(next);
    }
    announceDiffs(next, prev);
  }

  // ---- virtual scroll ---------------------------------------------------
  let virtualCtrl: VirtualScrollController | null = null;
  let virtualMode: 'table' | 'card' = 'table';

  function maybeMountVirtual(state: TableState): void {
    if (opts.virtual !== true || state.pageSize > 0) return;
    virtualMode = root.dataset.cardMode === 'true' ? 'card' : 'table';
    const host = virtualMode === 'card' ? cards : tbody;
    virtualCtrl = mountVirtualScroll(host, {
      rowHeight: 40,
      overscan: 5,
      mode: virtualMode,
      buildRow,
      buildCard,
      getRows: () => (latestState ? latestState.sortedRows : state.sortedRows),
    });
  }

  function remountVirtualForMode(): void {
    if (!virtualCtrl || !latestState || latestState.pageSize > 0) return;
    const nextMode: 'table' | 'card' = root.dataset.cardMode === 'true' ? 'card' : 'table';
    if (nextMode === virtualMode) return;
    virtualCtrl.destroy();
    virtualCtrl = null;
    maybeMountVirtual(latestState);
    if (virtualCtrl) (virtualCtrl as VirtualScrollController).update(latestState);
  }

  // ---- card mode (container-query first, ResizeObserver fallback) -------
  let ro: ResizeObserver | null = null;
  if (viewMode === 'card') {
    root.dataset.cardMode = 'true';
  } else if (viewMode === 'table') {
    root.dataset.cardMode = 'false';
  } else {
    const supportsCQ =
      typeof CSS !== 'undefined' &&
      typeof CSS.supports === 'function' &&
      CSS.supports('container-type', 'inline-size');
    if (!supportsCQ && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const isCard = entry.contentRect.width <= cardBreakpoint;
        const changed = root.dataset.cardMode !== String(isCard);
        root.dataset.cardMode = String(isCard);
        if (changed) remountVirtualForMode();
      });
      ro.observe(element);
    }
  }

  // ---- helpers referencing latestState ----------------------------------
  function currentCellValue(rowIdStr: string, column: string): unknown {
    if (!latestState) return undefined;
    const row = latestState.displayRows.find((r) => String(rowIdFor(r)) === rowIdStr);
    return isRecord(row) ? row[column] : undefined;
  }

  function columnKeyByIndex(colIndex: number): string | undefined {
    return visibleColumns()[colIndex]?.key;
  }

  // ---- context menu -----------------------------------------------------
  let menuTarget: { rowId: string; column: string } | null = null;
  const supportsPopover =
    typeof HTMLElement !== 'undefined' && 'popover' in HTMLElement.prototype;

  const menuItems: Array<[string, string]> = [
    ['edit', strings.ctxEdit],
    ['duplicate', strings.ctxDuplicate],
    ['delete', strings.ctxDelete],
  ];
  for (const [action, label] of menuItems) {
    const btn = el('button', 'tc-menu-item', { type: 'button', 'data-action': action, tabindex: '0' });
    btn.textContent = label;
    menu.appendChild(btn);
  }
  if (supportsPopover) menu.setAttribute('popover', 'auto');

  function showMenu(rowId: string, column: string, x: number, y: number): void {
    menuTarget = { rowId, column };
    menu.classList.remove('tc-hidden');
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    const withPopover = menu as HTMLElement & { showPopover?: () => void };
    if (supportsPopover && typeof withPopover.showPopover === 'function') {
      try {
        withPopover.showPopover();
      } catch {
        /* already shown */
      }
    } else {
      const closer = (e: MouseEvent): void => {
        if (!menu.contains(e.target as Node)) {
          hideMenu();
          document.removeEventListener('click', closer);
        }
      };
      setTimeout(() => document.addEventListener('click', closer, { signal }), 0);
    }
    menu.querySelector<HTMLElement>('.tc-menu-item')?.focus();
  }

  function hideMenu(): void {
    menu.classList.add('tc-hidden');
    const withPopover = menu as HTMLElement & { hidePopover?: () => void };
    if (supportsPopover && typeof withPopover.hidePopover === 'function') {
      try {
        withPopover.hidePopover();
      } catch {
        /* already hidden */
      }
    }
    menuTarget = null;
  }

  function handleMenuAction(action: string): void {
    if (!menuTarget) return;
    const rowId = coerceRowId(menuTarget.rowId);
    if (action === 'edit') {
      dispatch({
        type: 'EDIT_CELL',
        payload: {
          rowId,
          column: menuTarget.column,
          value: currentCellValue(menuTarget.rowId, menuTarget.column),
        },
      });
    } else if (action === 'duplicate') {
      dispatch({ type: 'DUPLICATE_ROW', payload: { rowId } });
    } else if (action === 'delete') {
      dispatch({ type: 'DELETE_ROW', payload: { rowId } });
    }
  }

  menu.addEventListener(
    'keydown',
    (ev) => {
      const e = ev as KeyboardEvent;
      const items = Array.from(menu.querySelectorAll<HTMLElement>('.tc-menu-item'));
      const idx = items.indexOf(document.activeElement as HTMLElement);
      if (e.key === 'Escape') {
        e.preventDefault();
        hideMenu();
      } else if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        items[(idx + 1) % items.length]?.focus();
      } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
        e.preventDefault();
        items[(idx - 1 + items.length) % items.length]?.focus();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        (document.activeElement as HTMLElement)?.click();
      }
    },
    { signal }
  );

  // ---- roving tabindex + keyboard action CustomEvents -------------------
  const a11yTeardown = mountRovingTabindex(table, (rowIndex) => {
    if (virtualCtrl) {
      const range = virtualCtrl.getCurrentRange();
      if (range && (rowIndex < range.start || rowIndex >= range.end)) {
        virtualCtrl.scrollToRow(rowIndex);
      }
    }
  });

  table.addEventListener(
    'tablecrafter:edit',
    (ev) => {
      const detail = (ev as CustomEvent).detail as { rowId?: string; colIndex?: number };
      if (detail.rowId === undefined) return;
      const column = columnKeyByIndex(detail.colIndex ?? 0);
      if (!column) return;
      dispatch({
        type: 'EDIT_CELL',
        payload: { rowId: coerceRowId(detail.rowId), column, value: currentCellValue(detail.rowId, column) },
      });
    },
    { signal }
  );
  table.addEventListener('tablecrafter:commit', () => dispatch({ type: 'COMMIT_EDIT' }), { signal });
  table.addEventListener('tablecrafter:cancel', () => dispatch({ type: 'CANCEL_EDIT' }), { signal });
  table.addEventListener(
    'tablecrafter:select',
    (ev) => {
      const detail = (ev as CustomEvent).detail as { rowId?: string; multi?: boolean };
      if (detail.rowId === undefined) return;
      dispatch({ type: 'SELECT', payload: { rowId: coerceRowId(detail.rowId), multi: detail.multi } });
    },
    { signal }
  );

  // ---- event delegation (single click handler on tc-root) ---------------
  root.addEventListener(
    'click',
    (ev) => {
      const target = ev.target as HTMLElement;

      const clearChip = target.closest<HTMLElement>('.tc-filter-clear');
      if (clearChip) {
        dispatch({ type: 'FILTER', payload: { column: clearChip.dataset.col!, filter: null } });
        return;
      }
      if (target.closest('.tc-page-prev')) {
        store.setPage(store.getState().page - 1);
        return;
      }
      if (target.closest('.tc-page-next')) {
        store.setPage(store.getState().page + 1);
        return;
      }
      if (target.closest('.tc-add-row')) {
        store.addRow();
        return;
      }
      const toggle = target.closest<HTMLElement>('.tc-card-toggle');
      if (toggle) {
        toggle.closest('.tc-card')?.classList.toggle('tc-card--expanded');
        return;
      }
      const item = target.closest<HTMLElement>('.tc-menu-item');
      if (item) {
        handleMenuAction(item.dataset.action!);
        hideMenu();
        return;
      }
      const th = target.closest<HTMLElement>('th[data-col]');
      if (th && th.classList.contains('tc-sortable')) {
        store.sort(th.dataset.col!, undefined, { append: (ev as MouseEvent).shiftKey });
        return;
      }
      const editableTd = target.closest<HTMLElement>('[data-editable="true"]');
      if (editableTd && !target.closest('.tc-editor')) {
        dispatch({
          type: 'EDIT_CELL',
          payload: {
            rowId: coerceRowId(editableTd.dataset.rowId!),
            column: editableTd.dataset.col!,
            value: currentCellValue(editableTd.dataset.rowId!, editableTd.dataset.col!),
          },
        });
        return;
      }
      const row = target.closest<HTMLElement>('[data-row-id]');
      if (row && !target.closest('.tc-editor')) {
        const me = ev as MouseEvent;
        dispatch({
          type: 'SELECT',
          payload: {
            rowId: coerceRowId(row.dataset.rowId!),
            multi: me.shiftKey || me.ctrlKey || me.metaKey,
          },
        });
      }
    },
    { signal }
  );

  searchInput.addEventListener('input', () => store.search(searchInput.value), { signal });

  // ---- pagination control events (change + Enter on jump input) ---------
  pagination.addEventListener(
    'change',
    (ev) => {
      const target = ev.target as HTMLElement;
      if (target.classList.contains('tc-page-size-select')) {
        store.setPageSize(parseInt((target as HTMLSelectElement).value, 10));
      } else if (target.classList.contains('tc-page-jump')) {
        const v = parseInt((target as HTMLInputElement).value, 10);
        const total = latestState?.pageCount ?? 1;
        store.setPage(Math.max(1, Math.min(Number.isNaN(v) ? 1 : v, total)));
      }
    },
    { signal }
  );

  pagination.addEventListener(
    'keydown',
    (ev) => {
      const ke = ev as KeyboardEvent;
      const target = ke.target as HTMLElement;
      if (target.classList.contains('tc-page-jump') && ke.key === 'Enter') {
        ke.preventDefault();
        const v = parseInt((target as HTMLInputElement).value, 10);
        const total = latestState?.pageCount ?? 1;
        store.setPage(Math.max(1, Math.min(Number.isNaN(v) ? 1 : v, total)));
      }
    },
    { signal }
  );

  root.addEventListener(
    'contextmenu',
    (ev) => {
      const td = (ev.target as HTMLElement).closest<HTMLElement>('td[data-row-id]');
      if (!td) return;
      ev.preventDefault();
      const me = ev as MouseEvent;
      showMenu(td.dataset.rowId!, td.dataset.col!, me.clientX, me.clientY);
    },
    { signal }
  );

  // ---- drag range selection (4px threshold) -----------------------------
  let dragAnchor: { x: number; y: number; rowId: string } | null = null;
  let dragging = false;

  root.addEventListener(
    'mousedown',
    (ev) => {
      if (openEditor) return;
      const td = (ev.target as HTMLElement).closest<HTMLElement>('td[data-row-id]');
      if (!td) return;
      const me = ev as MouseEvent;
      dragAnchor = { x: me.clientX, y: me.clientY, rowId: td.dataset.rowId! };
      dragging = false;
    },
    { signal }
  );

  document.addEventListener(
    'mousemove',
    (ev) => {
      if (!dragAnchor) return;
      const dx = ev.clientX - dragAnchor.x;
      const dy = ev.clientY - dragAnchor.y;
      if (!dragging && Math.hypot(dx, dy) > 4) dragging = true;
      if (dragging) {
        const overRow = document
          .elementFromPoint(ev.clientX, ev.clientY)
          ?.closest<HTMLElement>('tr[data-row-id]');
        if (overRow) extendSelection(dragAnchor.rowId, overRow.dataset.rowId!);
      }
    },
    { signal }
  );

  document.addEventListener(
    'mouseup',
    () => {
      dragAnchor = null;
      dragging = false;
    },
    { signal }
  );

  function extendSelection(fromId: string, toId: string): void {
    if (!latestState) return;
    const ids = latestState.displayRows.map((r) => String(rowIdFor(r)));
    const a = ids.indexOf(fromId);
    const b = ids.indexOf(toId);
    if (a < 0 || b < 0) return;
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    store.deselectAll();
    for (let i = lo; i <= hi; i++) store.select(coerceRowId(ids[i]!), true);
  }

  // ---- subscribe --------------------------------------------------------
  let prevState: TableState | null = null;
  reconcile(store.getState(), null);
  prevState = store.getState();
  const unsubscribe = store.subscribe((state) => {
    const prev = prevState;
    prevState = state;
    reconcile(state, prev);
  });

  // ---- Renderer handle --------------------------------------------------
  function rerender(): void {
    const state = store.getState();
    prevState = state;
    reconcile(state, null); // null forces a full rebuild so pin classes reflow
  }

  return {
    update(state: TableState): void {
      const prev = prevState;
      prevState = state;
      reconcile(state, prev);
    },
    pinColumn(field: string, side: 'left' | 'right' = 'left'): void {
      const col = columns.find((c) => c.key === field);
      if (!col || col.pinned === side) return;
      col.pinned = side;
      rerender();
    },
    unpinColumn(field: string): void {
      const col = columns.find((c) => c.key === field);
      if (!col || col.pinned === undefined) return;
      col.pinned = undefined;
      rerender();
    },
    destroy(): void {
      ac.abort();
      unsubscribe();
      store.off('history:undo', onUndo);
      store.off('history:redo', onRedo);
      for (const t of toastTimers) clearTimeout(t);
      toastTimers.clear();
      virtualCtrl?.destroy();
      if (typeof a11yTeardown === 'function') a11yTeardown();
      liveRegion.destroy();
      ro?.disconnect();
      root.remove();
    },
  };
}
