/**
 * cdn.ts
 *
 * IIFE CDN entry. Exposes the TableCrafter batteries wrapper as window.TableCrafter.
 * Built separately as dist/v3/tablecrafter.global.js (IIFE format, minified).
 *
 * Included in the bundle: core, dom renderer, csv/json export, base cells,
 * json/csv adapters. xlsx/pdf/google-sheets/xml remain dynamic-import-only.
 */
export { TableCrafter as default } from './index';
