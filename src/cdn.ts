/**
 * cdn.ts
 *
 * IIFE CDN entry point.  Pre-wires the batteries wrapper with the DOM
 * renderer and exposes the global `TableCrafter` name.
 *
 * This file is the sole entry for `dist/tablecrafter.global.js`.
 * It includes: core, dom renderer, csv/json export, base cells, json/csv
 * adapters.  xlsx / pdf / google-sheets / xml stay import-only to keep the
 * IIFE under the 30KB gz budget.
 * Phase 0: typed stub -- wired up in Phase 4.
 */

export { default } from './index';
