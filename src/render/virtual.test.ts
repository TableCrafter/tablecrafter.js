/**
 * src/render/virtual.test.ts
 *
 * Tests for render/virtual.ts.
 * Covers:
 *   - computeVisibleRange pure-function unit tests
 *   - mountVirtualScroll integration tests (table and card mode)
 *   - p95 < 50ms scroll-patch performance budget (1,000 rows, jsdom)
 *   - 10k-row DOM node bound assertion
 *   - variable rowHeight guard
 *   - getCurrentRange contract (dom.ts reads this for aria-rowindex)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { computeVisibleRange, mountVirtualScroll } from './virtual';
import type { TableState } from '../core/types';

// jsdom does not implement ResizeObserver; install a no-op stub so that
// mountVirtualScroll (which uses it for container resize detection) can
// run in the test environment.  The stub is intentionally inert -- callbacks
// never fire in jsdom since there is no real layout engine.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRows(n: number): unknown[] {
  return Array.from({ length: n }, (_, i) => ({ id: i }));
}

function makeTableContainer(): HTMLElement {
  const el = document.createElement('tbody');
  Object.defineProperty(el, 'clientHeight', { get: () => 400, configurable: true });
  Object.defineProperty(el, 'scrollTop',    { get: () => 0,   configurable: true });
  return el;
}

function makeCardContainer(): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientHeight', { get: () => 400, configurable: true });
  Object.defineProperty(el, 'scrollTop',    { get: () => 0,   configurable: true });
  return el;
}

const buildRow = (_row: unknown, idx: number): HTMLTableRowElement => {
  const tr = document.createElement('tr');
  tr.dataset.idx = String(idx);
  return tr as HTMLTableRowElement;
};

const buildCard = (_row: unknown, idx: number): HTMLElement => {
  const div = document.createElement('div');
  div.className = 'tc-card';
  div.dataset.idx = String(idx);
  return div;
};

// ---------------------------------------------------------------------------
// computeVisibleRange
// ---------------------------------------------------------------------------

describe('computeVisibleRange', () => {
  it('returns all-zero when totalRows is 0', () => {
    expect(computeVisibleRange(0, 400, 0, 40)).toEqual({
      start: 0, end: 0, offsetTop: 0, offsetBottom: 0,
    });
  });

  it('returns all-zero when totalRows is negative', () => {
    expect(computeVisibleRange(0, 400, -1, 40)).toEqual({
      start: 0, end: 0, offsetTop: 0, offsetBottom: 0,
    });
  });

  it('initial state: scrollTop=0, viewport=400, rowHeight=40, 1000 rows', () => {
    const r = computeVisibleRange(0, 400, 1000, 40);
    // visibleCount=10, firstVisible=0, start=max(0,0-5)=0, end=min(1000,0+10+5)=15
    expect(r.start).toBe(0);
    expect(r.end).toBe(15);
    expect(r.offsetTop).toBe(0);
    expect(r.offsetBottom).toBe((1000 - 15) * 40);
  });

  it('mid-scroll position', () => {
    // scrollTop=500 -> firstVisible=12, start=max(0,12-5)=7, end=min(100,12+10+5)=27
    const r = computeVisibleRange(500, 400, 100, 40);
    expect(r.start).toBe(7);
    expect(r.end).toBe(27);
    expect(r.offsetTop).toBe(7 * 40);
    expect(r.offsetBottom).toBe((100 - 27) * 40);
  });

  it('scroll beyond total clamps end to totalRows', () => {
    // scrollTop=9000 on 100 rows -> end is clamped to 100
    const r = computeVisibleRange(9000, 400, 100, 40);
    expect(r.end).toBeLessThanOrEqual(100);
    expect(r.offsetBottom).toBe(0);
  });

  it('start is clamped so it never exceeds totalRows', () => {
    // totalRows=5, large scrollTop -> start must be <=5
    const r = computeVisibleRange(99999, 400, 5, 40);
    expect(r.start).toBeLessThanOrEqual(5);
    expect(r.end).toBeLessThanOrEqual(5);
  });

  it('end is never less than start', () => {
    const r = computeVisibleRange(99999, 0, 5, 40);
    expect(r.end).toBeGreaterThanOrEqual(r.start);
  });

  it('respects custom overscan', () => {
    // overscan=2, scrollTop=0, viewport=400, rowHeight=40, 100 rows
    // visibleCount=10, start=0, end=min(100,0+10+2)=12
    const r = computeVisibleRange(0, 400, 100, 40, 2);
    expect(r.end).toBe(12);
  });

  it('zero-height container gives visibleCount=0', () => {
    // containerHeight=0 -> visibleCount=0, only overscan rows
    const r = computeVisibleRange(0, 0, 100, 40, 5);
    expect(r.start).toBe(0);
    expect(r.end).toBe(5); // just overscan
  });

  it('offsetTop + offsetBottom + visible window covers all rows', () => {
    const r = computeVisibleRange(200, 400, 100, 40);
    const visibleHeight = (r.end - r.start) * 40;
    expect(r.offsetTop + visibleHeight + r.offsetBottom).toBe(100 * 40);
  });
});

// ---------------------------------------------------------------------------
// mountVirtualScroll -- table mode
// ---------------------------------------------------------------------------

describe('mountVirtualScroll (table mode)', () => {
  let container: HTMLElement;
  let rows: unknown[];

  beforeEach(() => {
    container = makeTableContainer();
    rows = makeRows(100);
  });

  it('creates top and bottom spacers on mount', () => {
    mountVirtualScroll(container, {
      rowHeight: 40, overscan: 5, mode: 'table', buildRow, buildCard, getRows: () => rows,
    });
    expect(container.querySelector('.tc-vs-top-spacer')).not.toBeNull();
    expect(container.querySelector('.tc-vs-bottom-spacer')).not.toBeNull();
  });

  it('top spacer is a <tr> element in table mode', () => {
    mountVirtualScroll(container, {
      rowHeight: 40, overscan: 5, mode: 'table', buildRow, buildCard, getRows: () => rows,
    });
    const spacer = container.querySelector('.tc-vs-top-spacer');
    expect(spacer?.tagName.toLowerCase()).toBe('tr');
  });

  it('sets initial spacer heights matching computeVisibleRange offsets', () => {
    mountVirtualScroll(container, {
      rowHeight: 40, overscan: 5, mode: 'table', buildRow, buildCard, getRows: () => rows,
    });
    const range = computeVisibleRange(0, 400, 100, 40);
    const top    = container.querySelector<HTMLElement>('.tc-vs-top-spacer');
    const bottom = container.querySelector<HTMLElement>('.tc-vs-bottom-spacer');
    expect(top?.style.height).toBe(`${range.offsetTop}px`);
    expect(bottom?.style.height).toBe(`${range.offsetBottom}px`);
  });

  it('renders initial visible rows as <tr data-idx>', () => {
    mountVirtualScroll(container, {
      rowHeight: 40, overscan: 5, mode: 'table', buildRow, buildCard, getRows: () => rows,
    });
    const trs = container.querySelectorAll('tr:not(.tc-vs-top-spacer):not(.tc-vs-bottom-spacer)');
    expect(trs.length).toBeGreaterThan(0);
    expect(trs.length).toBeLessThanOrEqual(15); // 10 visible + 5 overscan
  });

  it('update() with new rows replaces the visible window', () => {
    const newRows = makeRows(50);
    const ctrl = mountVirtualScroll(container, {
      rowHeight: 40, overscan: 5, mode: 'table',
      buildRow, buildCard,
      getRows: () => newRows,
    });
    ctrl.update({} as unknown as TableState);
    const range = computeVisibleRange(0, 400, 50, 40);
    const trs = container.querySelectorAll('tr:not(.tc-vs-top-spacer):not(.tc-vs-bottom-spacer)');
    expect(trs.length).toBe(range.end - range.start);
  });

  it('getCurrentRange() returns null before mount finishes -- then a range object', () => {
    // getCurrentRange() returns the range after the initial _patch()
    const ctrl = mountVirtualScroll(container, {
      rowHeight: 40, overscan: 5, mode: 'table', buildRow, buildCard, getRows: () => rows,
    });
    const range = ctrl.getCurrentRange();
    expect(range).not.toBeNull();
    expect(typeof range!.start).toBe('number');
    expect(typeof range!.end).toBe('number');
    expect(range!.end).toBeGreaterThanOrEqual(range!.start);
  });

  it('scrollToRow() calls container.scrollTo with correct top offset', () => {
    let lastScrollTo: ScrollToOptions | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (container as any).scrollTo = (opts: ScrollToOptions) => { lastScrollTo = opts; };

    const ctrl = mountVirtualScroll(container, {
      rowHeight: 40, overscan: 5, mode: 'table', buildRow, buildCard, getRows: () => rows,
    });
    ctrl.scrollToRow(25);
    expect(lastScrollTo?.top).toBe(25 * 40);
    expect(lastScrollTo?.behavior).toBe('smooth');
  });

  it('scrollToRow() respects explicit behavior parameter', () => {
    let lastScrollTo: ScrollToOptions | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (container as any).scrollTo = (opts: ScrollToOptions) => { lastScrollTo = opts; };

    const ctrl = mountVirtualScroll(container, {
      rowHeight: 40, overscan: 5, mode: 'table', buildRow, buildCard, getRows: () => rows,
    });
    ctrl.scrollToRow(10, 'instant');
    expect(lastScrollTo?.behavior).toBe('instant');
  });

  it('destroy() removes both spacers', () => {
    const ctrl = mountVirtualScroll(container, {
      rowHeight: 40, overscan: 5, mode: 'table', buildRow, buildCard, getRows: () => rows,
    });
    ctrl.destroy();
    expect(container.querySelector('.tc-vs-top-spacer')).toBeNull();
    expect(container.querySelector('.tc-vs-bottom-spacer')).toBeNull();
  });

  it('destroy() removes all data rows from the container', () => {
    const ctrl = mountVirtualScroll(container, {
      rowHeight: 40, overscan: 5, mode: 'table', buildRow, buildCard, getRows: () => rows,
    });
    ctrl.destroy();
    const trs = container.querySelectorAll('tr');
    expect(trs.length).toBe(0);
  });

  it('sets container overflowY to auto', () => {
    mountVirtualScroll(container, {
      rowHeight: 40, overscan: 5, mode: 'table', buildRow, buildCard, getRows: () => rows,
    });
    expect(container.style.overflowY).toBe('auto');
  });
});

// ---------------------------------------------------------------------------
// mountVirtualScroll -- card mode
// ---------------------------------------------------------------------------

describe('mountVirtualScroll (card mode)', () => {
  it('creates card-mode spacers as <div> elements', () => {
    const container = makeCardContainer();
    const rows = makeRows(100);
    mountVirtualScroll(container, {
      rowHeight: 80, overscan: 3, mode: 'card', buildRow, buildCard, getRows: () => rows,
    });
    const top    = container.querySelector('.tc-vs-top-spacer-card');
    const bottom = container.querySelector('.tc-vs-bottom-spacer-card');
    expect(top?.tagName.toLowerCase()).toBe('div');
    expect(bottom?.tagName.toLowerCase()).toBe('div');
  });

  it('renders card elements with class tc-card', () => {
    const container = makeCardContainer();
    const rows = makeRows(50);
    mountVirtualScroll(container, {
      rowHeight: 80, overscan: 3, mode: 'card', buildRow, buildCard, getRows: () => rows,
    });
    const cards = container.querySelectorAll('.tc-card');
    expect(cards.length).toBeGreaterThan(0);
  });

  it('destroy() removes .tc-card elements', () => {
    const container = makeCardContainer();
    const rows = makeRows(50);
    const ctrl = mountVirtualScroll(container, {
      rowHeight: 80, overscan: 3, mode: 'card', buildRow, buildCard, getRows: () => rows,
    });
    ctrl.destroy();
    expect(container.querySelectorAll('.tc-card').length).toBe(0);
    expect(container.querySelector('.tc-vs-top-spacer-card')).toBeNull();
    expect(container.querySelector('.tc-vs-bottom-spacer-card')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Variable-height guard
// ---------------------------------------------------------------------------

describe('mountVirtualScroll -- variable rowHeight guard', () => {
  it('throws when rowHeight is a function', () => {
    const container = makeTableContainer();
    expect(() =>
      mountVirtualScroll(container, {
        rowHeight: () => 40,
        mode: 'table', buildRow, buildCard, getRows: () => [],
      }),
    ).toThrow('variable rowHeight not yet supported');
  });
});

// ---------------------------------------------------------------------------
// 10k-row DOM node bound
// ---------------------------------------------------------------------------

describe('mountVirtualScroll -- DOM node bound with 10k rows', () => {
  it('never materialises more than ~22 elements in the container (spacers + window)', () => {
    const container = makeTableContainer();
    const rows = makeRows(10_000);
    mountVirtualScroll(container, {
      rowHeight: 40, overscan: 5, mode: 'table', buildRow, buildCard, getRows: () => rows,
    });
    // With viewport=400, rowHeight=40: visibleCount=10, window=10+2*5=20 data rows
    // Plus 2 spacer <tr> elements = 22 total
    const allTrs = container.querySelectorAll('tr');
    expect(allTrs.length).toBeLessThanOrEqual(22);
    // Report the actual count
    expect(allTrs.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// p95 < 50ms performance budget
// ---------------------------------------------------------------------------

describe('mountVirtualScroll -- scroll-patch p95 performance', () => {
  it('scroll patch p95 < 50ms with 1000 rows', () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    const container = document.createElement('div');

    let scrollPos = 0;
    Object.defineProperty(container, 'scrollTop',    { get: () => scrollPos, configurable: true });
    Object.defineProperty(container, 'clientHeight', { get: () => 400,       configurable: true });

    const ctrl = mountVirtualScroll(container, {
      rowHeight: 40, overscan: 5, mode: 'table',
      buildRow: (_row, idx) => {
        const tr = document.createElement('tr');
        tr.dataset.idx = String(idx);
        return tr as HTMLTableRowElement;
      },
      buildCard: () => document.createElement('div'),
      getRows: () => rows,
    });

    const timings: number[] = [];
    for (let step = 0; step < 100; step++) {
      scrollPos = (step / 100) * 40 * 1000;
      const t0 = performance.now();
      ctrl.update({ sortedRows: rows } as unknown as TableState);
      timings.push(performance.now() - t0);
    }

    const sorted = [...timings].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(0.95 * sorted.length)] ?? Infinity;
    expect(p95).toBeLessThan(50);
  });
});
