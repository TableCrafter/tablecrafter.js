Maintained jointly with the plugin repo copy at TableCrafter/tablecrafter/docs/PARITY.md. Update both when either side ships parity work.

# TableCrafter Parity Matrix

**Scope:** feature parity between the TableCrafter WordPress plugin (v8.0.40) and the TableCrafter.js standalone library (v2.0.0, last commit 2026-04-29). Bidirectional: each side should offer the other's client-side capabilities where they make sense outside/inside WordPress.

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
| JSON/REST URL | Free; streaming; RFC-5988 pagination | fetch + `root` path; no link-header pagination | GAP-JS (pagination follow) |
| CSV | Free; file or URL; dialect auto-detect | RFC-4180 parser; manual import only, no URL fetch | GAP-JS (CSV by URL) |
| Google Sheets (public) | Free | none | GAP-JS |
| XML | Pro | none | GAP-JS |
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
| Saved filter presets | Free (per-user) | API only, no UI | GAP-JS (UI) |
| URL-parameter pre-filter | Free (`?gt_col_x=`) | none | GAP-JS |
| Sticky headers | Free (CSS native) | none | GAP-JS |
| Column pinning (sticky columns) | none | class-only implementation (no CSS sticky shipped) | GAP-WP + finish in JS |
| Column resize | Free | none | GAP-JS |
| Column reorder / visibility | Free (drag-drop + picker) | SOLID (programmatic + config) | OK |
| Responsive card view | Free (768/480 breakpoints) | SOLID (breakpoints, expandable sections) | OK |
| Conditional formatting rules | Free (equals/contains/gt/lt/empty -> color/bold/class) | dataBar/colorScale/icon; no rule->style engine | GAP-JS (rules engine) |
| Status badges | Free | SOLID (badge cell type) | OK |
| Data bars / gradient / bipolar | Pro | dataBar + colorScale | OK (sub-options partial) |
| Star rating cell | Free | none | GAP-JS |
| Sparkline cell | Pro (Data Bars sub-option) | SOLID standalone | GAP-WP (standalone cell type) |
| Formula columns | wired: save in class-tc-admin.php:1374, augment in class-tc-ajax.php:2479, builder UI in table-builder.php:2000 | SOLID (arithmetic + function library) | GAP-WP (function library breadth; verify per issue) |
| Totals/aggregation row | Free (incl. count-distinct) | SOLID except `distinct` unimplemented | GAP-JS (distinct) |
| Detail row / entry popup | Free (eye icon) | mobile card expand only | GAP-JS |
| Row link click-through | Free (URL template) | link cell type only, not row-level | GAP-JS |
| Row grouping / cell merge / pivot | orphaned or partially wired services | none | PARKED both sides (plugin must wire first) |
| Auto-refresh + last-updated | Free | none | GAP-JS |
| Skeleton loader | Free | none | GAP-JS |
| Virtual scrolling / DOM windowing | Free (v8.0.18) | API exists, never consulted by renderer (stub) | GAP-JS (wire it) |
| Cell range selection + copy TSV | none | partial: selectRange/copySelectionAsTSV API real, no shift-click/drag DOM wiring | GAP-WP + finish DOM wiring in JS (#206) |
| Context menu (right-click) | none | partial: openContextMenu API with ARIA, no trigger binding, positioning, or keyboard nav | GAP-WP + finish trigger/positioning in JS (#44) |
| RTL | Free | SOLID (locale-driven) | OK |
| Custom CSS/theming | Free (per-table CSS, presets) | CSS custom properties + theme attr; no shipped named themes | GAP-JS (ship 2-3 named themes) |
| Accessibility | WCAG 2.1 AA pass | good ARIA; no aria-live regions | GAP-JS (aria-live) |

## 3. Editing

| Capability | Plugin | Library | Verdict |
|---|---|---|---|
| Inline editing | Pro: text, textarea, select, date, toggle, lookup | SOLID: 14 types + lookup + custom registry | GAP-WP (number, email, url, datetime, multiselect, checkbox, color, range) |
| Validation | Pro: required, length, min/max, regex | SOLID: those + unique, oneOf/notOneOf, phone, date bounds, custom fn | GAP-WP (unique, oneOf, custom fn) |
| Keyboard spreadsheet nav | Pro | partial (sort keys, edit Enter/Esc; no arrow-grid nav) | GAP-JS (arrow-key grid nav) |
| Undo/redo | Pro (+ toast) | none | GAP-JS |
| Add row (modal) | Pro | SOLID | OK |
| Duplicate row (+ field locking) | Pro | none | GAP-JS |
| Bulk delete | Pro | SOLID | OK |
| Bulk column fill | Pro (+ diff preview) | callback only, no UI | GAP-JS |
| Bulk edit modal | none (column fill covers) | callback only | GAP-JS (modal) |
| Edit diff badge ("was: X") | Free | none | GAP-JS |
| Per-column role restriction | Pro (server-enforced) | `editable` boolean only | GAP-JS (client-side advisory; document that server must enforce) |
| Row-level ownership (`ownOnly`) | Free (current-user filter) | SOLID | OK |

## 4. Export

| Capability | Plugin | Library | Verdict |
|---|---|---|---|
| CSV (+ filtered, injection-safe) | Free | SOLID | OK |
| Excel | Free (server) | code present; `xlsx` peer dep undeclared | GAP-JS (declare + document) |
| PDF | none server-side | code present; `jspdf` peer deps undeclared | GAP-JS (declare) / GAP-WP (decide: offer or not) |
| Print (+ print settings) | Free | none | GAP-JS |
| JSON export | none | SOLID | GAP-WP |
| Copy to clipboard | Free (visible rows) | SOLID (selection TSV + CSV copy) | OK |
| Filename templates | Free (tokens) | static `exportFilename` | GAP-JS (tokens) |

## 5. Library integrity items (block the parity claim)

These are bugs in the parity *claim* itself, independent of features:

1. `table.on(event, fn)` is documented in the README but does not exist in source.
2. `src/gravity-table.js` is an empty file shipped in the package.
3. `i18n.formats` (formatNumber/formatDate) config key is accepted and ignored.
4. `distinct` aggregation is in the TypeScript types but returns null.
5. Virtual scroll API sets a flag the renderer never reads.
6. `xlsx`/`jspdf` exports fail at runtime because peer deps are not declared.
7. README/examples claim "100% parity"; this matrix is now the source of truth for that claim and the README must link it and soften the wording until the P0/P1 gaps close.

## Priorities

- **P0 (integrity):** section 5 items; README claim correction on both sides.
- **P1 (high-visibility parity):** sticky headers, print, pagination UI, undo/redo, search highlight+fuzzy (JS); search grammar, range selection + copy, context menu, richer inline cell types + validation (plugin).
- **P2 (rest):** everything else in the matrix; PARKED items wait for the plugin to wire its orphaned services first.
