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
| Virtual scroll | Windowed rendering via `enableVirtualScroll()` -- no pagination required |
| Formula columns | Arithmetic, comparisons, IF, CONCAT, LENGTH, UPPER, LOWER |
| Conditional formatting | Data bars, color scales, icon sets; ARIA labels on visual-only cues |
| Heatmap cells | Inline SVG heatmap from an array-of-numbers (`cellType: 'heatmap'`) |
| Cell renderers | Badge, link, progress bar, sparkline built-in |
| Cell range selection | Click-drag range with TSV clipboard copy |
| Right-click context menu | ARIA-compliant, fully configurable items; keyboard navigation |
| Column management | Programmatic reorder, show/hide, pin left/right |
| RTL support | Locale-driven layout flip (`dir="rtl"` + `tc-rtl` class) |
| i18n | 6 bundled locales: en, es, fr, de, ar, ur; custom number/date formatters |

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
| XLSX / PDF export | Requires optional peer deps -- see [Installation](#installation) |
| State persistence | localStorage / sessionStorage; saves filters, sort, page |
| Plugin system | `use(plugin, opts)` / `unuse(name)` with full lifecycle hooks |
| Events API | `on` / `off` / `once` for 8 named events |

### Platform

| Feature | Details |
|---|---|
| Zero runtime dependencies | Pure vanilla JavaScript |
| ESM + CJS + UMD builds | Works with webpack, Vite, Rollup, or a plain `<script>` tag |
| CDN auto-init | `TableCrafter.bootstrap()` from `data-tc-bootstrap` attributes |
| TypeScript definitions | Full `.d.ts` included (`src/tablecrafter.d.ts`) |
| Framework-agnostic | React, Vue, Svelte, Angular, or plain HTML |
| jsDelivr | `https://cdn.jsdelivr.net/npm/tablecrafter@2/dist/tablecrafter.umd.min.js` |

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

### Optional peer dependencies (XLSX / PDF export)

```bash
npm install xlsx                    # XLSX export
npm install jspdf jspdf-autotable   # PDF export
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
    { field: 'name', label: 'Name', editable: true },
    { field: 'role', label: 'Role', editable: true },
  ],
  editable: true,
  filterable: true,
  pagination: true,
});
table.render();
</script>
```

### CDN auto-init (no JavaScript required)

Any element with a `data-tc-bootstrap` attribute is instantiated automatically when
`TableCrafter.bootstrap()` runs. The configuration comes from the element's
`data-tc-config` JSON attribute:

```html
<div data-tc-bootstrap
     data-tc-config='{"columns":[{"field":"name","label":"Name"}],
                      "data":[{"name":"Alice"},{"name":"Bob"}],
                      "filterable":true}'></div>

<script src="https://cdn.jsdelivr.net/npm/tablecrafter@2/dist/tablecrafter.umd.min.js"></script>
<script>
const tables = TableCrafter.bootstrap();       // Map<HTMLElement, TableCrafter>
// TableCrafter.bootstrap('#my-section');      // scope to a subtree
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
  aggregate: 'sum',     // sum | count | avg | min | max | distinct
  cellType: 'heatmap',  // built-in cell type override
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

## i18n

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

### Custom number and date formatters

Supply `i18n.formats` to override how number and date columns render:

```js
i18n: {
  locale: 'de',
  formats: {
    // Intl.NumberFormat options object, or a function(value, locale) => string
    formatNumber: { style: 'currency', currency: 'EUR' },
    // Function(value, locale) => string
    formatDate: (value, locale) =>
      new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value)),
  },
},
```

### Runtime locale switching

```js
table.setLocale('fr');

// Register or override message keys for any locale
table.addMessages('es', { 'toolbar.search': 'Buscar...' });
```

---

## Plugin system

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

### Lifecycle hooks

Plugins declare hooks inside a `hooks` object. Return `false` from any `before*` hook to
cancel the operation. Available pairs: `beforeRender`/`afterRender`, `beforeSort`/`afterSort`,
`beforeEdit`/`afterEdit` (payloads: `{ rowIndex, field, value }` / `{ rowIndex, field, oldValue, newValue }`),
`beforeLoad`/`afterLoad` (payloads: `{ source }` / `{ data }`), and `destroy`.

```js
const guardPlugin = {
  name: 'guard',
  hooks: {
    beforeEdit: ({ field, value }) => {
      if (field === 'salary' && value < 0) return false; // cancel
    },
    afterEdit: ({ field, oldValue, newValue }) => {
      console.log(`${field}: ${oldValue} -> ${newValue}`);
    },
    destroy: () => console.log('teardown'),
  },
};
```

---

## Events

The events API lets you observe table activity from outside the config callbacks.
`on()` and `once()` both return an unsubscribe function.

```js
// Persistent subscription
const unsub = table.on('cellEdit', ({ row, field, oldValue, newValue }) => {
  console.log(`Row ${row}: ${field} changed from ${oldValue} to ${newValue}`);
});

// One-shot subscription (auto-removes after the first firing)
table.once('rowAdd', ({ row, index }) => {
  console.log('First row added at index', index, ':', row);
});

// Unsubscribe via the returned function
unsub();

// Or by reference
const handler = ({ page }) => console.log('page', page);
table.on('pageChange', handler);
table.off('pageChange', handler);
```

### Event reference

| Event | Payload | Fired by |
|---|---|---|
| `cellEdit` | `{ row, field, oldValue, newValue }` | `saveEdit()` / cell commit |
| `selectionChange` | `{ selectedRows }` | `toggleRowSelection()` |
| `sort` | `{ sortKeys }` | `sort()` / `multiSort()` |
| `filter` | `{ filters }` | `setFilter()` / `clearFilters()` |
| `pageChange` | `{ page }` | `goToPage()` / `nextPage()` / `prevPage()` |
| `rowAdd` | `{ row, index }` | `addRow()` |
| `rowUpdate` | `{ row, index, previous }` | `updateRow()` |
| `rowDelete` | `{ row, index }` | `removeRow()` |

Config callbacks (`onEdit`, `onSort`, etc.) still fire alongside events. A throwing handler is
caught and logged; other handlers in the same event still run. See `examples/events-and-hooks.html`.

---

## TypeScript

The package ships `src/tablecrafter.d.ts`. The `types` field in `package.json` points to it automatically.

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

---

## Export

CSV and JSON export work out of the box:

```js
table.downloadCSV();           // triggers browser download
const json = table.exportToJSON();
```

XLSX and PDF export require optional peer dependencies (install commands above under [Installation](#installation)).

---

## API methods (summary)

| Method | Description |
|---|---|
| `render()` | Render or re-render the table |
| `destroy()` | Tear down and remove listeners |
| `setData(rows)` | Replace all data |
| `getData()` | Current (unfiltered) data |
| `getFilteredData()` | Data after search/filter applied |
| `addRow(row)` | Append a row |
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
| `unuse(name)` | Remove a plugin by name |
| `setLocale(locale)` | Switch i18n locale at runtime |
| `addMessages(locale, messages)` | Register or override i18n strings |
| `on(event, handler)` | Subscribe to a named event; returns unsub function |
| `off(event, handler)` | Unsubscribe a handler |
| `once(event, handler)` | Subscribe for one emission; returns unsub function |
| `enableVirtualScroll(opts?)` | Enable windowed rendering (`rowHeight`, `viewportHeight`, `overscan`) |
| `disableVirtualScroll()` | Disable virtual scroll |
| `isVirtualScrolling()` | Returns `true` when virtual scroll is active |
| `getAggregates()` | Aggregated column values (sum / count / avg / min / max / distinct) |
| `saveState()` | Persist current state |
| `loadState()` | Restore persisted state |
| `snapshotHTML(opts?)` | Deterministic HTML snapshot for testing (`scope: 'table'|'wrapper'`) |
| `TableCrafter.bootstrap(scope?)` | Auto-init from `[data-tc-bootstrap]` elements; returns `Map` |
| `TableCrafter.getBrowserSupport()` | Capability probe returning `{ intl, resizeObserver, requiredFeaturesAvailable, ... }` |
| `TableCrafter.minimumBrowserSupportNotice()` | Human-readable string listing minimum requirements |

---

## Testing

```bash
npm test           # run Jest suite
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
