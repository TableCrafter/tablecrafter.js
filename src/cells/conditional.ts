/**
 * cells/conditional.ts
 *
 * Conditional formatting rules engine + cell renderer.
 *
 * Supports:
 *   - Rules engine: equals/contains/gt/lt/empty/between/regex/function predicates
 *   - kind:'dataBar'  — horizontal fill bar (width% via value position)
 *   - kind:'colorScale' — background colour interpolated between min/[mid]/max
 *   - kind:'icon'   — prepend a text icon (e.g. '✓', '⚠', '●')
 *   - style/className output for generic styling
 *   - aria-label parity with v2 _applyConditionalAriaLabel
 *
 * Color math ported exactly from v2 _interpolateColor / _colorScaleAt /
 * _lerpColor.  Both the 3-arg _interpolateColor hex path and the
 * _colorScaleAt / _lerpColor RGB struct path are included for parity;
 * v3 uses the struct path internally.
 *
 * v3 policy: produces ConditionalDescriptor objects — no DOM creation.
 */

import type { CellRendererFn, TableCrafterColumn } from '../core/types';
import type { ConditionalDescriptor, DataBarDescriptor } from './descriptors';

// ---------------------------------------------------------------------------
// Rule types
// ---------------------------------------------------------------------------

export type ConditionalOp =
  | 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq'
  | 'between' | 'contains' | 'empty' | 'regex';

export interface DeclarativeWhen {
  op: ConditionalOp;
  value?: unknown;
}

export type WhenPredicate = (value: unknown, row: unknown) => boolean;

/** A single conditional formatting rule (v3 version). */
export interface ConditionalRule {
  id?: string | undefined;
  /** Field key this rule applies to.  '*' matches any field. */
  field?: string | undefined;
  /**
   * Condition: a declarative {op, value} object or a function predicate.
   * A function receives (value, row) and returns boolean.
   */
  when?: DeclarativeWhen | WhenPredicate | undefined;

  // Output descriptors
  style?: Record<string, string> | undefined;
  className?: string | string[] | undefined;

  /** Visual kind shorthand. */
  kind?: 'dataBar' | 'colorScale' | 'icon' | undefined;

  // dataBar options
  min?: number | undefined;
  max?: number | undefined;
  color?: string | undefined;

  // colorScale options
  minColor?: string | undefined;
  maxColor?: string | undefined;
  /**
   * Optional midpoint colour for three-stop interpolation.
   * When present, the scale runs min→mid→max.
   */
  midColor?: string | undefined;
  /** Numeric midpoint value for three-stop colorScale.  Defaults to (min + max) / 2. */
  mid?: number | undefined;

  // icon options
  icon?: string | undefined;

  /** aria-label function or omit for auto "field: value". */
  ariaLabel?: ((value: unknown, row: unknown) => string) | undefined;

  /** Priority (higher wins on conflict). */
  priority?: number | undefined;
}

// ---------------------------------------------------------------------------
// Colour math (ported from v2)
// ---------------------------------------------------------------------------

interface Rgb { r: number; g: number; b: number }

/** Parse 3- or 6-digit hex.  Returns null on failure. */
function parseHexColor(hex: string): Rgb | null {
  if (typeof hex !== 'string') return null;
  let s = hex.trim().replace(/^#/, '');
  if (s.length === 3) s = s.split('').map(c => c + c).join('');
  if (s.length !== 6 || !/^[0-9a-f]{6}$/i.test(s)) return null;
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

function lerpColor(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

function formatRgb(c: Rgb): string {
  return `rgb(${c.r}, ${c.g}, ${c.b})`;
}

/**
 * v2-compatible _interpolateColor.  Accepts 3/6-digit hex strings,
 * returns an rgb() string.
 */
export function interpolateColor(c1: string, c2: string, t: number): string {
  const parse = (hex: string): [number, number, number] => {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [r1, g1, b1] = parse(c1);
  const [r2, g2, b2] = parse(c2);
  return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`;
}

/**
 * Compute the background colour for a value on a colorScale rule.
 * Supports two-stop (minColor→maxColor) and three-stop (min→mid→max).
 * Ported from v2 _colorScaleAt.
 */
export function colorScaleAt(
  value: number,
  min: number,
  max: number,
  rule: Pick<ConditionalRule, 'minColor' | 'maxColor' | 'midColor' | 'mid'>
): string | null {
  const minRgb = parseHexColor(rule.minColor ?? '');
  const maxRgb = parseHexColor(rule.maxColor ?? '');
  if (!minRgb || !maxRgb) return null;

  if (max <= min || value <= min) return formatRgb(minRgb);
  if (value >= max) return formatRgb(maxRgb);

  const midRgb = rule.midColor ? parseHexColor(rule.midColor) : null;
  const midPoint = typeof rule.mid === 'number' ? rule.mid : (min + max) / 2;

  if (midRgb) {
    if (value <= midPoint) {
      const t = midPoint > min ? (value - min) / (midPoint - min) : 0;
      return formatRgb(lerpColor(minRgb, midRgb, t));
    }
    const t = max > midPoint ? (value - midPoint) / (max - midPoint) : 1;
    return formatRgb(lerpColor(midRgb, maxRgb, t));
  }

  const t = (value - min) / (max - min);
  return formatRgb(lerpColor(minRgb, maxRgb, t));
}

/**
 * Compute dataBar width percentage for a value in [min, max].
 * Returns 0 for zero range.  Clamps to [0, 100].
 * Ported from v2 _dataBarPercent.
 */
export function dataBarPercent(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  if (value <= min) return 0;
  if (value >= max) return 100;
  return Math.round(((value - min) / (max - min)) * 100);
}

// ---------------------------------------------------------------------------
// Rule evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate a single rule's `when` predicate against a value and row.
 * Returns false when rule.when is absent.
 * Ported from v2 evaluateRule.
 */
export function evalRule(rule: ConditionalRule, value: unknown, row?: unknown): boolean {
  if (!rule || rule.when == null) return false;

  if (typeof rule.when === 'function') {
    try {
      return Boolean((rule.when as WhenPredicate)(value, row));
    } catch {
      return false;
    }
  }

  const { op, value: target } = rule.when as DeclarativeWhen;
  switch (op) {
    case 'gt':  return Number(value) > Number(target);
    case 'gte': return Number(value) >= Number(target);
    case 'lt':  return Number(value) < Number(target);
    case 'lte': return Number(value) <= Number(target);
    case 'eq':  return value === target;
    case 'neq': return value !== target;
    case 'between': {
      if (!Array.isArray(target) || target.length !== 2) return false;
      const n = Number(value);
      return n >= Number(target[0]) && n <= Number(target[1]);
    }
    case 'contains':
      return String(value ?? '').includes(String(target ?? ''));
    case 'empty':
      return value === null || value === undefined || value === '';
    case 'regex': {
      try {
        return new RegExp(String(target)).test(String(value ?? ''));
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

/**
 * Filter and sort rules that match a given (field, value, row) tuple.
 * Wildcard `field: '*'` rules match every field.
 * Sorted descending by priority (default 0 → higher wins).
 */
export function matchingRules(
  rules: ConditionalRule[],
  field: string,
  value: unknown,
  row?: unknown
): ConditionalRule[] {
  // A rule matches when:
  //   - field is absent (rule applies to all fields)
  //   - field is '*' (explicit wildcard)
  //   - field matches the current field key
  const candidates = rules.filter(
    r => !r.field || r.field === '*' || r.field === field
  );
  return candidates
    .filter(r => evalRule(r, value, row))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

/**
 * Evaluate a list of ConditionalRules against a value and return the first
 * matching rule, or null if none match.
 * (Public API used from the cells/index.ts export.)
 */
export function evalConditionalRules(
  value: unknown,
  rules: ConditionalRule[]
): ConditionalRule | null {
  for (const rule of rules) {
    if (evalRule(rule, value)) return rule;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Descriptor production
// ---------------------------------------------------------------------------

/** Column config shape for conditional rendering. */
export interface ConditionalOptions {
  rules: ConditionalRule[];
  field?: string | undefined;
}

type ColumnWithConditional = TableCrafterColumn & {
  conditional?: ConditionalOptions;
};

function buildAriaLabel(
  rule: ConditionalRule,
  value: unknown,
  field: string,
  row: unknown
): string | undefined {
  if (typeof rule.ariaLabel === 'function') {
    try {
      const label = rule.ariaLabel(value, row);
      if (typeof label === 'string' && label) return label;
    } catch {
      // ignore
    }
    return undefined;
  }
  return `${field}: ${String(value)}`;
}

/**
 * Apply a list of matched rules to produce a ConditionalDescriptor.
 * Rules are expected to already be sorted high→low priority.
 * Lower-priority rules are applied first so higher-priority writes win.
 */
export function conditionalDescriptorFromRules(
  matched: ConditionalRule[],
  value: unknown,
  field: string,
  row: unknown,
  dataForRange?: { min?: number; max?: number }
): ConditionalDescriptor | null {
  if (matched.length === 0) return null;

  // Merge style: iterate reversed (low→high) so high-priority overrides win
  const mergedStyle: Record<string, string> = {};
  const classSet = new Set<string>();
  for (const rule of [...matched].reverse()) {
    if (rule.style) Object.assign(mergedStyle, rule.style);
    if (rule.className) {
      const cls = Array.isArray(rule.className) ? rule.className : [rule.className];
      cls.forEach(c => { if (c) classSet.add(c); });
    }
  }

  const desc: ConditionalDescriptor = { kind: 'conditional' };

  if (Object.keys(mergedStyle).length > 0) desc.style = mergedStyle;
  if (classSet.size > 0) desc.classNames = Array.from(classSet);

  // icon: first matching icon rule wins (highest priority first since `matched` is sorted)
  const iconRule = matched.find(r => r.kind === 'icon' && r.icon);
  if (iconRule?.icon) desc.icon = iconRule.icon;

  // colorScale: first matching colorScale rule (highest priority)
  const scaleRule = matched.find(r => r.kind === 'colorScale');
  if (scaleRule) {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isNaN(num)) {
      const min = scaleRule.min ?? dataForRange?.min ?? 0;
      const max = scaleRule.max ?? dataForRange?.max ?? 1;
      const colour = colorScaleAt(num, min, max, scaleRule);
      if (colour) {
        desc.colorScale = colour;
        desc.ariaLabel = buildAriaLabel(scaleRule, value, field, row);
      }
    }
  }

  // dataBar: first matching dataBar rule (highest priority)
  const barRule = matched.find(r => r.kind === 'dataBar');
  if (barRule) {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isNaN(num)) {
      const min = barRule.min ?? dataForRange?.min ?? 0;
      const max = barRule.max ?? dataForRange?.max ?? 1;
      const pct = dataBarPercent(num, min, max);
      const bar: DataBarDescriptor = {
        pct,
        color: barRule.color ?? '#4caf50',
      };
      desc.dataBar = bar;
      if (!desc.ariaLabel) {
        desc.ariaLabel = buildAriaLabel(barRule, value, field, row);
      }
    }
  }

  return desc;
}

// ---------------------------------------------------------------------------
// CellRendererFn wrapper
// ---------------------------------------------------------------------------

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * CellRendererFn-compatible wrapper.
 * Reads column.conditional.rules, evaluates all matches, and returns an
 * HTML string with the applied decorations.
 *
 * The caller (render/dom) is responsible for applying style/class on the <td>;
 * this wrapper inlines them on a <span> wrapper for headless use.
 */
export const renderConditional: CellRendererFn = (
  value: unknown,
  row: unknown,
  column: TableCrafterColumn
): string => {
  const col = column as ColumnWithConditional;
  if (!col.conditional?.rules?.length) return String(value ?? '');

  const field = col.key ?? col.conditional.field ?? '';
  const matched = matchingRules(col.conditional.rules, field, value, row);
  const desc = conditionalDescriptorFromRules(matched, value, field, row);
  if (!desc) return String(value ?? '');

  // Build inline styles
  const styleStr = desc.colorScale
    ? `background-color:${desc.colorScale};`
    : '';

  const extraStyle = desc.style
    ? Object.entries(desc.style)
        .map(([k, v]) => `${k}:${v}`)
        .join(';')
    : '';

  const allStyle = [styleStr, extraStyle].filter(Boolean).join('');
  const styleAttr = allStyle ? ` style="${escHtml(allStyle)}"` : '';

  const classAttr = desc.classNames?.length
    ? ` class="${escHtml(desc.classNames.join(' '))}"`
    : '';

  const ariaAttr = desc.ariaLabel
    ? ` aria-label="${escHtml(desc.ariaLabel)}"`
    : '';

  const iconHtml = desc.icon
    ? `<span class="tc-cf-icon">${escHtml(desc.icon)}</span>`
    : '';

  const barHtml = desc.dataBar
    ? `<div class="tc-databar" style="width:${desc.dataBar.pct}%;background:${desc.dataBar.color};height:4px;margin-top:2px;border-radius:2px"></div>`
    : '';

  const textContent = escHtml(String(value ?? ''));

  return (
    `<span${classAttr}${styleAttr}${ariaAttr}>` +
    `${iconHtml}${textContent}${barHtml}` +
    `</span>`
  );
};
