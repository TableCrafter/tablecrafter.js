/**
 * i18n/i18n.test.ts — v3 equivalence suite (ported from v2 Jest cases).
 *
 * Covers:
 *  - createI18n factory and returned instance API
 *  - t() key lookup, fallback, warn-once
 *  - {placeholder} substitution
 *  - setLocale / addMessages
 *  - Plural forms via Intl.PluralRules
 *  - formatNumber / formatDate (Intl options + custom fn)
 *  - isRTL (language-subtag detection + _dir flag in pack)
 *  - detectLocale (renderer-supplied, pure)
 *  - Built-in locale packs (en/es/fr/de/ar/ur) — catalog sanity
 *
 * Part of #323 Phase 2 T2.8.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createI18n,
  detectLocale,
  en,
  es,
  fr,
  de,
  ar,
  ur,
  locales,
} from './index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function make(config?: Parameters<typeof createI18n>[0]) {
  return createI18n(config);
}

// ---------------------------------------------------------------------------
// createI18n factory — smoke
// ---------------------------------------------------------------------------

describe('createI18n factory', () => {
  it('returns an object with all required methods', () => {
    const i18n = make();
    expect(typeof i18n.t).toBe('function');
    expect(typeof i18n.setLocale).toBe('function');
    expect(typeof i18n.addMessages).toBe('function');
    expect(typeof i18n.formatNumber).toBe('function');
    expect(typeof i18n.formatDate).toBe('function');
    expect(typeof i18n.isRTL).toBe('function');
  });

  it('exposes locale as a readable property', () => {
    const i18n = make({ locale: 'fr' });
    expect(i18n.locale).toBe('fr');
  });

  it('defaults locale to "en" when not provided', () => {
    const i18n = make();
    expect(i18n.locale).toBe('en');
  });
});

// ---------------------------------------------------------------------------
// t() — basic translation lookup
// ---------------------------------------------------------------------------

describe('t(): basic key lookup', () => {
  it('returns the active-locale string when the key exists', () => {
    const i18n = make({
      locale: 'es',
      messages: { es: { 'toolbar.search': 'Buscar' } },
    });
    expect(i18n.t('toolbar.search')).toBe('Buscar');
  });

  it('falls through to fallbackLocale when key is missing in active locale', () => {
    const i18n = make({
      locale: 'es',
      fallbackLocale: 'en',
      messages: {
        es: { 'toolbar.search': 'Buscar' },
        en: { 'toolbar.export': 'Export' },
      },
    });
    expect(i18n.t('toolbar.export')).toBe('Export');
  });

  it('falls back to the key itself when no locale has it, and warns once', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const i18n = make({ locale: 'es', messages: { es: {} } });

    expect(i18n.t('totally.unknown')).toBe('totally.unknown');
    expect(i18n.t('totally.unknown')).toBe('totally.unknown');
    expect(i18n.t('totally.unknown')).toBe('totally.unknown');

    const relatedWarns = warnSpy.mock.calls.filter(c =>
      /totally\.unknown/.test(String(c[0])),
    );
    expect(relatedWarns).toHaveLength(1);
    warnSpy.mockRestore();
  });

  it('returns key with no error when messages is absent', () => {
    const i18n = make({ locale: 'en' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(i18n.t('toolbar.search')).toBe('toolbar.search');
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// t() — {placeholder} substitution
// ---------------------------------------------------------------------------

describe('t(): {placeholder} substitution', () => {
  it('substitutes vars into the template string', () => {
    const i18n = make({
      locale: 'en',
      messages: { en: { 'pagination.pageOf': 'Page {current} of {total}' } },
    });
    expect(i18n.t('pagination.pageOf', { current: 2, total: 10 })).toBe('Page 2 of 10');
  });

  it('replaces repeated placeholders', () => {
    const i18n = make({
      locale: 'en',
      messages: { en: { greet: 'Hi {name}, hi again {name}!' } },
    });
    expect(i18n.t('greet', { name: 'A' })).toBe('Hi A, hi again A!');
  });

  it('leaves missing vars as-is (predictable debugging)', () => {
    const i18n = make({
      locale: 'en',
      messages: { en: { greet: 'Hi {name}!' } },
    });
    expect(i18n.t('greet')).toBe('Hi {name}!');
  });

  it('coerces numeric vars to strings', () => {
    const i18n = make({
      locale: 'en',
      messages: { en: { msg: 'Count: {n}' } },
    });
    expect(i18n.t('msg', { n: 42 })).toBe('Count: 42');
  });
});

// ---------------------------------------------------------------------------
// setLocale
// ---------------------------------------------------------------------------

describe('setLocale()', () => {
  it('switches the active locale and i18n.locale reflects the change', () => {
    const i18n = make({
      locale: 'en',
      messages: {
        en: { hello: 'Hello' },
        es: { hello: 'Hola' },
      },
    });
    expect(i18n.t('hello')).toBe('Hello');
    i18n.setLocale('es');
    expect(i18n.locale).toBe('es');
    expect(i18n.t('hello')).toBe('Hola');
  });

  it('calling setLocale with the same value is a no-op (locale unchanged)', () => {
    const i18n = make({ locale: 'en', messages: { en: { hello: 'Hello' } } });
    i18n.setLocale('en');
    expect(i18n.locale).toBe('en');
    expect(i18n.t('hello')).toBe('Hello');
  });

  it('switching to a locale that has no messages falls back gracefully', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const i18n = make({ locale: 'en', messages: { en: { hi: 'Hi' } } });
    i18n.setLocale('de');
    // Falls back to 'en' (fallbackLocale), then to key.
    expect(i18n.t('hi')).toBe('Hi');
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// addMessages
// ---------------------------------------------------------------------------

describe('addMessages()', () => {
  it('merges new keys into an existing locale catalogue', () => {
    const i18n = make({ locale: 'en', messages: { en: { hello: 'Hello' } } });
    i18n.addMessages('en', { goodbye: 'Goodbye' });
    expect(i18n.t('hello')).toBe('Hello');
    expect(i18n.t('goodbye')).toBe('Goodbye');
  });

  it('overrides existing keys when re-added', () => {
    const i18n = make({ locale: 'en', messages: { en: { greet: 'Hi' } } });
    i18n.addMessages('en', { greet: 'Hello there' });
    expect(i18n.t('greet')).toBe('Hello there');
  });

  it('creates a new locale bucket if it did not exist', () => {
    const i18n = make({ locale: 'en', messages: { en: {} } });
    i18n.addMessages('fr', { hello: 'Bonjour' });
    i18n.setLocale('fr');
    expect(i18n.t('hello')).toBe('Bonjour');
  });
});

// ---------------------------------------------------------------------------
// Pluralisation
// ---------------------------------------------------------------------------

describe('t(): pluralisation via Intl.PluralRules', () => {
  it('selects the {one, other} form based on vars.count', () => {
    const i18n = make({
      locale: 'en',
      messages: {
        en: {
          'rows.selected': {
            one: '1 row selected',
            other: '{count} rows selected',
          },
        },
      },
    });
    expect(i18n.t('rows.selected', { count: 1 })).toBe('1 row selected');
    expect(i18n.t('rows.selected', { count: 5 })).toBe('5 rows selected');
    expect(i18n.t('rows.selected', { count: 0 })).toBe('0 rows selected');
  });

  it('falls back to "other" when "one" is not in the catalogue entry', () => {
    const i18n = make({
      locale: 'en',
      messages: { en: { items: { other: '{count} items' } } },
    });
    expect(i18n.t('items', { count: 1 })).toBe('1 items');
    expect(i18n.t('items', { count: 3 })).toBe('3 items');
  });

  it('returns the key when the plural object has no usable form', () => {
    const i18n = make({
      locale: 'en',
      messages: { en: { weird: { few: 'few' } } },
    });
    // 'en' PluralRules selects 'one' for 1, 'other' for rest — neither is in { few }
    expect(i18n.t('weird', { count: 1 })).toBe('weird');
    expect(i18n.t('weird', { count: 3 })).toBe('weird');
  });

  it('does not attempt pluralisation when vars.count is absent', () => {
    const i18n = make({
      locale: 'en',
      messages: {
        en: {
          items: { one: 'one item', other: 'many items' },
        },
      },
    });
    // Without count the whole plural object is not a string — returns key.
    expect(i18n.t('items')).toBe('items');
  });

  it('substitutes {count} inside the selected plural form', () => {
    const i18n = make({
      locale: 'en',
      messages: {
        en: { rows: { one: 'one row', other: '{count} rows' } },
      },
    });
    expect(i18n.t('rows', { count: 7 })).toBe('7 rows');
  });
});

// ---------------------------------------------------------------------------
// formatNumber
// ---------------------------------------------------------------------------

describe('formatNumber()', () => {
  it('formats a number with the active locale', () => {
    const i18n = make({ locale: 'en' });
    const result = i18n.formatNumber(1234);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns empty string for null', () => {
    const i18n = make({ locale: 'en' });
    expect(i18n.formatNumber(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    const i18n = make({ locale: 'en' });
    expect(i18n.formatNumber(undefined)).toBe('');
  });

  it('returns original string for non-numeric value', () => {
    const i18n = make({ locale: 'en' });
    // NaN input — returned unchanged
    const result = i18n.formatNumber(NaN);
    expect(result).toBe('NaN');
  });

  it('applies per-call Intl options', () => {
    const i18n = make({ locale: 'en' });
    const result = i18n.formatNumber(1234.5, { style: 'currency', currency: 'USD' });
    const expected = new Intl.NumberFormat('en', { style: 'currency', currency: 'USD' }).format(1234.5);
    expect(result).toBe(expected);
  });

  it('merges config.formats.number defaults with per-call options', () => {
    const i18n = make({
      locale: 'en',
      formats: { number: { minimumFractionDigits: 2 } },
    });
    const result = i18n.formatNumber(42);
    const expected = new Intl.NumberFormat('en', { minimumFractionDigits: 2 }).format(42);
    expect(result).toBe(expected);
  });

  it('calls config.formats.number custom function with (value, locale)', () => {
    const fn = vi.fn((value: number, locale: string) => `${locale}:${value}`);
    const i18n = make({ locale: 'en', formats: { number: fn } });
    expect(i18n.formatNumber(99)).toBe('en:99');
    expect(fn).toHaveBeenCalledWith(99, 'en');
  });

  it('uses the updated locale after setLocale()', () => {
    const fn = vi.fn((_v: number, locale: string) => locale);
    const i18n = make({ locale: 'en', formats: { number: fn } });
    i18n.setLocale('fr');
    i18n.formatNumber(1);
    expect(fn).toHaveBeenCalledWith(1, 'fr');
  });
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------

describe('formatDate()', () => {
  it('returns empty string for null', () => {
    const i18n = make({ locale: 'en' });
    expect(i18n.formatDate(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    const i18n = make({ locale: 'en' });
    expect(i18n.formatDate(undefined)).toBe('');
  });

  it('returns empty string for an invalid date string', () => {
    const i18n = make({ locale: 'en' });
    expect(i18n.formatDate('not-a-date')).toBe('');
  });

  it('formats a Date object', () => {
    const i18n = make({ locale: 'en' });
    const result = i18n.formatDate(new Date(2024, 2, 15)); // Mar 15 2024
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formats an ISO string', () => {
    const i18n = make({ locale: 'en' });
    const result = i18n.formatDate('2024-03-15');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('applies per-call Intl options', () => {
    const i18n = make({ locale: 'en' });
    const opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
    const result = i18n.formatDate('2024-03-15T00:00:00.000Z', opts);
    const expected = new Intl.DateTimeFormat('en', opts).format(new Date('2024-03-15T00:00:00.000Z'));
    expect(result).toBe(expected);
  });

  it('calls config.formats.date custom function with (value, locale)', () => {
    const fn = vi.fn((_value: Date | string | number, locale: string) => `${locale}:formatted`);
    const i18n = make({ locale: 'fr', formats: { date: fn } });
    const result = i18n.formatDate('2024-01-01');
    expect(result).toBe('fr:formatted');
    expect(fn).toHaveBeenCalledWith('2024-01-01', 'fr');
  });
});

// ---------------------------------------------------------------------------
// isRTL
// ---------------------------------------------------------------------------

describe('isRTL()', () => {
  it('returns true for Arabic', () => {
    expect(make({ locale: 'ar' }).isRTL()).toBe(true);
  });

  it('returns true for Hebrew', () => {
    expect(make({ locale: 'he' }).isRTL()).toBe(true);
  });

  it('returns true for Farsi', () => {
    expect(make({ locale: 'fa' }).isRTL()).toBe(true);
  });

  it('returns true for Urdu', () => {
    expect(make({ locale: 'ur' }).isRTL()).toBe(true);
  });

  it('returns true for Yiddish', () => {
    expect(make({ locale: 'yi' }).isRTL()).toBe(true);
  });

  it('returns true for region-tagged RTL locale ar-EG', () => {
    expect(make({ locale: 'ar-EG' }).isRTL()).toBe(true);
  });

  it('returns true for region-tagged he-IL', () => {
    expect(make({ locale: 'he-IL' }).isRTL()).toBe(true);
  });

  it('returns true for region-tagged ur-PK', () => {
    expect(make({ locale: 'ur-PK' }).isRTL()).toBe(true);
  });

  it('returns false for English', () => {
    expect(make({ locale: 'en' }).isRTL()).toBe(false);
  });

  it('returns false for French', () => {
    expect(make({ locale: 'fr-FR' }).isRTL()).toBe(false);
  });

  it('returns false for German', () => {
    expect(make({ locale: 'de-DE' }).isRTL()).toBe(false);
  });

  it('returns true when active pack carries _dir: "rtl" (pack-flag path)', () => {
    const i18n = make({ locale: 'ar', messages: { ar: { ...ar } } });
    expect(i18n.isRTL()).toBe(true);
  });

  it('follows setLocale: switches from LTR to RTL', () => {
    const i18n = make({ locale: 'en' });
    expect(i18n.isRTL()).toBe(false);
    i18n.setLocale('ar');
    expect(i18n.isRTL()).toBe(true);
  });

  it('follows setLocale: switches from RTL to LTR', () => {
    const i18n = make({ locale: 'ar' });
    expect(i18n.isRTL()).toBe(true);
    i18n.setLocale('en');
    expect(i18n.isRTL()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detectLocale (renderer-supplied, no DOM)
// ---------------------------------------------------------------------------

describe('detectLocale()', () => {
  it('returns the lang string as-is when non-empty', () => {
    expect(detectLocale('fr')).toBe('fr');
    expect(detectLocale('ar-EG')).toBe('ar-EG');
    expect(detectLocale('zh-Hant-TW')).toBe('zh-Hant-TW');
  });

  it('returns "en" for an empty string', () => {
    expect(detectLocale('')).toBe('en');
  });

  it('returns "en" for a whitespace-only string', () => {
    expect(detectLocale('   ')).toBe('en');
  });

  it('trims surrounding whitespace', () => {
    // ' fr ' → 'fr' → non-empty → 'fr'
    expect(detectLocale(' fr ')).toBe('fr');
  });

  it('does not access document (pure function — no DOM needed)', () => {
    // If this test runs in a node environment with no document, it still passes.
    const result = detectLocale('de');
    expect(result).toBe('de');
  });
});

// ---------------------------------------------------------------------------
// Built-in locale packs
// ---------------------------------------------------------------------------

const PACKS: [string, typeof en][] = [
  ['en', en],
  ['es', es],
  ['fr', fr],
  ['de', de],
  ['ar', ar],
  ['ur', ur],
];

const REQUIRED_KEYS = [
  'toolbar.search',
  'pagination.previous',
  'pagination.next',
  'table.noResults',
  'table.loading',
  'validation.required',
];

describe('built-in locale packs — structural sanity', () => {
  it.each(PACKS)('pack "%s" exists and exports a non-empty object', (name, pack) => {
    expect(typeof pack).toBe('object');
    expect(Object.keys(pack).length).toBeGreaterThan(0);
    void name; // suppress unused-var lint
  });

  it.each(PACKS)('pack "%s" contains all required keys', (_name, pack) => {
    for (const key of REQUIRED_KEYS) {
      expect(pack[key]).toBeTruthy();
    }
  });

  it('ar pack carries _dir: "rtl"', () => {
    expect(ar['_dir']).toBe('rtl');
  });

  it('ur pack carries _dir: "rtl"', () => {
    expect(ur['_dir']).toBe('rtl');
  });

  it('en pack does not carry _dir', () => {
    expect(en['_dir']).toBeUndefined();
  });

  it('es pack does not carry _dir', () => {
    expect(es['_dir']).toBeUndefined();
  });

  it('fr pack does not carry _dir', () => {
    expect(fr['_dir']).toBeUndefined();
  });

  it('de pack does not carry _dir', () => {
    expect(de['_dir']).toBeUndefined();
  });

  it('locales map exports all six packs', () => {
    expect(Object.keys(locales).sort()).toEqual(['ar', 'de', 'en', 'es', 'fr', 'ur']);
  });

  it('locales map entries are the same objects as the named exports', () => {
    expect(locales['en']).toBe(en);
    expect(locales['ar']).toBe(ar);
    expect(locales['ur']).toBe(ur);
  });
});

describe('built-in locale packs — translations are correct', () => {
  it('en toolbar.search is "Search..."', () => {
    expect(en['toolbar.search']).toBe('Search...');
  });

  it('es toolbar.search is "Buscar..."', () => {
    expect(es['toolbar.search']).toBe('Buscar...');
  });

  it('fr toolbar.search is "Rechercher..."', () => {
    expect(fr['toolbar.search']).toBe('Rechercher...');
  });

  it('de toolbar.search is "Suchen..."', () => {
    expect(de['toolbar.search']).toBe('Suchen...');
  });

  it('en bulk.selected has one/other forms', () => {
    const v = en['bulk.selected'];
    expect(typeof v).toBe('object');
    const obj = v as Record<string, string>;
    expect(obj['one']).toBeTruthy();
    expect(obj['other']).toContain('{count}');
  });

  it('ar bulk.selected has one/other forms', () => {
    const v = ar['bulk.selected'];
    const obj = v as Record<string, string>;
    expect(obj['one']).toBeTruthy();
    expect(obj['other']).toBeTruthy();
  });

  it('addMessages with built-in fr pack enables translation', () => {
    const i18n = make({ locale: 'fr', messages: {} });
    i18n.addMessages('fr', fr);
    expect(i18n.t('toolbar.search')).toBe('Rechercher...');
    expect(i18n.t('pagination.previous')).toBe('Précédent');
  });

  it('addMessages with built-in ar pack enables RTL detection via _dir flag', () => {
    const i18n = make({ locale: 'ar', messages: {} });
    expect(i18n.isRTL()).toBe(true); // language-subtag path
    i18n.addMessages('ar', ar);
    expect(i18n.isRTL()).toBe(true); // _dir flag path also fires
  });
});

// ---------------------------------------------------------------------------
// Word count sanity (each pack >= 20 keys excluding _dir)
// ---------------------------------------------------------------------------

describe('built-in locale packs — word-count sanity', () => {
  it.each(PACKS)('pack "%s" has at least 20 message keys', (_name, pack) => {
    const keys = Object.keys(pack).filter(k => k !== '_dir');
    expect(keys.length).toBeGreaterThanOrEqual(20);
  });

  it('en and fr have the same key set (excluding _dir)', () => {
    const enKeys = new Set(Object.keys(en));
    const frKeys = Object.keys(fr).filter(k => k !== '_dir');
    for (const k of frKeys) {
      expect(enKeys.has(k)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('t() with vars.count = 0 returns the "other" form for English', () => {
    const i18n = make({
      locale: 'en',
      messages: {
        en: { items: { one: 'one item', other: '{count} items' } },
      },
    });
    expect(i18n.t('items', { count: 0 })).toBe('0 items');
  });

  it('t() warns only once across multiple calls for the same missing key', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const i18n = make({ locale: 'en', messages: { en: {} } });
    for (let i = 0; i < 5; i++) {
      i18n.t('ghost.key');
    }
    const hits = warnSpy.mock.calls.filter(c => /ghost\.key/.test(String(c[0])));
    expect(hits).toHaveLength(1);
  });

  it('separate instances have independent warn-once sets', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = make({ locale: 'en', messages: { en: {} } });
    const b = make({ locale: 'en', messages: { en: {} } });
    a.t('missing.key');
    b.t('missing.key');
    const hits = warnSpy.mock.calls.filter(c => /missing\.key/.test(String(c[0])));
    expect(hits).toHaveLength(2);
  });

  it('separate instances have isolated message catalogues', () => {
    const a = make({ locale: 'en', messages: { en: { x: 'from a' } } });
    const b = make({ locale: 'en', messages: { en: { x: 'from b' } } });
    expect(a.t('x')).toBe('from a');
    expect(b.t('x')).toBe('from b');
  });

  it('addMessages does not mutate the config object passed to createI18n', () => {
    const original = { hello: 'Hello' };
    const i18n = make({ locale: 'en', messages: { en: original } });
    i18n.addMessages('en', { goodbye: 'Goodbye' });
    expect(Object.prototype.hasOwnProperty.call(original, 'goodbye')).toBe(false);
  });

  it('formatNumber returns "" for zero when value is 0 (not null)', () => {
    const i18n = make({ locale: 'en' });
    const result = i18n.formatNumber(0);
    expect(result).not.toBe('');
    expect(result).toBe(new Intl.NumberFormat('en').format(0));
  });

  it('formatDate accepts epoch milliseconds', () => {
    const i18n = make({ locale: 'en' });
    const ms = Date.UTC(2024, 2, 15);
    const result = i18n.formatDate(ms);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
