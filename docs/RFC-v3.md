# RFC: TableCrafter.js v3 Architecture

Status: Proposed
Supersedes epics: #32 (npm), #33 (TypeScript), #34 (build), #35 (CDN), #49 (theming)
Absorbs: Epic #323 parity work (#324-#339) lands on the v3 module boundaries below
Baseline: v2.0.0, a 5,810-line monolithic `TableCrafter` class, zero deps, ~27KB min+gz, 850+ Jest tests

## 1. Summary and principles

v3 splits the monolith into a headless core plus a default DOM renderer, ported to strict TypeScript, ESM-first with one IIFE CDN bundle. The owner has zero users, so we take unlimited breaking changes now and never again. Guiding rules: the core never touches the DOM; every optional capability is a tree-shakeable module; the batteries-included wrapper keeps v2's one-line ergonomics.

## 2. Package layout

Decision: single package, not a monorepo. One `tablecrafter` package with subpath exports. Rationale: a monorepo (pnpm workspaces, changesets, N package.jsons) buys independent versioning we do not need with zero users and one author. Subpath exports give the same tree-shaking and clean import paths with one `npm publish`, one version, one changelog, one release-please target. If a second consumer ever needs core versioned apart from the renderer, we split then. Do not pay that tax up front.

Directory tree:

```
src/
  index.ts                 # batteries wrapper (default export) + re-exports
  core/
    state.ts               # store, subscribe, config normalize, SSR hydrate
    types.ts               # shared public types
    events.ts              # on/off/once/emit
    plugins.ts             # use/unuse registry + hook dispatch
  sorting/index.ts
  filtering/
    index.ts               # per-column filters + auto-detection
    grammar.ts             # search grammar parser (AND/OR/not/field:value/regex)
    fuzzy.ts               # optional fuzzy matcher
  editing/
    index.ts               # edit lifecycle, add/duplicate/bulk-fill
    history.ts             # undo/redo stack
  validation/index.ts
  permissions/index.ts
  i18n/index.ts            # Intl wrappers, RTL, locale
  export/
    csv.ts json.ts print.ts
    xlsx.ts pdf.ts         # dynamic import of optional peer deps
  render/
    dom.ts                 # mountTable, table + card view, pagination UI
    virtual.ts             # DOM windowing
    a11y.ts                # ARIA grid wiring, aria-live
  cells/
    index.ts registry.ts
    badge.ts progress.ts sparkline.ts link.ts star.ts
    conditional.ts         # dataBar/colorScale/icon + rules engine
  adapters/
    inline.ts json.ts csv.ts google-sheets.ts xml.ts
    pagination-link.ts     # RFC-5988 follow
  cdn.ts                   # IIFE entry, pre-wires wrapper + dom renderer
```

Subpath export map (package.json `exports`): `.`, `./core`, `./render`, `./adapters/*`, `./cells/*`, `./export/*`, `./i18n`, `./styles.css`, plus `./cdn` internal. `sideEffects: ["*.css"]` so everything else tree-shakes.

Feature-to-module map (v2 into v3):

| v2 capability | Module |
|---|---|
| data store, SSR hydrate, pagination/selection state, config | core/state |
| multi-column sort, comparators | sorting |
| per-column filters, auto-detect | filtering |
| search grammar, fuzzy, highlight tokens | filtering/grammar, filtering/fuzzy |
| 14 cell editors, add/duplicate/bulk fill, grid nav | editing |
| undo/redo history | editing/history |
| required/length/min-max/regex/unique/oneOf/phone/date/custom | validation |
| editable, ownOnly, per-column role advisory | permissions |
| table + card render, pagination UI, sticky, pinning | render/dom |
| virtual scroll | render/virtual |
| ARIA grid, aria-live | render/a11y |
| badge/progress/sparkline/link/star | cells/* |
| dataBar/colorScale/icon + rules engine | cells/conditional |
| CSV/JSON/print export | export/csv,json,print |
| xlsx/pdf export | export/xlsx,pdf (dynamic import) |
| Intl number/date, RTL, locale | i18n |
| on/off/once/emit | core/events |
| plugin use()/unuse() | core/plugins |
| inline/JSON/CSV/Sheets/XML sources, link pagination | adapters/* |

## 3. Public API surface

Three layers, each a valid entry point.

Headless core:

```ts
import { createTable } from 'tablecrafter/core';
const store = createTable({ data, columns, editable: true });
store.subscribe(state => {/* derived rows, sort, filters, selection */});
store.getState(); store.dispatch(action); store.on('cell:edit', fn);
```

`createTable(config)` returns a `Store`: `getState`, `subscribe(listener) => unsubscribe`, `dispatch`, plus the event methods and imperative helpers (`sort`, `setFilter`, `search`, `editCell`, `addRow`, `undo`, `redo`, `export`). Sorting/filtering/editing modules are pure functions of `(state, action) => state`; the store composes whichever are imported. No DOM references anywhere in core.

Renderer:

```ts
import { mountTable } from 'tablecrafter/render';
const view = mountTable(store, element, { view: 'auto', theme: 'default', cells });
view.destroy(); // AbortController tears down all listeners
```

`mountTable` subscribes to the store and reconciles the DOM. Renderer options cover view mode, breakpoints, theme name, cell-renderer registry, virtual-scroll toggle. Multiple renderers may mount one store.

Batteries wrapper (default export, preserves v2 one-liner):

```ts
import TableCrafter from 'tablecrafter';
const table = new TableCrafter('#el', { data: '/api/rows', columns, editable: true });
table.render();
```

The wrapper internally calls `createTable` + `mountTable` with all default modules and the DOM renderer wired. This is the CDN/IIFE surface and the migration path for v2 users. It re-exposes the store methods so existing `.on()`, `.export()`, `.sort()` calls keep working.

Events model: reuse the just-shipped v2 `on(event, handler)`, `off(event, handler)`, `once(event, handler)`, internal `emit`. Same event names (`cell:edit`, `row:add`, `row:update`, `row:delete`, `sort`, `filter`, `page:change`, `selection:change`). Events live in core and fire from the store, so headless consumers get them without a renderer.

Plugin contract v3:

```ts
interface TableCrafterPlugin {
  name: string;
  install(ctx: PluginContext, options?): void;
  uninstall?(ctx: PluginContext): void;
}
```

Change from v2: `install` receives a `PluginContext` (store + optional renderer handle + `on`/`dispatch` + a `registerCell` hook), not the whole `this`. This lets plugins target headless or DOM without reaching into private fields. `use(plugin, options)` / `unuse(name)` and `config.plugins: []` auto-registration carry over. Duplicate-name registration still throws.

## 4. TypeScript strategy

Source is TypeScript, `strict: true` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`. Types are generated by the bundler (`vite-plugin-dts` rolling up to one `.d.ts` per entry), replacing the handwritten `src/tablecrafter.d.ts`. Public types (`TableCrafterConfig`, `TableCrafterColumn`, `CellType`, `QueryNode`, event payloads, `Store`, `TableCrafterPlugin`) are exported from `core/types.ts` and re-exported at each entry. `.d.ts` generation runs in CI and a type-level test (`tsd` or `expectTypeOf`) guards the public surface against accidental drift. Frozen identifiers from the rebrand stay frozen.

## 5. Build and tooling

Bundler: Vite library mode. Rationale: Vite gives lib mode over Rollup with per-entry inputs, first-class `.d.ts` via plugin, an instant dev playground for the examples, and native Vitest integration, all in one config. esbuild alone lacks mature multi-entry `.d.ts` and CSS handling; raw Rollup means hand-wiring what Vite ships. We keep Rollup underneath (Vite uses it) without maintaining its config.

Outputs: ESM per entry (`dist/*.mjs`, primary), one IIFE bundle from `cdn.ts` (`dist/tablecrafter.global.js`, minified, self-contained, global `TableCrafter`). No CJS: v3 is ESM-first and zero users means no legacy require() to support. CSS ships as `dist/styles.css` plus the CSS-layers theme file.

Testing: migrate Jest to Vitest. jsdom environment, near drop-in for the 850+ tests (`describe`/`it`/`expect` compatible; codemod `jest.fn` to `vi.fn`). Vitest reuses the Vite config so module resolution matches the build. Playwright adds a thin smoke layer: mount each entry in a real browser, assert render, one edit, one sort, one export, keyboard grid nav, and Popover/dialog interaction. Playwright is smoke only, not a second unit suite.

Size gates: `size-limit` in CI with per-entry budgets. `tablecrafter/core` <= 8KB gz (hard fail), full batteries bundle target <= 30KB gz. Per-module soft budgets (sorting <1KB, filtering <3KB, export <2KB before peer deps) catch regressions at the boundary that grew them. CI fails the PR on budget breach.

Release: release-please with conventional commits. Single package target (matches the single-package decision), `.release-please-manifest.json` already present. `feat!`/`BREAKING CHANGE` drive the v3 major. npm publish is `provenance: true` from CI on tag.

## 6. Web platform usage map

| Feature | Modern API | Degradation |
|---|---|---|
| Filter dropdowns, column/context menus | Popover API (`popover`, `popovertarget`) | Popover supported in all current evergreen browsers; feature-detect `HTMLElement.prototype.hasOwnProperty('popover')`, fall back to a positioned `div` with manual outside-click via AbortController |
| Add-row / bulk-edit / detail modals | `<dialog>` + `showModal()` | Native focus trap and Esc; detect `HTMLDialogElement`, fall back to div + manual trap |
| Responsive card view | Container queries (`@container`) | Cards degrade to media-query breakpoints (768/480) where `@container` absent |
| Theming | CSS `@layer` (tablecrafter.base, .theme, .user) + custom properties | Layers ignored gracefully by old engines; cascade order still yields a usable default |
| Sort/filter/page transitions | View Transitions (`startViewTransition`) | Progressive enhancement only; wrapped in a capability check, instant swap otherwise |
| Grid semantics + keyboard | ARIA grid pattern (`role=grid/row/gridcell`, roving tabindex) | Always on, no fallback needed; core accessibility |
| Live announcements | `aria-live` polite region | Always on |
| Fetch lifecycle, listener teardown | AbortController | Everywhere; `destroy()` aborts one signal that cancels fetches and removes all listeners |
| Number/date/currency formatting | `Intl.NumberFormat`/`DateTimeFormat`, `Intl.Collator` for locale sort | Always available in targets; replaces v2's ignored `i18n.formats` |

## 7. Migration from v2

Breaking changes:

| v2 | v3 | Note |
|---|---|---|
| CJS `require('tablecrafter')` | ESM only | no CJS build |
| UMD `dist/tablecrafter.umd.min.js` | IIFE `dist/tablecrafter.global.js` | global name unchanged |
| `new TableCrafter(el, cfg)` monolith | same wrapper API, headless underneath | one-liner preserved |
| plugin `install(table)` gets `this` | `install(ctx)` gets PluginContext | plugin authors update |
| handwritten `.d.ts` | generated types | import paths stable |
| everything in one import | subpath imports for direct module use | wrapper still bundles all |
| `main`/`module` fields | `exports` map only | old bundlers unsupported |
| xlsx/pdf silently broken | declared optional peer deps, dynamic import | must install peer |

v2 npm deprecation note: `npm deprecate tablecrafter@"<3.0.0" "v2 is unmaintained; v3 is a headless-core rewrite, ESM-first. See MIGRATION.md."` Keep v2 installable, stop patching it.

Port order (unblock the most parallel work first):

1. `core/types.ts` + `core/state.ts` + `core/events.ts` first, solo. Every other module imports these; they define the store contract. This is the one serializing dependency.
2. `core/plugins.ts` and the `Store` action shape land with core.
3. Once the store contract is frozen, all leaf modules port in parallel (sections below). Each is a pure function set or an isolated renderer concern with no cross-imports beyond core.

## 8. Work breakdown (parallel phases)

Phase 0 (serial, 1 agent): scaffold. package.json `exports`, Vite config, Vitest config, size-limit budgets, release-please, empty module files with typed stubs. Freezes the store contract. Blocks everything.

Phase 1 (serial, 1 agent): core/state + core/events + core/types + core/plugins. Produces the `Store`. Merged before Phase 2 opens.

Phase 2 (parallel, 10+ agents, one module each, no shared files). Every task owns its own directory and its own test file:

- T2.1 sorting/ (multi-col, Intl.Collator, comparators)
- T2.2 filtering/index.ts (per-column, auto-detect)
- T2.3 filtering/grammar.ts + fuzzy.ts (grammar parser, #330 fuzzy)
- T2.4 editing/index.ts (14 editors, add/duplicate/bulk-fill, grid nav #333)
- T2.5 editing/history.ts (undo/redo #332)
- T2.6 validation/ (all rules incl. unique/oneOf/custom)
- T2.7 permissions/ (editable, ownOnly, per-column advisory #338)
- T2.8 i18n/ (Intl wrappers, RTL, #327 formats)
- T2.9 export/csv,json,print (#331 print + filename tokens)
- T2.10 export/xlsx,pdf (#325 peer deps, dynamic import)
- T2.11 cells/ leaf renderers (badge, progress, sparkline, link, star #334)
- T2.12 cells/conditional.ts (rules engine + dataBar/colorScale/icon)
- T2.13 adapters/json,csv,inline
- T2.14 adapters/google-sheets,xml,pagination-link (#336)

These 14 tasks share only `core/*` (read-only) and never touch each other's files. Ten-plus agents run clean.

Phase 3 (parallel after Phase 2, 3 agents): render/dom.ts, render/virtual.ts (#326), render/a11y.ts (ARIA grid + aria-live #335). These share the `render/` dir so they are one review boundary but split by file; dom.ts is the integrator so it lands slightly after virtual/a11y expose their hooks.

Phase 4 (serial, 1 agent): index.ts batteries wrapper + cdn.ts IIFE entry, wiring all modules. Then Playwright smoke, size-limit verification, MIGRATION.md, README rewrite.

Parity issues #328 (sticky/pinning), #329 (pagination UI), #337 (preset + URL filter UI) attach to Phase 3 render tasks. #339 (server-proxy recipes) is docs-only, any phase.

## 9. Risks and open questions

1. Store contract churn mid-port. If Phase 1's action shape is wrong, Phase 2 rework cascades. Recommendation: land a typed `Store` interface with a spec test in Phase 1 and freeze it; changes after freeze require an RFC amendment, not a silent edit.
2. Container-query support for the card view on older Safari. Recommendation: ship the media-query fallback in the same stylesheet from day one so no capability gap exists; treat container queries as the enhancement, not the baseline.
3. Peer dep UX for xlsx/pdf. Users hit a runtime error if the peer is absent. Recommendation: dynamic-import with a caught rejection that throws a clear "install xlsx to use Excel export" message; document in README, do not bundle.
4. IIFE bundle size creeping past 30KB once all cells and adapters are wired. Recommendation: the CDN bundle includes common modules only (core, dom, csv/json export, base cells, json/csv adapters); xlsx/pdf/sheets/xml stay import-only. size-limit enforces the 30KB gate on this exact entry.
5. Test migration fidelity (Jest to Vitest across 850+ tests). Recommendation: run the codemod, then run both runners once in parallel CI on the scaffold branch to diff results before deleting the Jest config; accept Vitest only when green matches green.
