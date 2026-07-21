Maintained jointly with the plugin repo copy at TableCrafter/tablecrafter-pro/docs/PARITY.md (private dev repo). Update both when either side ships parity work.

# TableCrafter Parity Matrix

**Scope:** feature parity between the TableCrafter WordPress plugin (v8.0.40) and the TableCrafter.js standalone library. Library column reflects v3 architecture (PRs #351-#373) for rows verified in the July 2026 closure pass; rows not yet re-verified still reflect v2.0.0 (last commit 2026-04-29). Bidirectional: each side should offer the other's client-side capabilities where they make sense outside/inside WordPress.

**Legend:** OK = at parity. GAP-JS = plugin has it, library lacks it. GAP-WP = library has it, plugin lacks it. N/A = deliberately out of scope for that side. Tier notes (Free/Pro) describe the plugin.

## Non-goals (deliberate asymmetry)

These are NOT parity gaps and will not get issues:

- **WordPress-only integration:** shortcodes, Gutenberg/Elementor/Divi blocks, WP capabilities/roles, GFAPI write-back, WP cron scheduled export, WP REST auth, Abilities API. The library replaces these with its `api.*` config, permissions object, and plugin system.
- **Server-side-only concerns:** scheduled/email exports, threshold email alerts, webhooks, cache invalidation, push-back engines with secret credentials. A browser library must not hold Airtable PATs, Notion tokens, or DB credentials; the documented pattern is a server proxy endpoint consumed via `api.baseUrl`. A recipes doc covers this instead.
- **Freemius licensing:** the library is MIT-ish open source; no feature gating.

## 1. Data sources

| Capability | Plugin 8.0.40 | Library 2.0.0 | Verdict |
|---|---|---|---|
| Inline data | via saved table config | `data: [...]` | OK |
| JSON/REST URL | Free; streaming; RFC-5988 pagination | fetch + `root` path; `adapters/pagination-link.ts` follows `rel="next"` Link headers (RFC-5988/8288, 100-page cap) | OK |
| CSV | Free; file or URL; dialect auto-detect | RFC-4180 parser; `adapters/csv.ts` `createCsvAdapter` fetches by URL | OK |
| Google Sheets (public) | Free | `adapters/google-sheets.ts` `createGoogleSheetsAdapter` (gviz CSV endpoint; public sheets only) | OK |
| XML | Pro | `adapters/xml.ts` `createXmlAdapter` (regex extractor, no DOMParser dependency) | OK |
| Excel read | Free (server-side PhpSpreadsheet) | N/A client-side read (xlsx peer dep is export-only) | N/A |
| Airtable / Notion / External DB / GF / WooCommerce | Pro; server-side, encrypted credentials | N/A in-browser (credential exposure); server-proxy recipe instead | N/A + doc |
| Write-back | Pro push engines (JSON/Airtable/Notion/GF/WC status) | REST create/update/delete via `api.*` | OK (shape differs) |

## 2. Display

| Capability | Plugin | Library | Verdict |
|---|---|---|---|
| Multi-column sort | Free (shift-click, max 3, badges) | SOLID (unlimited, badges, custom comparators) | OK |
| Pagination UI | page controls + per-page selector + Show All | prev/next only; per-page + jump-to-page programmatic only | GAP-JS (UI) |
| Global search | Free; fuzzy option; term highlighting | debounced search + full grammar (AND/OR/negation/field:value/regex/comparisons) | GAP-JS (highlight, fuzzy) / GAP-WP (grammar) |
| Per-column filters | text, dropdown, multi-select, date-range + presets, numeric range, checkbox AND/OR | text, multiselect, date range, number range; auto-detection | OK (presets minor) |
| Saved filter presets | Free (per-user) | `saveFilterPreset`/`loadFilterPreset`/`listFilterPresets`/`deleteFilterPreset` (localStorage, per-table) + toolbar UI (save/apply/delete) | OK |
| URL-parameter pre-filter | Free (`?gt_col_x=`) | `?tc_{field}=` applied on init; `syncUrl:true` mirrors filters to the URL via pushState | OK |
| Sticky headers | Free (CSS native) | SOLID (`dom.css` `.tc-th { position:sticky; top:0; z-index:2 }`) | OK |
| Column pinning (sticky columns) | none | declarative `column.pinned` + runtime `pinColumn()`/`unpinColumn()`; renderer sets `position:sticky` with computed left/right offsets, CSS in `dom.css` | GAP-WP (plugin lacks it) |
| Column resize | Free | none | GAP-JS |
| Column reorder / visibility | Free (drag-drop + picker) | SOLID (programmatic + config) | OK |
| Responsive card view | Free (768/480 breakpoints) | SOLID (breakpoints, expandable sections) | OK |
| Conditional formatting rules | Free (equals/contains/gt/lt/empty -> color/bold/class) | SOLID (`cells/conditional.ts`: evalRule + matchingRules + renderConditional; dataBar/colorScale/icon kinds; registered in cells/registry.ts) | OK |
| Status badges | Free | SOLID (badge cell type) | OK |
| Data bars / gradient / bipolar | Pro | dataBar + colorScale | OK (sub-options partial) |
| Star rating cell | Free | SOLID (`cells/star.ts` renderStar + starDescriptor; configurable total; registered in cells/registry.ts) | OK |
| Sparkline cell | Pro (Data Bars sub-option) | SOLID standalone | GAP-WP (standalone cell type) |
| Formula columns | wired: save in class-tc-admin.php:1374, augment in class-tc-ajax.php:2479, builder UI in table-builder.php:2000 | SOLID (arithmetic + function library) | GAP-WP (function library breadth; verify per issue) |
| Totals/aggregation row | Free (incl. count-distinct) | SOLID except `distinct` unimplemented | GAP-JS (distinct) |
| Detail row / entry popup | Free (eye icon) | mobile card expand only | GAP-JS |
| Row link click-through | Free (URL template) | link cell type only, not row-level | GAP-JS |
| Row grouping / cell merge / pivot | orphaned or partially wired services | none | PARKED both sides (plugin must wire first) |
| Auto-refresh + last-updated | Free | none | GAP-JS |
| Skeleton loader | Free | none | GAP-JS |
| Virtual scrolling / DOM windowing | Free (v8.0.18) | SOLID (`dom.ts` `maybeMountVirtual` wires `mountVirtualScroll`; opt-in via `virtual:true`) | OK |
| Cell range selection + copy TSV | none | partial: selectRange/copySelectionAsTSV API real, no shift-click/drag DOM wiring | GAP-WP + finish DOM wiring in JS (#206) |
| Context menu (right-click) | none | SOLID (`dom.ts`: right-click trigger, Popover API positioning + fallback, keyboard nav; Edit/Duplicate/Delete items) | GAP-WP |
| RTL | Free | SOLID (locale-driven) | OK |
| Custom CSS/theming | Free (per-table CSS, presets) | CSS custom properties + theme attr; no shipped named themes | GAP-JS (ship 2-3 named themes) |
| Accessibility | WCAG 2.1 AA pass | SOLID (aria-live polite region `render/a11y.ts` `createLiveRegion` wired in `dom.ts`; ARIA grid pattern: role/rowindex/colindex/selected/sort) | OK |

## 3. Editing

| Capability | Plugin | Library | Verdict |
|---|---|---|---|
| Inline editing | Pro: text, textarea, select, date, toggle, lookup | SOLID: 14 types + lookup + custom registry | GAP-WP (number, email, url, datetime, multiselect, checkbox, color, range) |
| Validation | Pro: required, length, min/max, regex | SOLID: those + unique, oneOf/notOneOf, phone, date bounds, custom fn | GAP-WP (unique, oneOf, custom fn) |
| Keyboard spreadsheet nav | Pro | SOLID (`render/a11y.ts` `mountRovingTabindex`: arrows, Home/End/PageUp/PageDown, Enter/F2/Escape/Space; wired in `dom.ts`) | OK |
| Undo/redo | Pro (+ toast) | history stack in `core/state.ts` + `store.undo()`/`redo()` + wrapper proxy; `history:undo`/`history:redo` events drive an auto-dismissing toast in `render/dom.ts` | OK |
| Add row (modal) | Pro | SOLID | OK |
| Duplicate row (+ field locking) | Pro | SOLID (`editing/duplicate.ts` + `DUPLICATE_ROW` action wired in `dom.ts` context menu) | OK |
| Bulk delete | Pro | SOLID | OK |
| Bulk column fill | Pro (+ diff preview) | callback only, no UI | GAP-JS |
| Bulk edit modal | none (column fill covers) | callback only | GAP-JS (modal) |
| Edit diff badge ("was: X") | Free | none | GAP-JS |
| Per-column role restriction | Pro (server-enforced) | SOLID advisory (`permissions/index.ts` `canEditCell`/`canViewCell`/`visibleColumns`; wired in `dom.ts`; JSDoc explicitly marks advisory, server must enforce) | OK |
| Row-level ownership (`ownOnly`) | Free (current-user filter) | SOLID | OK |

## 4. Export

| Capability | Plugin | Library | Verdict |
|---|---|---|---|
| CSV (+ filtered, injection-safe) | Free | SOLID | OK |
| Excel | Free (server) | code present; `xlsx` peer dep undeclared | GAP-JS (declare + document) |
| PDF | none server-side | code present; `jspdf` peer deps undeclared | GAP-JS (declare) / GAP-WP (decide: offer or not) |
| Print (+ print settings) | Free | SOLID (`export/print.ts`: `toPrintHtml` + `openPrintWindow` + print stylesheet; `register()` for store wiring) | OK |
| JSON export | none | SOLID | GAP-WP |
| Copy to clipboard | Free (visible rows) | SOLID (selection TSV + CSV copy) | OK |
| Filename templates | Free (tokens) | SOLID (`export/filename.ts` `resolveFilename`: `{table}`, `{date}` tokens; used by print and other exporters) | OK |

## 5. Library integrity items (block the parity claim)

All seven P0 items were resolved by issues #324-#327 (closed) and README PR #322.

## 6. v3 architecture status (July 2026)

The library column now reflects the v3 architecture shipped across PRs #351-#373. Major deltas from the v2.0.0 baseline:

- **Print export** shipped: `export/print.ts` (toPrintHtml + window.print flow + print stylesheet).
- **Filename tokens** shipped: `export/filename.ts` (`{table}`, `{date}`).
- **Star rating cell** shipped: `cells/star.ts`; registered in `cells/registry.ts`.
- **Per-column roles** shipped: `permissions/index.ts` full advisory layer (`canEditCell`, `canViewCell`, `visibleColumns`); `dom.ts` wires both checks.
- **Google Sheets adapter** shipped: `adapters/google-sheets.ts` (gviz CSV endpoint rewrite; public sheets only).
- **XML adapter** shipped: `adapters/xml.ts` (regex extractor; no DOMParser dependency).
- **CSV-by-URL adapter** shipped: `adapters/csv.ts` `createCsvAdapter`.
- **Link-header pagination** shipped: `adapters/pagination-link.ts` (RFC-5988/8288 `rel="next"` follow).
- **Virtual scroll wired** in `dom.ts` `maybeMountVirtual()`.
- **Sticky headers** wired in `dom.css` (`.tc-th { position:sticky; top:0 }`).
- **Conditional formatting rules engine** shipped: `cells/conditional.ts` (rules, colorScale, dataBar, icon kinds).
- **Arrow-key grid nav** shipped: `render/a11y.ts` `mountRovingTabindex` + dom.ts wiring.
- **Duplicate row** shipped: `editing/duplicate.ts` + `DUPLICATE_ROW` action in dom.ts context menu.
- **Undo/redo history** shipped: `core/state.ts` stack + `store.undo()`/`redo()` + wrapper proxy, with an auto-dismissing toast driven by `history:undo`/`history:redo` events (#332).
- **Aria-live regions** shipped: `render/a11y.ts` `createLiveRegion` wired in dom.ts.
- **Context menu** completed in dom.ts: right-click trigger, Popover API positioning + fallback, keyboard nav.

Remaining P1 gaps: pagination per-page selector + jump-to-page UI (#329), search highlight wiring + fuzzy as default (#330).

Remaining P2 gaps: bulk fill UI, bulk edit modal, diff badge (#333); detail popup, row-link, auto-refresh, skeleton loader (#335); column resize (#338).

## Priorities

- **P0 (integrity):** all resolved (issues #324-#327, PR #322).
- **P1 (high-visibility parity):** pagination UI, undo/redo toast, search highlight wiring (JS); search grammar, range selection + copy, richer inline cell types + validation (plugin).
- **P2 (rest):** everything else in the matrix; PARKED items wait for the plugin to wire its orphaned services first.
