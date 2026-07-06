/**
 * i18n/index.ts — v3 headless i18n module.
 *
 * Design contracts:
 *  - Zero DOM access anywhere in this file.
 *  - The renderer calls detectLocale(document.documentElement.lang) and
 *    passes the result into createI18n({ locale }).
 *  - Locale packs are exported as individual named consts so consumers can
 *    tree-shake the packs they do not need.
 *
 * Part of #323 (Phase 2 T2.8).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A message value: either a plain string or a plural-form map. */
export type MessageValue = string | Record<string, string>;

/**
 * A locale message catalogue.
 * The special `_dir` key marks RTL locales; its presence drives isRTL().
 */
export type LocaleMessages = Record<string, MessageValue>;

/** Intl.NumberFormat options object or a custom (value, locale) → string fn. */
export type NumberFormatter =
  | Intl.NumberFormatOptions
  | ((value: number, locale: string) => string);

/** Intl.DateTimeFormat options object or a custom (value, locale) → string fn. */
export type DateFormatter =
  | Intl.DateTimeFormatOptions
  | ((value: Date | string | number, locale: string) => string);

export interface I18nFormats {
  /** Default number-format options (or custom fn) applied by formatNumber(). */
  number?: NumberFormatter;
  /** Default date-format options (or custom fn) applied by formatDate(). */
  date?: DateFormatter;
}

export interface I18nConfig {
  /** Active locale tag, e.g. "en", "ar-EG". Defaults to "en". */
  locale?: string;
  /** Fallback locale when the active locale lacks a key. Defaults to "en". */
  fallbackLocale?: string;
  /** Catalogue of locale → message-map entries. */
  messages?: Record<string, LocaleMessages>;
  /** Default Intl format options or custom formatter functions. */
  formats?: I18nFormats;
}

/** The object returned by createI18n(). */
export interface I18nInstance {
  /** Translate key, optionally substituting {placeholder} tokens from vars.
   *  When vars.count is a number and the catalogue entry is a plural-forms
   *  object, picks the matching Intl.PluralRules form. */
  t(key: string, vars?: Record<string, string | number>): string;
  /** Switch the active locale. */
  setLocale(locale: string): void;
  /** Merge translations into the catalogue for the given locale. */
  addMessages(locale: string, messages: LocaleMessages): void;
  /** Format a number using the active locale + optional per-call Intl options. */
  formatNumber(value: number | null | undefined, options?: Intl.NumberFormatOptions): string;
  /** Format a Date / ISO string / epoch ms using the active locale. */
  formatDate(
    value: Date | string | number | null | undefined,
    options?: Intl.DateTimeFormatOptions,
  ): string;
  /** True when the active locale is right-to-left. */
  isRTL(): boolean;
  /** The currently active locale tag. */
  readonly locale: string;
}

// ---------------------------------------------------------------------------
// RTL language set (matches v2 exactly)
// ---------------------------------------------------------------------------

const RTL_LANGS = new Set([
  'ar', 'arc', 'dv', 'fa', 'ha', 'he', 'khw', 'ks', 'ku', 'ps', 'sd', 'ur', 'yi',
]);

// ---------------------------------------------------------------------------
// detectLocale — renderer-supplied, no DOM access here
// ---------------------------------------------------------------------------

/**
 * Normalise an explicit lang string into a BCP-47 locale tag.
 * The renderer passes document.documentElement.lang; this function is pure so
 * the headless core never references the DOM itself.
 *
 * Returns "en" when langString is empty or falsy.
 */
export function detectLocale(langString: string): string {
  if (!langString || typeof langString !== 'string') return 'en';
  const trimmed = langString.trim();
  return trimmed.length > 0 ? trimmed : 'en';
}

// ---------------------------------------------------------------------------
// createI18n factory
// ---------------------------------------------------------------------------

/**
 * Create a headless i18n instance.
 *
 * @example
 * ```ts
 * import { createI18n, en, fr } from 'tablecrafter/i18n';
 *
 * const i18n = createI18n({ locale: 'fr', messages: { fr } });
 * i18n.t('toolbar.search'); // → 'Rechercher...'
 * i18n.formatNumber(1234.5, { style: 'currency', currency: 'EUR' });
 * ```
 */
export function createI18n(config: I18nConfig = {}): I18nInstance {
  // Mutable state — closed over, never leaked.
  let _locale: string = config.locale ?? 'en';
  const _fallback: string = config.fallbackLocale ?? 'en';
  const _messages: Record<string, LocaleMessages> = config.messages
    ? Object.fromEntries(
        Object.entries(config.messages).map(([k, v]) => [k, { ...v }]),
      )
    : {};
  const _formats: I18nFormats = config.formats ?? {};

  // Warn-once set — avoids console spam for repeated missing-key lookups.
  const _missingKeys = new Set<string>();

  // -- helpers ---------------------------------------------------------------

  function resolveLocale(): string {
    return _locale;
  }

  function pickTemplate(key: string): MessageValue | undefined {
    const loc = resolveLocale();
    const locMessages = _messages[loc];
    if (locMessages !== undefined && Object.prototype.hasOwnProperty.call(locMessages, key)) {
      return locMessages[key];
    }
    const fbMessages = _messages[_fallback];
    if (fbMessages !== undefined && Object.prototype.hasOwnProperty.call(fbMessages, key)) {
      return fbMessages[key];
    }
    return undefined;
  }

  function substitute(template: string, vars: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (_m, name: string) => {
      return Object.prototype.hasOwnProperty.call(vars, name)
        ? String(vars[name] as string | number)
        : `{${name}}`;
    });
  }

  // -- public API ------------------------------------------------------------

  function t(key: string, vars?: Record<string, string | number>): string {
    let template: MessageValue | undefined = pickTemplate(key);

    if (template === undefined) {
      if (!_missingKeys.has(key)) {
        _missingKeys.add(key);
        console.warn(`TableCrafter i18n: missing translation for "${key}"`);
      }
      return key;
    }

    // Pluralisation: catalogue entry is an object + vars.count is a number.
    if (
      typeof template === 'object' &&
      vars !== undefined &&
      typeof vars['count'] === 'number'
    ) {
      const count = vars['count'] as number;
      let form = 'other';
      try {
        form = new Intl.PluralRules(resolveLocale()).select(count);
      } catch {
        // Locale unsupported by Intl.PluralRules — keep 'other'.
      }
      if (Object.prototype.hasOwnProperty.call(template, form)) {
        template = (template as Record<string, string>)[form] as string;
      } else if (Object.prototype.hasOwnProperty.call(template, 'other')) {
        template = (template as Record<string, string>)['other'] as string;
      } else {
        return key; // No usable plural form — fall back to key.
      }
    }

    if (typeof template !== 'string') {
      return key;
    }

    if (vars === undefined) {
      return template;
    }

    return substitute(template, vars);
  }

  function setLocale(locale: string): void {
    _locale = locale;
  }

  function addMessages(locale: string, messages: LocaleMessages): void {
    const existing = _messages[locale] ?? {};
    _messages[locale] = Object.assign(existing, messages);
  }

  function formatNumber(
    value: number | null | undefined,
    options?: Intl.NumberFormatOptions,
  ): string {
    if (value === null || value === undefined) return '';
    const num = typeof value === 'number' ? value : Number(value);
    if (Number.isNaN(num)) return String(value);

    const loc = resolveLocale();
    const defaults = _formats.number;

    if (typeof defaults === 'function') {
      return defaults(num, loc);
    }

    const merged: Intl.NumberFormatOptions = Object.assign(
      {},
      defaults ?? {},
      options ?? {},
    );
    try {
      return new Intl.NumberFormat(loc, merged).format(num);
    } catch {
      return String(num);
    }
  }

  function formatDate(
    value: Date | string | number | null | undefined,
    options?: Intl.DateTimeFormatOptions,
  ): string {
    if (value === null || value === undefined) return '';
    const date = value instanceof Date ? value : new Date(value as string | number);
    if (Number.isNaN(date.getTime())) return '';

    const loc = resolveLocale();
    const defaults = _formats.date;

    if (typeof defaults === 'function') {
      return defaults(value, loc);
    }

    const merged: Intl.DateTimeFormatOptions = Object.assign(
      {},
      defaults ?? {},
      options ?? {},
    );
    try {
      return new Intl.DateTimeFormat(loc, merged).format(date);
    } catch {
      return date.toISOString();
    }
  }

  function isRTL(): boolean {
    const loc = resolveLocale();
    if (!loc) return false;
    // Check _dir flag in the active locale pack first.
    const pack = _messages[loc];
    if (pack !== undefined && (pack as Record<string, MessageValue>)['_dir'] === 'rtl') {
      return true;
    }
    // Fall back to language-subtag detection.
    const lang = String(loc).toLowerCase().split(/[-_]/)[0] ?? '';
    return RTL_LANGS.has(lang);
  }

  return {
    t,
    setLocale,
    addMessages,
    formatNumber,
    formatDate,
    isRTL,
    get locale(): string {
      return _locale;
    },
  };
}

// ---------------------------------------------------------------------------
// Built-in locale packs (ported from v2 TableCrafter.locales, #40 / #190)
// Exported as individual named consts for tree-shaking.
// ---------------------------------------------------------------------------

/** English (LTR). */
export const en: LocaleMessages = {
  'toolbar.search': 'Search...',
  'toolbar.export': 'Export',
  'toolbar.addNew': 'Add New',
  'toolbar.clearFilters': 'Clear Filters',
  'toolbar.copyClipboard': 'Copy to Clipboard',
  'pagination.previous': 'Previous',
  'pagination.next': 'Next',
  'pagination.pageOf': 'Page {current} of {total}',
  'pagination.perPage': 'Rows per page',
  'table.noResults': 'No results found',
  'table.loading': 'Loading...',
  'table.error': 'Unable to load data. Please check your connection.',
  'bulk.delete': 'Delete Selected',
  'bulk.export': 'Export Selected',
  'bulk.edit': 'Edit Selected',
  'bulk.selected': { one: '1 row selected', other: '{count} rows selected' },
  'bulk.confirmDelete': 'Delete {count} rows?',
  'edit.save': 'Save',
  'edit.cancel': 'Cancel',
  'validation.required': 'This field is required',
  'validation.email': 'Please enter a valid email address',
  'validation.url': 'Please enter a valid URL',
  'validation.minLength': 'Minimum length is {min} characters',
  'validation.maxLength': 'Maximum length is {max} characters',
  'validation.min': 'Minimum value is {min}',
  'validation.max': 'Maximum value is {max}',
  'validation.pattern': 'Please enter a valid format',
  'filter.all': 'All',
  'filter.from': 'From',
  'filter.to': 'To',
};

/** Spanish / Español (LTR). */
export const es: LocaleMessages = {
  'toolbar.search': 'Buscar...',
  'toolbar.export': 'Exportar',
  'toolbar.addNew': 'Agregar',
  'toolbar.clearFilters': 'Limpiar Filtros',
  'toolbar.copyClipboard': 'Copiar al Portapapeles',
  'pagination.previous': 'Anterior',
  'pagination.next': 'Siguiente',
  'pagination.pageOf': 'Página {current} de {total}',
  'pagination.perPage': 'Filas por página',
  'table.noResults': 'No se encontraron resultados',
  'table.loading': 'Cargando...',
  'table.error': 'No se pueden cargar los datos.',
  'bulk.delete': 'Eliminar Seleccionados',
  'bulk.export': 'Exportar Seleccionados',
  'bulk.edit': 'Editar Seleccionados',
  'bulk.selected': { one: '1 fila seleccionada', other: '{count} filas seleccionadas' },
  'bulk.confirmDelete': '¿Eliminar {count} filas?',
  'edit.save': 'Guardar',
  'edit.cancel': 'Cancelar',
  'validation.required': 'Este campo es obligatorio',
  'validation.email': 'Introduce una dirección de correo válida',
  'validation.url': 'Introduce una URL válida',
  'validation.minLength': 'La longitud mínima es {min} caracteres',
  'validation.maxLength': 'La longitud máxima es {max} caracteres',
  'validation.min': 'El valor mínimo es {min}',
  'validation.max': 'El valor máximo es {max}',
  'validation.pattern': 'Introduce un formato válido',
  'filter.all': 'Todos',
  'filter.from': 'Desde',
  'filter.to': 'Hasta',
};

/** French / Français (LTR). */
export const fr: LocaleMessages = {
  'toolbar.search': 'Rechercher...',
  'toolbar.export': 'Exporter',
  'toolbar.addNew': 'Ajouter',
  'toolbar.clearFilters': 'Effacer les Filtres',
  'toolbar.copyClipboard': 'Copier dans le Presse-papiers',
  'pagination.previous': 'Précédent',
  'pagination.next': 'Suivant',
  'pagination.pageOf': 'Page {current} sur {total}',
  'pagination.perPage': 'Lignes par page',
  'table.noResults': 'Aucun résultat trouvé',
  'table.loading': 'Chargement...',
  'table.error': 'Impossible de charger les données.',
  'bulk.delete': 'Supprimer la sélection',
  'bulk.export': 'Exporter la sélection',
  'bulk.edit': 'Modifier la sélection',
  'bulk.selected': { one: '1 ligne sélectionnée', other: '{count} lignes sélectionnées' },
  'bulk.confirmDelete': 'Supprimer {count} lignes ?',
  'edit.save': 'Enregistrer',
  'edit.cancel': 'Annuler',
  'validation.required': 'Ce champ est obligatoire',
  'validation.email': 'Veuillez entrer une adresse e-mail valide',
  'validation.url': 'Veuillez entrer une URL valide',
  'validation.minLength': 'Longueur minimale : {min} caractères',
  'validation.maxLength': 'Longueur maximale : {max} caractères',
  'validation.min': 'La valeur minimale est {min}',
  'validation.max': 'La valeur maximale est {max}',
  'validation.pattern': 'Veuillez entrer un format valide',
  'filter.all': 'Tous',
  'filter.from': 'De',
  'filter.to': 'À',
};

/** German / Deutsch (LTR). */
export const de: LocaleMessages = {
  'toolbar.search': 'Suchen...',
  'toolbar.export': 'Exportieren',
  'toolbar.addNew': 'Hinzufügen',
  'toolbar.clearFilters': 'Filter löschen',
  'toolbar.copyClipboard': 'In Zwischenablage kopieren',
  'pagination.previous': 'Zurück',
  'pagination.next': 'Weiter',
  'pagination.pageOf': 'Seite {current} von {total}',
  'pagination.perPage': 'Zeilen pro Seite',
  'table.noResults': 'Keine Ergebnisse gefunden',
  'table.loading': 'Wird geladen...',
  'table.error': 'Daten konnten nicht geladen werden.',
  'bulk.delete': 'Ausgewählte löschen',
  'bulk.export': 'Ausgewählte exportieren',
  'bulk.edit': 'Ausgewählte bearbeiten',
  'bulk.selected': { one: '1 Zeile ausgewählt', other: '{count} Zeilen ausgewählt' },
  'bulk.confirmDelete': '{count} Zeilen löschen?',
  'edit.save': 'Speichern',
  'edit.cancel': 'Abbrechen',
  'validation.required': 'Dieses Feld ist erforderlich',
  'validation.email': 'Bitte geben Sie eine gültige E-Mail-Adresse ein',
  'validation.url': 'Bitte geben Sie eine gültige URL ein',
  'validation.minLength': 'Mindestlänge: {min} Zeichen',
  'validation.maxLength': 'Maximale Länge: {max} Zeichen',
  'validation.min': 'Mindestwert ist {min}',
  'validation.max': 'Maximalwert ist {max}',
  'validation.pattern': 'Bitte geben Sie ein gültiges Format ein',
  'filter.all': 'Alle',
  'filter.from': 'Von',
  'filter.to': 'Bis',
};

/** Arabic / العربية (RTL — _dir: 'rtl'). */
export const ar: LocaleMessages = {
  'toolbar.search': 'بحث...',
  'toolbar.export': 'تصدير',
  'toolbar.addNew': 'إضافة',
  'toolbar.clearFilters': 'مسح الفلاتر',
  'toolbar.copyClipboard': 'نسخ إلى الحافظة',
  'pagination.previous': 'السابق',
  'pagination.next': 'التالي',
  'pagination.pageOf': 'الصفحة {current} من {total}',
  'pagination.perPage': 'صفوف في الصفحة',
  'table.noResults': 'لا توجد نتائج',
  'table.loading': 'جارٍ التحميل...',
  'table.error': 'تعذر تحميل البيانات.',
  'bulk.delete': 'حذف المحدد',
  'bulk.export': 'تصدير المحدد',
  'bulk.edit': 'تعديل المحدد',
  'bulk.selected': { one: 'صف واحد محدد', other: '{count} صفوف محددة' },
  'bulk.confirmDelete': 'حذف {count} صفوف؟',
  'edit.save': 'حفظ',
  'edit.cancel': 'إلغاء',
  'validation.required': 'هذا الحقل مطلوب',
  'validation.email': 'يرجى إدخال بريد إلكتروني صالح',
  'validation.url': 'يرجى إدخال رابط صالح',
  'validation.minLength': 'الحد الأدنى للطول {min} حرف',
  'validation.maxLength': 'الحد الأقصى للطول {max} حرف',
  'validation.min': 'الحد الأدنى للقيمة هو {min}',
  'validation.max': 'الحد الأقصى للقيمة هو {max}',
  'validation.pattern': 'يرجى إدخال تنسيق صالح',
  'filter.all': 'الكل',
  'filter.from': 'من',
  'filter.to': 'إلى',
  '_dir': 'rtl',
};

/** Urdu / اردو (RTL — _dir: 'rtl'). */
export const ur: LocaleMessages = {
  'toolbar.search': 'تلاش کریں...',
  'toolbar.export': 'برآمد',
  'toolbar.addNew': 'نیا شامل کریں',
  'toolbar.clearFilters': 'فلٹر صاف کریں',
  'toolbar.copyClipboard': 'کلپ بورڈ میں کاپی کریں',
  'pagination.previous': 'پچھلا',
  'pagination.next': 'اگلا',
  'pagination.pageOf': 'صفحہ {current} از {total}',
  'pagination.perPage': 'فی صفحہ قطاریں',
  'table.noResults': 'کوئی نتیجہ نہیں ملا',
  'table.loading': 'لوڈ ہو رہا ہے...',
  'table.error': 'ڈیٹا لوڈ نہیں ہو سکا۔',
  'bulk.delete': 'منتخب حذف کریں',
  'bulk.export': 'منتخب برآمد کریں',
  'bulk.edit': 'منتخب ترمیم کریں',
  'bulk.selected': { one: '1 قطار منتخب', other: '{count} قطاریں منتخب' },
  'bulk.confirmDelete': '{count} قطاریں حذف کریں؟',
  'edit.save': 'محفوظ کریں',
  'edit.cancel': 'منسوخ کریں',
  'validation.required': 'یہ فیلڈ ضروری ہے',
  'validation.email': 'براہ کرم درست ای میل پتہ درج کریں',
  'validation.url': 'براہ کرم درست URL درج کریں',
  'validation.minLength': 'کم از کم لمبائی {min} حروف ہے',
  'validation.maxLength': 'زیادہ سے زیادہ لمبائی {max} حروف ہے',
  'validation.min': 'کم از کم قدر {min} ہے',
  'validation.max': 'زیادہ سے زیادہ قدر {max} ہے',
  'validation.pattern': 'براہ کرم درست فارمیٹ درج کریں',
  'filter.all': 'سب',
  'filter.from': 'سے',
  'filter.to': 'تک',
  '_dir': 'rtl',
};

/** All six built-in packs as a keyed map (mirrors v2 TableCrafter.locales). */
export const locales: Record<string, LocaleMessages> = { en, es, fr, de, ar, ur };
