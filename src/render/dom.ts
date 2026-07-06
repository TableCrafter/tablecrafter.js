/**
 * render/dom.ts
 *
 * DOM renderer.  Mounts a TableCrafter store to a container element and
 * reconciles the DOM on every state change.  Supports table and card view,
 * pagination UI, sticky and pinned columns.
 *
 * Uses Popover API for column/context menus (feature-detected, falls back to
 * positioned div + AbortController outside-click).  Uses <dialog> for
 * add-row / bulk-edit modals.  Uses View Transitions when available.
 * Phase 0: typed stub.
 */

import type { Store, Renderer, RendererOptions } from '../core/types';

/**
 * Mount a TableCrafter store to a DOM element.
 *
 * Multiple renderers may be mounted to the same store.  Each renderer
 * subscribes independently and can be destroyed without affecting others.
 *
 * @param store   - The headless store returned by createTable().
 * @param element - The container element to render into.
 * @param options - Renderer options (view mode, theme, cells, virtual scroll).
 * @returns       A Renderer handle with destroy() and update() methods.
 */
export function mountTable(
  _store: Store,
  _element: HTMLElement,
  _options?: RendererOptions
): Renderer {
  throw new Error('mountTable: not implemented -- Phase 3');
}
