# Server-proxy recipes

TableCrafter.js runs in the browser. Data sources that require a **secret
credential** — an Airtable personal access token, a Notion integration token, a
database connection string — must never be reached directly from the browser,
because anything the browser sends is visible to the user and to anyone
inspecting network traffic.

The pattern is a **thin server proxy**: a small endpoint on your own server
holds the credential in an environment variable, queries the upstream API or
database, and returns plain JSON rows. TableCrafter.js then points its `data`
URL at *your* endpoint, never at the upstream:

```js
const table = new TableCrafter('#grid', {
  data: '/api/records',   // your proxy — no credential in the browser
  columns: [/* ... */],
});
table.render();
```

The examples below use Node.js + Express, but the pattern is
language-agnostic: any server that can read an env var, make an outbound
request, and return JSON works identically.

> The TableCrafter **WordPress plugin** is the reference implementation of this
> pattern — its server-side Airtable, Notion, and external-DB sync engines hold
> credentials in WordPress options and expose sanitized rows to the front end.
> These recipes reproduce that boundary for a standalone JS deployment.

---

## Recipe 1 — Airtable

Airtable's REST API (v0) is read with a personal access token (PAT) in an
`Authorization: Bearer` header.

**Server endpoint** (`GET /api/airtable`):

```js
import express from 'express';
const app = express();

// Credential lives ONLY on the server, in an env var.
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_TABLE; // e.g. "Projects"

app.get('/api/airtable', async (req, res) => {
  const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}`);

  // Only forward a known, validated subset of query params upstream.
  const pageSize = Math.min(Number(req.query.pageSize) || 100, 100);
  url.searchParams.set('pageSize', String(pageSize));

  const upstream = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
  });
  if (!upstream.ok) {
    return res.status(502).json({ error: 'Upstream error' });
  }
  const body = await upstream.json();

  // Flatten Airtable's { records: [{ id, fields }] } into plain rows.
  const rows = body.records.map((r) => ({ id: r.id, ...r.fields }));
  res.json(rows);
});
```

**TableCrafter.js config:**

```js
const table = new TableCrafter('#grid', {
  data: '/api/airtable',
  columns: [
    { field: 'Name', label: 'Name' },
    { field: 'Status', label: 'Status' },
  ],
});
table.render();
```

### Security

- **Never** send `AIRTABLE_TOKEN` to the browser. It stays in `process.env` on
  the server and is only ever used in the outbound `Authorization` header.
- Validate and clamp every request parameter (`pageSize` above is clamped to
  Airtable's 100 maximum) before forwarding. Do not pass raw
  `req.query.filterByFormula` upstream — build formulas server-side from an
  allow-list, or a malicious user can exfiltrate rows you did not intend to
  expose.

---

## Recipe 2 — Notion

Notion databases are queried with a `POST` to
`/v1/databases/{id}/query`, authenticated with an integration token and a
pinned `Notion-Version` header.

**Server endpoint** (`GET /api/notion`):

```js
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DB = process.env.NOTION_DATABASE_ID;

app.get('/api/notion', async (req, res) => {
  const upstream = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28', // pin the API version
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ page_size: 100 }),
  });
  if (!upstream.ok) {
    return res.status(502).json({ error: 'Upstream error' });
  }
  const body = await upstream.json();

  // Notion property shapes are nested; flatten to scalars for the table.
  const rows = body.results.map((page) => {
    const row = { id: page.id };
    for (const [key, prop] of Object.entries(page.properties)) {
      row[key] = flattenNotionProperty(prop);
    }
    return row;
  });
  res.json(rows);
});

function flattenNotionProperty(prop) {
  switch (prop.type) {
    case 'title':
    case 'rich_text':
      return prop[prop.type].map((t) => t.plain_text).join('');
    case 'number':
      return prop.number;
    case 'checkbox':
      return prop.checkbox;
    case 'select':
      return prop.select?.name ?? '';
    case 'multi_select':
      return prop.multi_select.map((s) => s.name).join(', ');
    case 'date':
      return prop.date?.start ?? '';
    default:
      return '';
  }
}
```

**TableCrafter.js config:**

```js
const table = new TableCrafter('#grid', {
  data: '/api/notion',
  columns: [
    { field: 'Name', label: 'Name' },
    { field: 'Priority', label: 'Priority' },
  ],
});
table.render();
```

### Security

- **Never** expose `NOTION_TOKEN` to the browser — it grants access to every
  page the integration is shared with.
- Keep the `Notion-Version` header pinned server-side so a browser cannot
  request an unexpected API version.
- If you accept filter parameters, translate them into Notion's `filter` object
  server-side from an allow-list of known properties; do not forward a
  client-supplied `filter` body verbatim.

---

## Recipe 3 — SQL (generic)

A relational database is queried with a **parameterized** `SELECT`. The
connection string is a secret and the query must never interpolate raw client
input.

**Server endpoint** (`GET /api/records`, illustrated with `pg`):

```js
import { Pool } from 'pg';

// Connection string lives ONLY on the server.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Allow-list the columns a client is permitted to filter on.
const FILTERABLE = new Set(['status', 'owner', 'region']);

app.get('/api/records', async (req, res) => {
  const where = [];
  const params = [];

  // Build the WHERE clause from the library's ?field=value filter params,
  // using ONLY allow-listed columns and ONLY parameter placeholders.
  for (const [key, value] of Object.entries(req.query)) {
    if (FILTERABLE.has(key)) {
      params.push(value);
      where.push(`${key} = $${params.length}`);
    }
  }

  const sql =
    'SELECT id, name, status, owner, region FROM projects' +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ' ORDER BY id LIMIT 500';

  const result = await pool.query(sql, params);
  res.json(result.rows);
});
```

**TableCrafter.js config:**

```js
const table = new TableCrafter('#grid', {
  data: '/api/records',
  columns: [
    { field: 'name', label: 'Name' },
    { field: 'status', label: 'Status' },
    { field: 'owner', label: 'Owner' },
  ],
});
table.render();
```

### Security

- **Never** put `DATABASE_URL` (or any connection string) in browser code.
- **Always** use parameter placeholders (`$1`, `?`, named params) — never string
  concatenation of client input into SQL. The `FILTERABLE` allow-list above
  ensures a client can only filter on columns you approved, and the column name
  is never taken from user input (only its *value* is, via a placeholder).
- Cap the result set (`LIMIT 500` above) so a single request cannot pull an
  unbounded number of rows.

---

## The rule

If a data source needs a token, a key, or a connection string, it needs a
server proxy. The credential belongs in `process.env` on your server; the
browser only ever talks to your endpoint, and your endpoint validates and
sanitizes every parameter before forwarding it upstream.
