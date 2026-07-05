# TableCrafter.js Examples

Runnable HTML examples for TableCrafter.js. For the full feature list and current parity status with the TableCrafter WordPress plugin, see [docs/PARITY.md](../docs/PARITY.md).

## Running the examples

Start any static server from the repo root:

```bash
python -m http.server 8000
```

Then open:

- http://localhost:8000/examples/advanced-features.html
- http://localhost:8000/examples/api-integration.html
- http://localhost:8000/examples/validation-example.html
- http://localhost:8000/examples/rich-cell-types-example.html
- http://localhost:8000/examples/enhanced-form-integration-example.html

## Files

| File | Covers |
|---|---|
| `advanced-features.html` | Filtering, sorting, conditional formatting, cell renderers, bulk operations |
| `api-integration.html` | REST API fetch, CRUD write-back, auth headers |
| `validation-example.html` | 15+ validation rules, custom functions, error display |
| `rich-cell-types-example.html` | All 14 editors, custom cell type registry, lookup dropdowns |
| `enhanced-form-integration-example.html` | Add-row modal, state persistence, plugin system |
| `wordpress-integration.js` | Pattern for replacing a WordPress Gravity Tables table |

## Basic usage

```js
const table = new TableCrafter('#my-table', {
  data: myData,
  columns: [
    { field: 'id',    label: 'ID' },
    { field: 'name',  label: 'Name',  editable: true },
    { field: 'email', label: 'Email', editable: true },
  ],
  editable:   true,
  pagination: true,
  filterable: true,
});
table.render();
```

## Advanced configuration

```js
const table = new TableCrafter('#advanced-table', {
  data: '/api/users',

  filters: {
    advanced:    true,
    autoDetect:  true,
    showClearAll: true,
  },

  bulk: {
    enabled:    true,
    operations: ['delete', 'export'],
  },

  responsive: {
    fieldVisibility: {
      mobile: { showFields: ['name', 'status'] },
      tablet: { showFields: ['name', 'email', 'status'] },
    },
  },

  api: {
    baseUrl:        '/api/users',
    authentication: { type: 'bearer', token: 'jwt-token' },
  },

  permissions: {
    enabled: true,
    edit:    ['admin', 'editor'],
    delete:  ['admin'],
  },

  onEdit({ field, value }) {
    console.log(field, 'changed to', value);
  },
});
table.render();
```

## React integration

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

## Vue.js integration

```vue
<template>
  <div ref="el"></div>
</template>

<script>
import TableCrafter from 'tablecrafter';
export default {
  props: ['data'],
  mounted() {
    this.table = new TableCrafter(this.$refs.el, { data: this.data, columns: [] });
    this.table.render();
  },
  beforeUnmount() {
    this.table?.destroy();
  },
};
</script>
```

## CSS custom properties

```css
:root {
  --tc-primary-color: #3498db;
  --tc-border-color:  #e1e5e9;
  --tc-font-family:   'Inter', sans-serif;
  --tc-border-radius: 8px;
}
```

## Using WordPress? 

The TableCrafter WordPress plugin provides server-side data sources, Gravity Forms write-back, and Gutenberg/Elementor blocks. `wordpress-integration.js` shows the browser-side pattern that works alongside it. See [docs/PARITY.md](../docs/PARITY.md) for what is and is not at parity with the plugin.

## License

MIT -- see [LICENSE](../LICENSE).
