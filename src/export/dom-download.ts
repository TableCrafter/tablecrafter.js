/**
 * export/dom-download.ts
 *
 * The ONLY DOM-touching file in the export module.
 *
 * All other export files (csv.ts, json.ts, print.ts, xlsx.ts, pdf.ts,
 * clipboard.ts, filename.ts) are headless — they never access document/window
 * and are safe to import in SSR or Node environments.
 *
 * This helper is intentionally excluded from the headless guarantee.
 * The DOM renderer or the batteries wrapper calls into download* helpers which
 * in turn delegate here.  Pure builder functions (toCsv, toJson, toTsv,
 * toPrintHtml) never import this file.
 */

/**
 * Trigger a browser file-download of the given Blob.
 *
 * Creates a temporary <a> element, clicks it, and revokes the object URL.
 * A no-op when document is unavailable (SSR guard).
 */
export function triggerDownload(blob: Blob, filename: string): void {
  // SSR / non-browser guard
  if (typeof document === 'undefined') return;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
