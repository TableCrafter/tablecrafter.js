/**
 * cells module — v3 Vitest test suite.
 *
 * Coverage:
 *   - Module exports smoke tests (index re-exports)
 *   - registry: createCellRegistry, register, get, keys
 *   - badge: descriptor + renderer (statusFor, XSS safety, null input)
 *   - progress: descriptor + renderer (clamping, custom max, null)
 *   - link: isSafeUrl, hrefFor, labelFrom, descriptor, renderer (unsafe → span)
 *   - sparkline: descriptor math (points, single-value, all-equal, null guard)
 *   - star: descriptor (fill clamp, custom total, null), renderer (aria-label)
 *   - heatmap: descriptor (rect math, color interp, all-equal → maxColor, null)
 *   - conditional: evalRule (all ops + fn predicate), colorScaleAt (2/3 stop),
 *       dataBarPercent, interpolateColor, matchingRules, evalConditionalRules,
 *       conditionalDescriptorFromRules, renderConditional
 *   - autoformat: detectAutoFormat, individual predicates
 */

import { describe, it, expect, vi } from 'vitest';

// ─── Module exports ───────────────────────────────────────────────────────────

import * as mod from './index';

describe('cells index re-exports', () => {
  it('exports createCellRegistry', () => expect(typeof mod.createCellRegistry).toBe('function'));
  it('exports renderBadge', () => expect(typeof mod.renderBadge).toBe('function'));
  it('exports renderProgress', () => expect(typeof mod.renderProgress).toBe('function'));
  it('exports renderSparkline', () => expect(typeof mod.renderSparkline).toBe('function'));
  it('exports renderLink', () => expect(typeof mod.renderLink).toBe('function'));
  it('exports renderStar', () => expect(typeof mod.renderStar).toBe('function'));
  it('exports renderHeatmap', () => expect(typeof mod.renderHeatmap).toBe('function'));
  it('exports renderConditional', () => expect(typeof mod.renderConditional).toBe('function'));
  it('exports evalConditionalRules', () => expect(typeof mod.evalConditionalRules).toBe('function'));
  it('exports detectAutoFormat', () => expect(typeof mod.detectAutoFormat).toBe('function'));
  it('exports isSafeUrl', () => expect(typeof mod.isSafeUrl).toBe('function'));
});

// ─── Registry ────────────────────────────────────────────────────────────────

import { createCellRegistry, BUILT_IN_CELL_TYPES } from './registry';

describe('createCellRegistry', () => {
  it('returns an object with register/get/keys', () => {
    const r = createCellRegistry();
    expect(typeof r.register).toBe('function');
    expect(typeof r.get).toBe('function');
    expect(typeof r.keys).toBe('function');
  });

  it('pre-populates all built-in renderers', () => {
    const r = createCellRegistry();
    for (const name of BUILT_IN_CELL_TYPES) {
      expect(r.get(name)).toBeDefined();
    }
  });

  it('register + get round-trips a custom renderer', () => {
    const r = createCellRegistry();
    const fn = vi.fn().mockReturnValue('custom');
    r.register('myType', fn);
    expect(r.get('myType')).toBe(fn);
  });

  it('register overwrites an existing entry', () => {
    const r = createCellRegistry();
    const fn = vi.fn();
    r.register('badge', fn);
    expect(r.get('badge')).toBe(fn);
  });

  it('keys() includes all built-ins after register', () => {
    const r = createCellRegistry();
    r.register('extra', vi.fn());
    expect(r.keys()).toContain('extra');
    expect(r.keys()).toContain('badge');
  });

  it('register throws on empty name', () => {
    const r = createCellRegistry();
    expect(() => r.register('', vi.fn())).toThrow(TypeError);
  });

  it('get returns undefined for unknown name', () => {
    const r = createCellRegistry();
    expect(r.get('nope')).toBeUndefined();
  });
});

// ─── Badge ────────────────────────────────────────────────────────────────────

import { badgeDescriptor, renderBadge } from './badge';

const blankCol = { key: 'x' };

describe('badgeDescriptor', () => {
  it('returns null for null value', () => {
    expect(badgeDescriptor(null, {}, blankCol)).toBeNull();
  });

  it('returns null for undefined value', () => {
    expect(badgeDescriptor(undefined, {}, blankCol)).toBeNull();
  });

  it('lowercases value as default status slug', () => {
    const d = badgeDescriptor('OPEN', {}, blankCol);
    expect(d?.status).toBe('open');
  });

  it('uses statusFor function when provided', () => {
    const col = { key: 'x', badge: { statusFor: (v: unknown) => (Number(v) >= 100 ? 'done' : 'pending') } };
    expect(badgeDescriptor(75, {}, col)?.status).toBe('pending');
    expect(badgeDescriptor(100, {}, col)?.status).toBe('done');
  });

  it('rejects status slug with special chars (XSS guard)', () => {
    const col = { key: 'x', badge: { statusFor: () => '<script>' } };
    expect(badgeDescriptor('v', {}, col)?.status).toBe('');
  });

  it('carries text as raw string (no escaping at descriptor level)', () => {
    const d = badgeDescriptor('hello', {}, blankCol);
    expect(d?.text).toBe('hello');
  });
});

describe('renderBadge', () => {
  it('returns empty string for null', () => {
    expect(renderBadge(null, {}, blankCol)).toBe('');
  });

  it('contains tc-badge and tc-badge-{status} classes', () => {
    const html = renderBadge('open', {}, blankCol) as string;
    expect(html).toContain('tc-badge');
    expect(html).toContain('tc-badge-open');
  });

  it('renders value as text content (XSS: special chars are escaped)', () => {
    const html = renderBadge('<img>', {}, blankCol) as string;
    expect(html).toContain('&lt;img&gt;');
    expect(html).not.toContain('<img>');
  });

  it('no tc-badge-{status} class when statusFor returns special chars', () => {
    const col = { key: 'x', badge: { statusFor: () => '<>' } };
    const html = renderBadge('v', {}, col) as string;
    expect(html).toContain('tc-badge');
    // invalid slug → no extra class
    expect(html).not.toContain('tc-badge-<>');
  });
});

// ─── Progress ─────────────────────────────────────────────────────────────────

import { progressDescriptor, renderProgress } from './progress';

describe('progressDescriptor', () => {
  it('returns null for null', () => expect(progressDescriptor(null, {}, blankCol)).toBeNull());
  it('returns null for undefined', () => expect(progressDescriptor(undefined, {}, blankCol)).toBeNull());
  it('returns null for NaN string', () => expect(progressDescriptor('abc', {}, blankCol)).toBeNull());

  it('computes pct = (value / max) * 100', () => {
    expect(progressDescriptor(75, {}, blankCol)?.pct).toBe(75);
  });

  it('uses custom max when provided', () => {
    const col = { key: 'x', progress: { max: 200 } };
    expect(progressDescriptor(50, {}, col)?.pct).toBe(25);
  });

  it('clamps values above 100 to 100', () => {
    expect(progressDescriptor(150, {}, blankCol)?.pct).toBe(100);
  });

  it('clamps negative values to 0', () => {
    expect(progressDescriptor(-10, {}, blankCol)?.pct).toBe(0);
  });
});

describe('renderProgress', () => {
  it('returns empty string for null', () => {
    expect(renderProgress(null, {}, blankCol)).toBe('');
  });

  it('contains tc-progress and tc-progress-fill', () => {
    const html = renderProgress(75, {}, blankCol) as string;
    expect(html).toContain('tc-progress');
    expect(html).toContain('tc-progress-fill');
  });

  it('sets width style to pct%', () => {
    const html = renderProgress(75, {}, blankCol) as string;
    expect(html).toContain('width:75%');
  });

  it('clamps to 100% for overflowing values', () => {
    const html = renderProgress(999, {}, blankCol) as string;
    expect(html).toContain('width:100%');
  });

  it('clamps to 0% for negative values', () => {
    const html = renderProgress(-5, {}, blankCol) as string;
    expect(html).toContain('width:0%');
  });
});

// ─── Link ─────────────────────────────────────────────────────────────────────

import { isSafeUrl, hrefFor, labelFrom, linkDescriptor, renderLink } from './link';

describe('isSafeUrl', () => {
  it.each([
    ['https://example.com', true],
    ['http://x.com', true],
    ['mailto:x@y.com', true],
    ['tel:+1234', true],
    ['/relative', true],
    ['#anchor', true],
    ['?query', true],
    ['javascript:alert(1)', false],
    ['data:text/html,<h1>x</h1>', false],
    ['vbscript:foo', false],
    ['', false],
  ])('%s → %s', (url, expected) => {
    expect(isSafeUrl(url)).toBe(expected);
  });
});

describe('hrefFor', () => {
  it('uses hrefFor function when provided', () => {
    const col = { key: 'x', link: { hrefFor: (v: unknown) => `https://x.com/${v}` } };
    expect(hrefFor('abc', {}, col)).toBe('https://x.com/abc');
  });

  it('defaults to String(value)', () => {
    expect(hrefFor('https://example.com', {}, blankCol)).toBe('https://example.com');
  });
});

describe('labelFrom', () => {
  it('reads labelFrom column when provided', () => {
    const col = { key: 'url', link: { labelFrom: 'name' } };
    const row = { url: 'https://x.com', name: 'My Link' };
    expect(labelFrom('https://x.com', row, col)).toBe('My Link');
  });

  it('defaults to value when no labelFrom', () => {
    expect(labelFrom('https://x.com', {}, blankCol)).toBe('https://x.com');
  });
});

describe('linkDescriptor', () => {
  it('returns null for null value', () => {
    expect(linkDescriptor(null, {}, blankCol)).toBeNull();
  });

  it('returns link-unsafe descriptor for javascript: scheme', () => {
    const d = linkDescriptor('javascript:alert(1)', {}, blankCol);
    expect(d?.kind).toBe('link-unsafe');
  });

  it('returns link descriptor for safe URL', () => {
    const d = linkDescriptor('https://example.com', {}, blankCol);
    expect(d?.kind).toBe('link');
  });
});

describe('renderLink', () => {
  it('renders <a> with correct attributes for safe URL', () => {
    const html = renderLink('https://example.com', {}, blankCol) as string;
    expect(html).toContain('tc-link');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('renders <span> for unsafe URL', () => {
    const html = renderLink('javascript:alert(1)', {}, blankCol) as string;
    expect(html).toContain('<span>');
    expect(html).not.toContain('<a');
  });

  it('uses labelFrom for anchor text', () => {
    const col = { key: 'url', link: { labelFrom: 'name' } };
    const row = { url: 'https://example.com', name: 'My Link' };
    const html = renderLink('https://example.com', row, col) as string;
    expect(html).toContain('My Link');
  });

  it('returns empty string for null', () => {
    expect(renderLink(null, {}, blankCol)).toBe('');
  });
});

// ─── Sparkline ────────────────────────────────────────────────────────────────

import { sparklineDescriptor, renderSparkline } from './sparkline';

describe('sparklineDescriptor', () => {
  it('returns null for null', () => expect(sparklineDescriptor(null)).toBeNull());
  it('returns null for empty array', () => expect(sparklineDescriptor([])).toBeNull());
  it('returns null for non-array', () => expect(sparklineDescriptor('abc')).toBeNull());
  it('returns null when all values are NaN/non-finite', () => {
    expect(sparklineDescriptor([NaN, Infinity, 'a'])).toBeNull();
  });

  it('produces a descriptor with kind "sparkline"', () => {
    const d = sparklineDescriptor([1, 2, 3]);
    expect(d?.kind).toBe('sparkline');
  });

  it('uses default width=80, height=24, stroke=currentColor', () => {
    const d = sparklineDescriptor([1, 2, 3])!;
    expect(d.width).toBe(80);
    expect(d.height).toBe(24);
    expect(d.stroke).toBe('currentColor');
  });

  it('honours custom options', () => {
    const d = sparklineDescriptor([1, 2, 3], { width: 200, height: 50, stroke: '#f00' })!;
    expect(d.width).toBe(200);
    expect(d.height).toBe(50);
    expect(d.stroke).toBe('#f00');
  });

  it('first point x=0 and last point x=width for multi-value series', () => {
    const d = sparklineDescriptor([1, 2, 3, 4, 5], { width: 100, height: 20 })!;
    const pairs = d.points.split(' ').map(p => p.split(',').map(Number));
    expect(pairs[0]![0]).toBe(0);
    expect(pairs[pairs.length - 1]![0]).toBe(100);
  });

  it('low value → y=height, high value → y=0 (inverted Y axis)', () => {
    const d = sparklineDescriptor([1, 5], { width: 100, height: 20 })!;
    const pairs = d.points.split(' ').map(p => p.split(',').map(Number));
    expect(pairs[0]![1]).toBe(20); // low → bottom
    expect(pairs[1]![1]).toBe(0);  // high → top
  });

  it('single-value series renders at midpoint (height/2)', () => {
    const d = sparklineDescriptor([42], { width: 100, height: 20 })!;
    const pair = d.points.split(' ')[0]!.split(',').map(Number);
    expect(pair[1]).toBe(10);
  });

  it('all-equal series renders at midpoint (no NaN)', () => {
    const d = sparklineDescriptor([5, 5, 5, 5], { width: 100, height: 20 })!;
    const ys = d.points.split(' ').map(p => Number(p.split(',')[1]));
    for (const y of ys) expect(y).toBe(10);
  });
});

describe('renderSparkline', () => {
  it('returns empty string for null', () => {
    expect(renderSparkline(null, {}, blankCol)).toBe('');
  });

  it('produces SVG markup string', () => {
    const html = renderSparkline([1, 2, 3], {}, blankCol) as string;
    expect(html).toContain('<svg');
    expect(html).toContain('<polyline');
    expect(html).toContain('tc-sparkline');
  });

  it('uses column.sparkline options', () => {
    const col = { key: 'x', sparkline: { width: 120, height: 32 } };
    const html = renderSparkline([1, 2, 3], {}, col) as string;
    expect(html).toContain('width="120"');
    expect(html).toContain('height="32"');
  });
});

// ─── Star ─────────────────────────────────────────────────────────────────────

import { starDescriptor, renderStar } from './star';

describe('starDescriptor', () => {
  it('returns null for null', () => expect(starDescriptor(null, {}, blankCol)).toBeNull());
  it('returns null for undefined', () => expect(starDescriptor(undefined, {}, blankCol)).toBeNull());
  it('returns null for NaN', () => expect(starDescriptor('abc', {}, blankCol)).toBeNull());

  it('defaults to 5 total stars', () => {
    expect(starDescriptor(3, {}, blankCol)?.total).toBe(5);
  });

  it('uses custom total', () => {
    const col = { key: 'x', star: { total: 10 } };
    expect(starDescriptor(7, {}, col)?.total).toBe(10);
  });

  it('clamps filled to [0, total]', () => {
    expect(starDescriptor(10, {}, blankCol)?.filled).toBe(5);
    expect(starDescriptor(-1, {}, blankCol)?.filled).toBe(0);
  });

  it('rounds fractional values', () => {
    expect(starDescriptor(3.7, {}, blankCol)?.filled).toBe(4);
    expect(starDescriptor(2.2, {}, blankCol)?.filled).toBe(2);
  });

  it('ariaLabel carries count text', () => {
    const d = starDescriptor(3, {}, blankCol)!;
    expect(d.ariaLabel).toContain('3');
    expect(d.ariaLabel).toContain('5');
  });
});

describe('renderStar', () => {
  it('returns empty string for null', () => {
    expect(renderStar(null, {}, blankCol)).toBe('');
  });

  it('contains tc-star-rating class', () => {
    const html = renderStar(3, {}, blankCol) as string;
    expect(html).toContain('tc-star-rating');
  });

  it('contains role="img"', () => {
    const html = renderStar(3, {}, blankCol) as string;
    expect(html).toContain('role="img"');
  });

  it('carries aria-label', () => {
    const html = renderStar(3, {}, blankCol) as string;
    expect(html).toContain('aria-label=');
    expect(html).toContain('3');
  });

  it('has correct number of filled/empty stars', () => {
    const html = renderStar(3, {}, blankCol) as string;
    const filled = (html.match(/★/g) ?? []).length;
    const empty = (html.match(/☆/g) ?? []).length;
    expect(filled).toBe(3);
    expect(empty).toBe(2);
  });
});

// ─── Heatmap ──────────────────────────────────────────────────────────────────

import { heatmapDescriptor, renderHeatmap } from './heatmap';

describe('heatmapDescriptor', () => {
  it('returns null for null', () => expect(heatmapDescriptor(null)).toBeNull());
  it('returns null for empty array', () => expect(heatmapDescriptor([])).toBeNull());
  it('returns null for non-array', () => expect(heatmapDescriptor('nope')).toBeNull());
  it('returns null when all values are NaN', () => {
    expect(heatmapDescriptor([NaN, 'bad'])).toBeNull();
  });

  it('produces correct number of rect descriptors', () => {
    const d = heatmapDescriptor([0.1, 0.5, 0.9])!;
    expect(d.cells).toHaveLength(3);
  });

  it('cells span viewport horizontally (no overlap)', () => {
    const d = heatmapDescriptor([0.1, 0.5, 0.9, 0.2], { width: 80, height: 16 })!;
    const xs = d.cells.map(c => c.x);
    expect(xs).toEqual([0, 20, 40, 60]);
    for (const c of d.cells) expect(c.width).toBeCloseTo(20);
  });

  it('min value → minColor, max value → maxColor', () => {
    const d = heatmapDescriptor([0, 1], { minColor: '#ff0000', maxColor: '#00ff00' })!;
    expect(d.cells[0]!.fill).toBe('rgb(255, 0, 0)');
    expect(d.cells[1]!.fill).toBe('rgb(0, 255, 0)');
  });

  it('all-equal series renders at maxColor (full intensity)', () => {
    const d = heatmapDescriptor([5, 5, 5], { minColor: '#ff0000', maxColor: '#00ff00' })!;
    for (const c of d.cells) expect(c.fill).toBe('rgb(0, 255, 0)');
  });

  it('uses default dimensions (80x16)', () => {
    const d = heatmapDescriptor([1, 2])!;
    expect(d.svgWidth).toBe(80);
    expect(d.svgHeight).toBe(16);
  });
});

describe('renderHeatmap', () => {
  it('returns empty string for null', () => {
    expect(renderHeatmap(null, {}, blankCol)).toBe('');
  });

  it('produces SVG markup with rect elements', () => {
    const html = renderHeatmap([0.1, 0.5, 0.9], {}, blankCol) as string;
    expect(html).toContain('<svg');
    expect(html).toContain('<rect');
    expect(html).toContain('tc-heatmap');
  });

  it('uses column.heatmap options', () => {
    const col = { key: 'x', heatmap: { width: 120, height: 24 } };
    const html = renderHeatmap([1, 2], {}, col) as string;
    expect(html).toContain('width="120"');
    expect(html).toContain('height="24"');
  });
});

// ─── Conditional: color math ─────────────────────────────────────────────────

import { colorScaleAt, dataBarPercent, interpolateColor } from './conditional';

describe('interpolateColor', () => {
  it('returns minColor at t=0', () => {
    expect(interpolateColor('#ff0000', '#00ff00', 0)).toBe('rgb(255,0,0)');
  });

  it('returns maxColor at t=1', () => {
    expect(interpolateColor('#ff0000', '#00ff00', 1)).toBe('rgb(0,255,0)');
  });

  it('blends at midpoint', () => {
    expect(interpolateColor('#ff0000', '#00ff00', 0.5)).toBe('rgb(128,128,0)');
  });
});

describe('colorScaleAt', () => {
  it('two-stop: min → minColor', () => {
    const c = colorScaleAt(0, 0, 100, { minColor: '#ff0000', maxColor: '#00ff00' });
    expect(c).toBe('rgb(255, 0, 0)');
  });

  it('two-stop: max → maxColor', () => {
    const c = colorScaleAt(100, 0, 100, { minColor: '#ff0000', maxColor: '#00ff00' });
    expect(c).toBe('rgb(0, 255, 0)');
  });

  it('two-stop: midpoint blends correctly', () => {
    const c = colorScaleAt(50, 0, 100, { minColor: '#ff0000', maxColor: '#00ff00' });
    expect(c).toBe('rgb(128, 128, 0)');
  });

  it('three-stop: exactly at mid returns midColor', () => {
    const c = colorScaleAt(50, 0, 100, {
      minColor: '#ff0000', midColor: '#ffff00', maxColor: '#00ff00', mid: 50
    });
    expect(c).toBe('rgb(255, 255, 0)');
  });

  it('three-stop: min endpoint', () => {
    const c = colorScaleAt(0, 0, 100, {
      minColor: '#ff0000', midColor: '#ffff00', maxColor: '#00ff00', mid: 50
    });
    expect(c).toBe('rgb(255, 0, 0)');
  });

  it('three-stop: max endpoint', () => {
    const c = colorScaleAt(100, 0, 100, {
      minColor: '#ff0000', midColor: '#ffff00', maxColor: '#00ff00', mid: 50
    });
    expect(c).toBe('rgb(0, 255, 0)');
  });

  it('clamps below min to minColor', () => {
    const c = colorScaleAt(-10, 0, 100, { minColor: '#ff0000', maxColor: '#00ff00' });
    expect(c).toBe('rgb(255, 0, 0)');
  });

  it('clamps above max to maxColor', () => {
    const c = colorScaleAt(200, 0, 100, { minColor: '#ff0000', maxColor: '#00ff00' });
    expect(c).toBe('rgb(0, 255, 0)');
  });

  it('returns null when minColor is invalid', () => {
    // 'bad' is actually valid 3-digit hex (expands to #bbaadd). Use a truly invalid string.
    const c = colorScaleAt(50, 0, 100, { minColor: 'notacolor', maxColor: '#00ff00' });
    expect(c).toBeNull();
  });
});

describe('dataBarPercent', () => {
  it('min → 0', () => expect(dataBarPercent(0, 0, 100)).toBe(0));
  it('max → 100', () => expect(dataBarPercent(100, 0, 100)).toBe(100));
  it('midpoint → 50', () => expect(dataBarPercent(50, 0, 100)).toBe(50));
  it('below min clamps to 0', () => expect(dataBarPercent(-5, 0, 100)).toBe(0));
  it('above max clamps to 100', () => expect(dataBarPercent(200, 0, 100)).toBe(100));
  it('zero range returns 0', () => expect(dataBarPercent(5, 5, 5)).toBe(0));
  it('25%', () => expect(dataBarPercent(25, 0, 100)).toBe(25));
});

// ─── Conditional: rule evaluation ─────────────────────────────────────────────

import { evalRule, matchingRules, evalConditionalRules } from './conditional';
import type { ConditionalRule } from './conditional';

describe('evalRule', () => {
  it('returns false when rule.when is absent', () => {
    expect(evalRule({}, 5)).toBe(false);
  });

  it('calls function predicate with (value, row)', () => {
    const fn = vi.fn(() => true);
    const row = { x: 1 };
    expect(evalRule({ when: fn }, 5, row)).toBe(true);
    expect(fn).toHaveBeenCalledWith(5, row);
  });

  it('fn predicate that throws returns false', () => {
    const fn = () => { throw new Error('boom'); };
    expect(evalRule({ when: fn }, 5)).toBe(false);
  });

  it.each([
    ['gt', 6, 5, true],
    ['gt', 5, 5, false],
    ['gte', 5, 5, true],
    ['lt', 4, 5, true],
    ['lt', 5, 5, false],
    ['lte', 5, 5, true],
    ['eq', 'a', 'a', true],
    ['eq', 'a', 'b', false],
    ['neq', 'a', 'b', true],
    ['neq', 'a', 'a', false],
  ] as [string, unknown, unknown, boolean][])('declarative %s: value=%s target=%s → %s', (op, value, target, expected) => {
    expect(evalRule({ when: { op: op as ConditionalRule['when'] extends { op: infer O } ? O : never, value: target } }, value)).toBe(expected);
  });

  it('between: true when in range', () => {
    expect(evalRule({ when: { op: 'between', value: [1, 10] } }, 5)).toBe(true);
  });

  it('between: false when out of range', () => {
    expect(evalRule({ when: { op: 'between', value: [1, 10] } }, 11)).toBe(false);
  });

  it('contains', () => {
    expect(evalRule({ when: { op: 'contains', value: 'oo' } }, 'foobar')).toBe(true);
    expect(evalRule({ when: { op: 'contains', value: 'oo' } }, 'bar')).toBe(false);
  });

  it('empty: true for null', () => expect(evalRule({ when: { op: 'empty' } }, null)).toBe(true));
  it('empty: true for ""', () => expect(evalRule({ when: { op: 'empty' } }, '')).toBe(true));
  it('empty: false for "x"', () => expect(evalRule({ when: { op: 'empty' } }, 'x')).toBe(false));

  it('regex: matches', () => {
    expect(evalRule({ when: { op: 'regex', value: '^foo' } }, 'foobar')).toBe(true);
  });

  it('regex: no match', () => {
    expect(evalRule({ when: { op: 'regex', value: '^foo' } }, 'barfoo')).toBe(false);
  });

  it('unknown op returns false without throwing', () => {
    expect(evalRule({ when: { op: 'xyz' as never } }, 5)).toBe(false);
  });
});

describe('matchingRules', () => {
  const rules: ConditionalRule[] = [
    { id: 'low', field: 'score', when: { op: 'lt', value: 3 }, priority: 0 },
    { id: 'critical', field: 'score', when: { op: 'lt', value: 2 }, priority: 5 },
    { id: 'wildcard', field: '*', when: () => true, priority: 0 },
    { id: 'other', field: 'name', when: () => true, priority: 0 },
  ];

  it('returns matching rules sorted by descending priority', () => {
    const m = matchingRules(rules, 'score', 1);
    // 'critical' (priority 5) first, then 'low' and 'wildcard' (priority 0, stable sort order)
    expect(m[0]!.id).toBe('critical');
    expect(m.map(r => r.id)).toContain('low');
    expect(m.map(r => r.id)).toContain('wildcard');
  });

  it('wildcard rule matches every field', () => {
    const m = matchingRules(rules, 'something_else', 100);
    expect(m.map(r => r.id)).toContain('wildcard');
  });

  it('non-matching rule is excluded', () => {
    const m = matchingRules(rules, 'score', 10); // not < 3
    const ids = m.map(r => r.id);
    expect(ids).not.toContain('low');
    expect(ids).not.toContain('critical');
  });
});

describe('evalConditionalRules', () => {
  it('returns first matching rule', () => {
    const rules: ConditionalRule[] = [
      { id: 'r1', when: { op: 'gt', value: 5 } },
      { id: 'r2', when: () => true },
    ];
    expect(evalConditionalRules(10, rules)?.id).toBe('r1');
  });

  it('returns null when no rules match', () => {
    const rules: ConditionalRule[] = [{ id: 'r1', when: { op: 'gt', value: 100 } }];
    expect(evalConditionalRules(5, rules)).toBeNull();
  });
});

// ─── Conditional: descriptor + renderer ──────────────────────────────────────

import { conditionalDescriptorFromRules, renderConditional } from './conditional';

describe('conditionalDescriptorFromRules', () => {
  it('returns null for empty matched list', () => {
    expect(conditionalDescriptorFromRules([], 0, 'f', {})).toBeNull();
  });

  it('merges style: higher-priority rule wins on conflicting key', () => {
    const matched: ConditionalRule[] = [
      { id: 'hi', style: { color: 'red' }, priority: 5 },
      { id: 'lo', style: { color: 'blue' }, priority: 0 },
    ];
    const d = conditionalDescriptorFromRules(matched, 50, 'score', {})!;
    expect(d.style?.color).toBe('red');
  });

  it('classNames: union of all matched rule classNames', () => {
    const matched: ConditionalRule[] = [
      { id: 'a', className: 'cls-a', priority: 0 },
      { id: 'b', className: ['cls-b', 'cls-c'], priority: 1 },
    ];
    const d = conditionalDescriptorFromRules(matched, 50, 'score', {})!;
    expect(d.classNames).toContain('cls-a');
    expect(d.classNames).toContain('cls-b');
    expect(d.classNames).toContain('cls-c');
  });

  it('icon: first match (highest priority) wins', () => {
    const matched: ConditionalRule[] = [
      { kind: 'icon', icon: '✓', priority: 5 },
      { kind: 'icon', icon: '⚠', priority: 0 },
    ];
    const d = conditionalDescriptorFromRules(matched, 50, 'f', {})!;
    expect(d.icon).toBe('✓');
  });

  it('dataBar: pct is computed from min/max', () => {
    const matched: ConditionalRule[] = [
      { kind: 'dataBar', min: 0, max: 100, when: () => true },
    ];
    const d = conditionalDescriptorFromRules(matched, 50, 'score', {})!;
    expect(d.dataBar?.pct).toBe(50);
  });

  it('colorScale: sets colorScale string', () => {
    const matched: ConditionalRule[] = [
      { kind: 'colorScale', min: 0, max: 100, minColor: '#ff0000', maxColor: '#00ff00' },
    ];
    const d = conditionalDescriptorFromRules(matched, 50, 'score', {})!;
    expect(d.colorScale).toBeTruthy();
  });

  it('colorScale: non-numeric value skips colorScale', () => {
    const matched: ConditionalRule[] = [
      { kind: 'colorScale', min: 0, max: 100, minColor: '#ff0000', maxColor: '#00ff00' },
    ];
    const d = conditionalDescriptorFromRules(matched, 'n/a', 'score', {});
    expect(d?.colorScale).toBeUndefined();
  });

  it('ariaLabel: auto-generated when no ariaLabel fn', () => {
    const matched: ConditionalRule[] = [
      { kind: 'colorScale', min: 0, max: 100, minColor: '#ff0000', maxColor: '#00ff00' },
    ];
    const d = conditionalDescriptorFromRules(matched, 50, 'score', {})!;
    expect(d.ariaLabel).toContain('score');
    expect(d.ariaLabel).toContain('50');
  });

  it('ariaLabel: custom fn is called', () => {
    const ariaLabel = vi.fn(() => 'custom label');
    const matched: ConditionalRule[] = [
      { kind: 'colorScale', min: 0, max: 100, minColor: '#ff0000', maxColor: '#00ff00', ariaLabel },
    ];
    const d = conditionalDescriptorFromRules(matched, 50, 'score', { score: 50 })!;
    expect(ariaLabel).toHaveBeenCalled();
    expect(d.ariaLabel).toBe('custom label');
  });
});

describe('renderConditional', () => {
  it('returns raw string value when no rules configured', () => {
    const col = { key: 'score' };
    expect(renderConditional(42, {}, col)).toBe('42');
  });

  it('applies style via inline style attribute', () => {
    const col = {
      key: 'score',
      conditional: {
        field: 'score',
        rules: [{ id: 'r', when: () => true, style: { color: 'red' } }],
      },
    };
    const html = renderConditional(50, {}, col) as string;
    expect(html).toContain('color:red');
  });

  it('applies className', () => {
    const col = {
      key: 'score',
      conditional: {
        field: 'score',
        rules: [{ id: 'r', when: () => true, className: 'tc-high' }],
      },
    };
    const html = renderConditional(90, {}, col) as string;
    expect(html).toContain('tc-high');
  });

  it('includes icon span', () => {
    const col = {
      key: 'score',
      conditional: {
        field: 'score',
        rules: [{ id: 'r', when: () => true, kind: 'icon' as const, icon: '✓' }],
      },
    };
    const html = renderConditional(90, {}, col) as string;
    expect(html).toContain('tc-cf-icon');
    expect(html).toContain('✓');
  });

  it('includes databar span', () => {
    const col = {
      key: 'score',
      conditional: {
        field: 'score',
        rules: [{ id: 'r', when: () => true, kind: 'dataBar' as const, min: 0, max: 100 }],
      },
    };
    const html = renderConditional(50, {}, col) as string;
    expect(html).toContain('tc-databar');
    expect(html).toContain('width:50%');
  });

  it('applies colorScale background', () => {
    const col = {
      key: 'score',
      conditional: {
        field: 'score',
        rules: [{
          id: 'r', when: () => true, kind: 'colorScale' as const,
          min: 0, max: 100, minColor: '#ff0000', maxColor: '#00ff00'
        }],
      },
    };
    const html = renderConditional(50, {}, col) as string;
    expect(html).toContain('background-color:');
  });
});

// ─── Autoformat ───────────────────────────────────────────────────────────────

import { detectAutoFormat, isBoolean, isEmail, isImageUrl, isUrl, isIsoDate } from './autoformat';

describe('isBoolean', () => {
  it.each([true, false, 'true', 'false', 1, 0, '1', '0'])('%s → true', v => {
    expect(isBoolean(v)).toBe(true);
  });

  it.each(['yes', 'no', 2, null, undefined])('%s → false', v => {
    expect(isBoolean(v)).toBe(false);
  });
});

describe('isEmail', () => {
  it('recognises email addresses', () => {
    expect(isEmail('user@example.com')).toBe(true);
    expect(isEmail('a+b@x.co.uk')).toBe(true);
  });

  it('rejects non-emails', () => {
    expect(isEmail('notanemail')).toBe(false);
    expect(isEmail('https://x.com')).toBe(false);
  });
});

describe('isImageUrl', () => {
  it.each([
    'https://example.com/photo.jpg',
    'https://x.com/img.png',
    'https://x.com/img.webp',
    'https://x.com/img.gif',
  ])('%s → true', url => expect(isImageUrl(url)).toBe(true));

  it('non-image URL → false', () => expect(isImageUrl('https://x.com/page')).toBe(false));
});

describe('isUrl', () => {
  it('http/https non-image → true', () => {
    expect(isUrl('https://example.com')).toBe(true);
    expect(isUrl('http://x.org/path?q=1')).toBe(true);
  });

  it('image URL → false (isImageUrl handles that)', () => {
    expect(isUrl('https://x.com/img.jpg')).toBe(false);
  });

  it('relative/mailto → false', () => {
    expect(isUrl('/relative')).toBe(false);
    expect(isUrl('mailto:a@b.com')).toBe(false);
  });
});

describe('isIsoDate', () => {
  it.each([
    '2024-01-15',
    '2024-01-15T12:34:56',
    '2024-01-15T12:34:56.789',
    '2024-01-15T12:34:56Z',
  ])('%s → true', v => expect(isIsoDate(v)).toBe(true));

  it.each(['2024/01/15', '01-15-2024', 'not a date', '2024-13-01'])
    ('%s → false', v => expect(isIsoDate(v)).toBe(false));
});

describe('detectAutoFormat', () => {
  it('null → text', () => expect(detectAutoFormat(null)).toBe('text'));
  it('undefined → text', () => expect(detectAutoFormat(undefined)).toBe('text'));
  it('true → boolean', () => expect(detectAutoFormat(true)).toBe('boolean'));
  it('"true" → boolean', () => expect(detectAutoFormat('true')).toBe('boolean'));
  it('email string → email', () => expect(detectAutoFormat('a@b.com')).toBe('email'));
  it('image url → image', () => expect(detectAutoFormat('https://x.com/img.png')).toBe('image'));
  it('plain url → url', () => expect(detectAutoFormat('https://example.com')).toBe('url'));
  it('ISO date → date', () => expect(detectAutoFormat('2024-01-15')).toBe('date'));
  it('plain number → text', () => expect(detectAutoFormat(42)).toBe('text'));
  it('plain string → text', () => expect(detectAutoFormat('hello world')).toBe('text'));
});
