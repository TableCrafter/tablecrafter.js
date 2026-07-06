/**
 * export/filename.ts
 *
 * Pure filename token resolver.
 * Supported tokens: {table}, {date}
 *
 * No DOM access — safe to import in headless contexts.
 */

/**
 * Resolve filename template tokens.
 *
 * Tokens (case-insensitive):
 *   {table} — replaced with tableName (defaults to "table" if omitted)
 *   {date}  — replaced with the current date as YYYY-MM-DD
 *
 * @example
 *   resolveFilename('export-{table}-{date}.csv', 'employees')
 *   // → 'export-employees-2026-07-06.csv'
 */
export function resolveFilename(template: string, tableName?: string): string {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const date = `${yyyy}-${mm}-${dd}`;

  return template
    .replace(/\{table\}/gi, tableName ?? 'table')
    .replace(/\{date\}/gi, date);
}
