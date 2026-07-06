/**
 * index.ts
 *
 * Batteries-included wrapper (default export).  Preserves v2 one-liner
 * ergonomics while composing the headless core with the DOM renderer.
 *
 * Usage:
 *   import TableCrafter from 'tablecrafter';
 *   const table = new TableCrafter('#el', { data: '/api/rows', columns });
 *   table.render();
 *
 * The wrapper re-exposes store methods so existing .on(), .export(), .sort()
 * call sites keep working without modification.
 * Phase 0: typed stub -- fully wired in Phase 4.
 */

import type { TableCrafterConfig, Store, Renderer } from './core/types';

/** Batteries wrapper class.  Mirrors the v2 constructor signature. */
export class TableCrafter {
  protected readonly store: Store;
  protected renderer: Renderer | null = null;

  constructor(
    _selector: string | HTMLElement,
    _config: TableCrafterConfig
  ) {
    throw new Error('TableCrafter: not implemented -- Phase 4');
  }

  /** Mount the DOM renderer to the configured element. */
  render(): this {
    throw new Error('TableCrafter.render: not implemented -- Phase 4');
  }

  /** Unmount the renderer and destroy the store. */
  destroy(): void {
    throw new Error('TableCrafter.destroy: not implemented -- Phase 4');
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
