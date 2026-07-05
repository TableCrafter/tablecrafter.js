# TableCrafter.js

**The zero-dependency JavaScript data table that turns any array, API, or CSV into an editable, filterable, mobile-ready table.**

[![npm version](https://img.shields.io/npm/v/tablecrafter)](https://www.npmjs.com/package/tablecrafter)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![~27 KB min+gz](https://img.shields.io/badge/size-~27%20KB%20min%2Bgz-brightgreen)](#installation)

```js
import TableCrafter from 'tablecrafter';

const table = new TableCrafter('#my-table', {
  data: '/api/employees',
  columns: [{ field: 'name', label: 'Name', editable: true }],
  editable: true,
});
table.render();
```

---

## Why TableCrafter.js

- **No build step required.** Drop the UMD script on any page and you are done. No bundler, no framework, no fuss.
- **Spreadsheet-grade editing in the browser.** 14 built-in cell editors, 15+ validation rules, lookup dropdowns, formula columns, and a custom cell-type registry -- all without a server round-trip per keypress.
- **Mobile cards, not squished columns.** The responsive card layout collapses rows into readable cards at configurable breakpoints instead of making users scroll sideways.
- **Your data stays yours.** No SaaS, no telemetry, no external requests unless you point it at your own API. MIT licensed.

---

## Feature grid

### Display

| Feature | Details |
|---|---|
| Multi-column sort | Unlimited sort keys, shift-click, badges, custom comparators |
| Per-column filters | Text, multiselect, date range, number range; type auto-detection |
| Advanced search grammar | AND / OR / negation / `field:value` / regex / comparison operators |
| Mobile card view | Responsive breakpoints, expandable sections, field-level visibility |
| Formula columns | Arithmetic and function library evaluated per row |
| Conditional formatting | Data bars, color scales, icon sets |
| Cell renderers | Badge, link, progress bar, sparkline built-in |
| Cell range selection | Click-drag range with TSV clipboard copy |
| Right-click context menu | ARIA-compliant, fully configurable items |
| Column management | Programmatic reorder, show/hide, pin left/right |
| RTL support | Locale-driven layout flip |
| i18n | 6 bundled locales: en, es, fr, de, ar, ur |

### Editing

| Feature | Details |
|---|---|
| 14 inline cell editors | text, textarea, number, email, date, datetime, select, multiselect, checkbox, radio, file, url, color, range |
| Custom cell type registry | `registerCellType()` for any editor |
| 15+ validation rules | required, minLength, maxLength, min, max, pattern, email, url, phone, date bounds, oneOf, notOneOf, unique, custom function |
| Add row modal | Built-in creation form with full validation |
| Bulk operations | Multi-row select, delete, export, custom actions |
| Role-based permissions | Per-action (view/edit/delete/create), row-level `ownOnly` ownership |

### Data

| Feature | Details |
|---|---|
| Inline data | Plain JavaScript array |
| REST API | Fetch from any URL; custom auth headers; `root` path; CRUD write-back |
| CSV export | RFC-4180, filtered, injection-safe |
| JSON export | Serialized current dataset |
| XLSX / PDF export | Requires optional peer deps -- see [#325](https://github.com/TableCrafter/tablecrafter.js/issues/325) |
| State persistence | localStorage / sessionStorage; saves filters, sort, page |
| Plugin system | `use(plugin, opts)` / `unuse(name)` extension points |

### Platform

| Feature | Details |
|---|---|
| Zero runtime dependencies | Pure vanilla JavaScript |
| ESM + CJS + UMD builds | Works with webpack, Vite, Rollup, or a plain `<script>` tag |
| TypeScript definitions | Full `.d.ts` included (`src/tablecrafter.d.ts`) |
| Framework-agnostic | React, Vue, Svelte, Angular, or plain HTML |
| 48-file Jest suite | 808 passing tests |

---

## Installation

### CDN (no build step)

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tablecrafter@2/dist/tablecrafter.css">
<script src="https://cdn.jsdelivr.net/npm/tablecrafter@2/dist/tablecrafter.umd.min.js"></script>
```

The global is `TableCrafter`.

### npm

```bash
npm install tablecrafter
```

```js
import TableCrafter from 'tablecrafter';
import 'tablecrafter/dist/tablecrafter.css';
```

---

## Quick start

```html
<div id="my-table"></div>

<script src="https://cdn.jsdelivr.net/npm/tablecrafter@2/dist/tablecrafter.umd.min.js"></script>
<script>
const table = new TableCrafter('#my-table', {
  data: [
    { id: 1, name: 'Alice', role: 'Engineer' },
    { id: 2, name: 'Bob',   role: 'Designer' },
  ],
  columns: [
    { field: 'id',   label: 'ID' },
    { field: 'name', label: 'Name',       editable: true },
    { field: 'role', label: 'Role',       editable: true },
  ],
  editable: true,
  filterable: true,
  pagination: true,
});
table.render();
</script>
```

---

## Live examples

The `examples/` directory contains runnable HTML files. Start any static server from the repo root:

```bash
python -m http.server 8000
# then open http://localhost:8000/examples/advanced-features.html
```

---

## WordPress?

TableCrafter.js shares feature DNA with the **TableCrafter WordPress plugin**. If you need server-side data sources, Gravity Forms write-back, Gutenberg blocks, or WooCommerce integration, the plugin handles those. For the current gap status between the two, see [docs/PARITY.md](docs/PARITY.md).

Visit [tablecrafter.com](https://tablecrafter.com) for the plugin.

---

## Configuration reference

Constructor: `new TableCrafter(container, config)` where `container` is a CSS selector string or `HTMLElement`.

### Core options

| Key | Type | Default | Description |
|---|---|---|---|
| `data` | `array \| string` | `[]` | Row data or URL to fetch |
| `columns` | `array` | `[]` | Column definitions (required) |
| `editable` | `boolean` | `false` | Enable inline editing globally |
| `sortable` | `boolean` | `true` | Enable column sorting |
| `filterable` | `boolean` | `true` | Enable per-column filters |
| `globalSearch` | `boolean` | `true` | Enable the search grammar bar |
| `pagination` | `boolean` | `false` | Enable pagination |
| `pageSize` | `number` | `25` | Rows per page |
| `exportable` | `boolean` | `false` | Show CSV export button |
| `exportFilename` | `string` | `'table-export.csv'` | Default download filename |

### Column definition

```js
{
  field: 'email',       // data key (required)
  label: 'Email',       // header text
  type: 'email',        // cell renderer: text|badge|link|progress|sparkline|...
  editable: true,       // enable this column for editing
  sortable: true,
  filterable: true,
  formula: 'price * qty', // computed column expression
  lookup: {
    url: '/api/users',
    valueField: 'id',
    labelField: 'name',
  },
}
```

---

## Editing and validation example

```js
const table = new TableCrafter('#table', {
  data: rows,
  columns: [
    { field: 'email', label: 'Email', editable: true },
    { field: 'age',   label: 'Age',   editable: true },
  ],
  validation: {
    rules: {
      email: [{ type: 'required' }, { type: 'email' }],
      age:   [{ type: 'min', value: 18 }, { type: 'max', value: 120 }],
    },
  },
  onEdit({ row, field, value }) {
    console.log(`${field} changed to`, value);
  },
});
table.render();
```

---

## Permissions example

```js
const table = new TableCrafter('#table', {
  data: rows,
  columns,
  permissions: {
    enabled: true,
    edit:   ['admin', 'manager'],
    delete: ['admin'],
    ownOnly: true,   // users see only rows they own
  },
});

table.setCurrentUser({ id: 42, roles: ['manager'], username: 'alice' });
table.render();
```

---

## i18n example

```js
const table = new TableCrafter('#table', {
  data: rows,
  columns,
  i18n: {
    locale: 'ar',           // Arabic -- triggers RTL layout automatically
    fallbackLocale: 'en',
    messages: {
      ar: { 'search.placeholder': 'ابحث...' },
    },
  },
});
```

Six locales are bundled: `en`, `es`, `fr`, `de`, `ar`, `ur`. RTL is applied automatically for `ar` and `ur`.

---

## Plugin system example

```js
const myPlugin = {
  name: 'my-plugin',
  install(table, opts) {
    // extend or monkey-patch `table` here
    console.log('installed with', opts);
  },
};

const table = new TableCrafter('#table', {
  data: rows,
  columns,
  plugins: [[myPlugin, { debug: true }]],
});
```

---

## TypeScript

The package ships `src/tablecrafter.d.ts` with full generics. The `types` field in `package.json` points to it automatically, so no extra configuration is needed in most projects.

```ts
import TableCrafter, { TableCrafterConfig, TableCrafterColumn } from 'tablecrafter';

const columns: TableCrafterColumn[] = [
  { field: 'id', label: 'ID' },
  { field: 'name', label: 'Name', editable: true },
];

const table = new TableCrafter('#table', { data: [], columns });
table.render();
```

---

## Framework integration

### React

```jsx
import { useEffect, useRef } from 'react';
import TableCrafter from 'tablecrafter';

export function DataTable({ data, onEdit }) {
  const ref = useRef(null);
  useEffect(() => {
    const table = new TableCrafter(ref.current, { data, onEdit, columns: [] });
    table.render();
    return () => table.destroy();
  }, [data]);
  return <div ref={ref} />;
}
```

### Vue 3

```js
import { onMounted, onBeforeUnmount, ref } from 'vue';
import TableCrafter from 'tablecrafter';

const el = ref(null);
let table;
onMounted(() => {
  table = new TableCrafter(el.value, { data: props.rows, columns: [] });
  table.render();
});
onBeforeUnmount(() => table?.destroy());
```

### Svelte

```svelte
<script>
import TableCrafter from 'tablecrafter';
import { onMount, onDestroy } from 'svelte';
let el, table;
onMount(() => { table = new TableCrafter(el, { data, columns }); table.render(); });
onDestroy(() => table?.destroy());
</script>
<div bind:this={el}></div>
```

---

## Export

CSV and JSON export work out of the box:

```js
table.downloadCSV();           // triggers browser download
const json = table.exportToJSON();
```

XLSX and PDF export require optional peer dependencies. See [issue #325](https://github.com/TableCrafter/tablecrafter.js/issues/325) for status and installation instructions.

---

## API methods (summary)

| Method | Description |
|---|---|
| `render()` | Render or re-render the table |
| `destroy()` | Tear down and remove listeners |
| `setData(rows)` | Replace all data |
| `getData()` | Current (unfiltered) data |
| `getFilteredData()` | Data after search/filter applied |
| `addRow(row)` | Append a row (fires `onCreate`) |
| `updateRow(i, updates)` | Patch a row by index |
| `removeRow(i)` | Delete a row by index |
| `setFilter(field, value)` | Set a column filter |
| `clearFilters()` | Reset all filters |
| `sort(field, opts?)` | Sort by field |
| `multiSort(keys)` | Sort by multiple fields |
| `goToPage(n)` | Jump to page |
| `exportToCSV()` | Return CSV string |
| `exportToJSON()` | Return JSON string |
| `downloadCSV()` | Trigger browser CSV download |
| `setCurrentUser(user)` | Set user context for permissions |
| `hasPermission(action, row?)` | Check permission |
| `use(plugin, opts?)` | Register a plugin |
| `setLocale(locale)` | Switch i18n locale |
| `saveState()` | Persist current state |
| `loadState()` | Restore persisted state |

Callbacks configured in the constructor (`onEdit`, `onSort`, `onFilter`, `onDelete`, `onCreate`, `onPageChange`, `onRowSelect`, `onExport`) fire when the corresponding events occur.

---

## Testing

```bash
npm test           # run Jest suite (808 tests)
npm run test:watch
npm run test:coverage
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/description`
3. Add tests for new functionality
4. Ensure all tests pass: `npm test`
5. Open a pull request against `main`

**Roadmap:** parity gaps and planned work are tracked in [Epic #323](https://github.com/TableCrafter/tablecrafter.js/issues/323) and the [parity matrix](docs/PARITY.md).

---

## License

MIT -- see [LICENSE](LICENSE).
