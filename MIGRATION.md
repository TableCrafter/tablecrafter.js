# Migrating from v2 to v3

v3 is a headless-core rewrite: the same table, split into a tree-shakeable
ESM core plus a batteries-included wrapper that keeps v2's one-liner ergonomics.
Most v2 apps migrate by changing nothing but the install, because the default
export preserves the v2 API. This guide covers the wrapper, direct module
imports, and the one contract change (multi-key sort).

> **Scope.** v3 is ESM-first. The `.` (default) export keeps a CommonJS build
> for legacy bundlers; every `./subpath` module is ESM-only. If you rely on
> `require('tablecrafter/core')`, stay on the wrapper or move to `import`.

---

## 1. The batteries wrapper — v2 ergonomics, unchanged

If you used v2's constructor, keep using it. The default export is a wrapper
(`src/index.ts`) that composes the headless core with the DOM renderer and
re-exposes `.render()`, `.sort()`, `.export()`, `.on()`/`.off()` so existing
call sites work without modification.

```js
import TableCrafter from 'tablecrafter';

const table = new TableCrafter('#el', {
  data: '/api/rows',
  columns: [
    { field: 'name', label: 'Name' },   // `field` is still accepted (alias for `key`)
    { key: 'email', label: 'Email' },
  ],
  editable: true,
  pagination: 25,                        // v2 shorthand: number → pageSize
});

table.render();
table
  .on('sort', (sortState) => { /* ... */ })
  .sort('name');
table.export('csv');
```

Compatibility shims the wrapper still honors:

| v2 form | v3 handling |
|---|---|
| `columns: [{ field }]` | `field` aliased to `key` (`WrapperColumn`) |
| `pagination: 25` | maps to `pageSize: 25` |
| `pagination: false` | disables pagination (`pageSize: 0`) |
| `pagination: { pageSize: 25 }` | object form; takes precedence over top-level `pageSize` |
| `editable: true` | marks every column without an explicit `editable` flag editable |

For most apps, **migration is `npm install tablecrafter@3` and nothing else.**

---

## 2. Direct module imports (the reason to move)

v3's value is subpath exports: pull in only the modules you use and let the
bundler drop the rest. Instead of one monolithic bundle, import from the
headless core and feature modules directly.

```js
import { createTable } from 'tablecrafter/core';         // headless store, no DOM
import { mountTable } from 'tablecrafter/render';         // DOM renderer
import { sortRows } from 'tablecrafter/sorting';
import { parseQuery } from 'tablecrafter/filtering/grammar';
import { toCsv } from 'tablecrafter/export/csv';
import { renderBadge } from 'tablecrafter/cells/badge';    // per-cell, tree-shakeable
```

Available subpaths:

- **Core & render:** `./core`, `./render`, `./render/virtual`, `./render/a11y`
- **Features:** `./sorting`, `./filtering` (+ `/grammar`, `/fuzzy`), `./editing`
  (+ `/history`), `./validation`, `./permissions`, `./i18n`
- **Export:** `./export/csv`, `./export/json`, `./export/print`,
  `./export/xlsx`, `./export/pdf`
- **Cells:** `./cells` (full set) or `./cells/<name>` — `badge`, `progress`,
  `sparkline`, `link`, `star`, `heatmap`, `conditional`, `autoformat`
- **Adapters:** `./adapters/inline`, `./adapters/json`, `./adapters/csv`,
  `./adapters/google-sheets`, `./adapters/xml`, `./adapters/pagination-link`
- **Styles:** `./styles.css`
- **CDN:** `./cdn` — the self-contained IIFE global build

### CDN / no-build usage

```html
<script src="https://unpkg.com/tablecrafter/dist/v3/tablecrafter.global.js"></script>
<script>
  const table = new TableCrafter.default('#el', { data, columns });
  table.render();
</script>
```

### Optional export peers

`xlsx` and `pdf` export are optional peer dependencies, loaded via dynamic
import only when you call them. Install the peer to use them:

```bash
npm install xlsx            # for export/xlsx
npm install jspdf jspdf-autotable   # for export/pdf
```

Without the peer installed, the other export formats work unchanged; only the
missing format throws when invoked.

---

## 3. Breaking change: multi-key sort state (`SortState[]`)

The one contract change that can affect code reading state directly. Per
[RFC-v3 Amendment 1](docs/RFC-v3-amendments.md), `TableState.sort` moved from a
single `SortState | null` to an ordered `SortState[]` so multi-column sort is
expressible through the public API.

**What changed:**

| | v2 | v3 |
|---|---|---|
| No-sort sentinel | `state.sort === null` | `state.sort.length === 0` |
| Single sort | `state.sort` is one `SortState` | `state.sort[0]` is the primary key |
| Multi sort | not expressible via `store.sort()` | `state.sort` is the full priority list |

**`sort()` gains a third argument** (non-breaking addition):

```ts
// Before
sort(column: string, direction?: SortDirection): void;
// After
sort(column: string, direction?: SortDirection, opts?: SortOptions): void;
```

`opts.append === true` pushes/updates a key in the priority list instead of
replacing it. Semantics mirror v2's `sort(field, { append, direction })`:

| call | when state is | result |
|---|---|---|
| `sort('A')` | `[]` | `[{A, asc}]` |
| `sort('A')` | `[{A, asc}]` | `[{A, desc}]` (toggle) |
| `sort('A')` | `[{A,asc},{B,asc}]` | `[{A, asc}]` (reset, no toggle on multi-key) |
| `sort('B', undefined, { append: true })` | `[{A, asc}]` | `[{A,asc},{B,asc}]` |
| `sort('A', undefined, { append: true })` | `[{A,asc},{B,asc}]` | `[{A,desc},{B,asc}]` (toggle in place) |

**The `sort` event** now carries the full `SortState[]`, so a single listener
can re-render every sort indicator in one pass.

**Migration steps:**

1. Replace `if (state.sort !== null)` with `if (state.sort.length > 0)`.
2. Read the active key as `state.sort[0]` instead of `state.sort`.
3. Iterate `state.sort` when rendering sort badges (or call `getSortBadges(state)`
   from the sorting module).
4. `sort` event handlers now receive an array — update the parameter type.

No other v2 contracts changed; everything else is source-compatible through the
batteries wrapper.

---

## Summary

- **Just want it to work?** `npm install tablecrafter@3`, keep your v2 code.
- **Want smaller bundles?** Import from `tablecrafter/core` + the feature
  subpaths you actually use.
- **Read `state.sort` directly?** It's now an array — see §3.
