/**
 * i18n/index.ts
 *
 * Intl API wrappers for number, date, and currency formatting.
 * RTL detection and locale propagation to sort comparators.
 * Replaces v2's ignored i18n.formats option with real Intl.NumberFormat /
 * Intl.DateTimeFormat / Intl.Collator usage.
 * Phase 0: typed stub.
 */

/** Resolved i18n configuration passed to formatter functions. */
export interface I18nConfig {
  locale: string;
  /** Whether the locale is right-to-left. */
  rtl: boolean;
  numberFormat?: Intl.NumberFormatOptions | undefined;
  dateFormat?: Intl.DateTimeFormatOptions | undefined;
  currencyFormat?: Intl.NumberFormatOptions | undefined;
}

/**
 * Resolve an i18n config from a locale string.
 * Detects RTL via Intl.Locale and applies sensible defaults.
 */
export function resolveI18n(_locale?: string): I18nConfig {
  throw new Error('resolveI18n: not implemented -- Phase 2');
}

/**
 * Format a number value using Intl.NumberFormat.
 */
export function formatNumber(
  _value: number,
  _config: I18nConfig,
  _options?: Intl.NumberFormatOptions
): string {
  throw new Error('formatNumber: not implemented -- Phase 2');
}

/**
 * Format a date/time value using Intl.DateTimeFormat.
 */
export function formatDate(
  _value: Date | string | number,
  _config: I18nConfig,
  _options?: Intl.DateTimeFormatOptions
): string {
  throw new Error('formatDate: not implemented -- Phase 2');
}

/**
 * Format a currency value using Intl.NumberFormat in 'currency' style.
 */
export function formatCurrency(
  _value: number,
  _currency: string,
  _config: I18nConfig
): string {
  throw new Error('formatCurrency: not implemented -- Phase 2');
}

/**
 * Return an Intl.Collator instance tuned for locale-aware string sorting.
 */
export function getCollator(_config: I18nConfig): Intl.Collator {
  throw new Error('getCollator: not implemented -- Phase 2');
}
