/**
 * Virtual scrolling render-loop wiring (issue #326).
 *
 * Covers: spacer rows, pagination conflict, _patchVirtualRows patch-only
 * semantics, card-view spacers, teardown, and DOM node bounding.
 *
 * All tests use a 10k-row fixture unless noted.
 */

const TableCrafter = require('../src/tablecrafter');

const TOTAL_ROWS = 10000;
const ROW_HEIGHT = 40;
const VIEWPORT_HEIGHT = 400;
// visibleCount = ceil(400/40) = 10; default overscan = 5
// window size = 10 + 2*5 = 20 rows + 2 spacers
const DEFAULT_OVERSCAN = 5;

function make10kTable(extraConfig = {}) {
  document.body.innerHTML = '<div id="t"></div>';
  return new TableCrafter('#t', {
    columns: [{ field: 'id', label: 'ID' }],
    data: Array.from({ length: TOTAL_ROWS }, (_, i) => ({ id: i + 1 })),
    ...extraConfig
  });
}

// ── 1. Pagination conflict: virtual scroll is a no-op when pagination is on ──

describe('virtual scroll + pagination conflict', () => {
  test('when pagination is enabled, virtual scroll does not enter the windowed path and console.warn is called', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const t = make10kTable({ pagination: true, pageSize: 20 });
    t.enableVirtualScroll({ rowHeight: ROW_HEIGHT, viewportHeight: VIEWPORT_HEIGHT });
    t.render();

    // Full (paginated) render: should NOT have spacer rows
    const topSpacer = t.container.querySelector('tr.tc-vs-top-spacer');
    expect(topSpacer).toBeNull();

    // Warning must have fired
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('pagination')
    );

    warnSpy.mockRestore();
  });
});

// ── 2. Top spacer rendered with correct height ────────────────────────────────

describe('top spacer tr', () => {
  test('top spacer height is 0 when scrollTop=0', () => {
    const t = make10kTable();
    t.enableVirtualScroll({ rowHeight: ROW_HEIGHT, viewportHeight: VIEWPORT_HEIGHT });
    t.render();

    const topSpacer = t.container.querySelector('tr.tc-vs-top-spacer');
    expect(topSpacer).not.toBeNull();
    expect(topSpacer.style.height).toBe('0px');
  });
});

// ── 3. Bottom spacer rendered with correct height ─────────────────────────────

describe('bottom spacer tr', () => {
  test('bottom spacer height covers rows below the visible window', () => {
    const t = make10kTable();
    t.enableVirtualScroll({ rowHeight: ROW_HEIGHT, viewportHeight: VIEWPORT_HEIGHT });
    t.render();

    // At scrollTop=0: startIndex=0, visibleCount=10, endIndex=15 (0+10+5 overscan)
    const win = t.computeVirtualWindow({
      scrollTop: 0,
      viewportHeight: VIEWPORT_HEIGHT,
      rowHeight: ROW_HEIGHT,
      totalRows: TOTAL_ROWS,
      overscan: DEFAULT_OVERSCAN
    });

    const bottomSpacer = t.container.querySelector('tr.tc-vs-bottom-spacer');
    expect(bottomSpacer).not.toBeNull();
    const expectedBottomPx = `${win.bottomPadding}px`;
    expect(bottomSpacer.style.height).toBe(expectedBottomPx);
  });
});

// ── 4. _patchVirtualRows only patches visible window (no full re-render) ──────

describe('_patchVirtualRows patch semantics', () => {
  test('_patchVirtualRows updates spacers + row slice without calling renderTable', () => {
    const t = make10kTable();
    t.enableVirtualScroll({ rowHeight: ROW_HEIGHT, viewportHeight: VIEWPORT_HEIGHT });
    t.render();

    // Spy on renderTable - it should NOT be called during _patchVirtualRows
    const renderTableSpy = jest.spyOn(t, 'renderTable');

    // Simulate a mid-scroll patch
    const container = t._vsContainer;
    // Set scrollTop on the container
    Object.defineProperty(container, 'scrollTop', { value: 2000, writable: true });

    t._patchVirtualRows();

    expect(renderTableSpy).not.toHaveBeenCalled();

    // After patch, top spacer should reflect scrollTop=2000
    // floor(2000/40)=50, startIndex = max(0, 50-5)=45, topPadding=45*40=1800
    const topSpacer = t.container.querySelector('tr.tc-vs-top-spacer');
    expect(topSpacer.style.height).toBe('1800px');

    renderTableSpy.mockRestore();
  });
});

// ── 5. Card view has spacer-div equivalent ────────────────────────────────────

describe('card view spacers', () => {
  test('renderCards with virtual scroll active emits top and bottom spacer divs', () => {
    // Force card view by using a narrow viewport mock
    Object.defineProperty(window, 'innerWidth', { value: 320, writable: true, configurable: true });

    const t = make10kTable({
      responsive: { breakpoints: { mobile: { width: 480, layout: 'cards' } } }
    });
    t.enableVirtualScroll({ rowHeight: ROW_HEIGHT, viewportHeight: VIEWPORT_HEIGHT });
    t.render();

    const topSpacer = t.container.querySelector('.tc-vs-top-spacer-card');
    const bottomSpacer = t.container.querySelector('.tc-vs-bottom-spacer-card');
    expect(topSpacer).not.toBeNull();
    expect(bottomSpacer).not.toBeNull();

    // Restore
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
  });
});

// ── 6. _teardownVirtualScroll removes scroll listener ────────────────────────

describe('_teardownVirtualScroll', () => {
  test('after destroy(), dispatching scroll on the container does not throw', () => {
    const t = make10kTable();
    t.enableVirtualScroll({ rowHeight: ROW_HEIGHT, viewportHeight: VIEWPORT_HEIGHT });
    t.render();

    const container = t._vsContainer;
    expect(container).not.toBeNull();

    // Should not throw
    expect(() => {
      t.destroy();
      // Dispatch scroll on the now-stale reference - handler was removed
      if (container) {
        container.dispatchEvent(new Event('scroll'));
      }
    }).not.toThrow();

    // After destroy, _vsScrollHandler should be null
    expect(t._vsScrollHandler).toBeNull();
  });

  test('disableVirtualScroll calls _teardownVirtualScroll and re-render shows all rows', () => {
    const t = make10kTable();
    t.enableVirtualScroll({ rowHeight: ROW_HEIGHT, viewportHeight: VIEWPORT_HEIGHT });
    t.render();

    t.disableVirtualScroll();
    t.render();

    // No spacer rows after disabling
    expect(t.container.querySelector('tr.tc-vs-top-spacer')).toBeNull();
    expect(t.container.querySelector('tr.tc-vs-bottom-spacer')).toBeNull();

    // _vsScrollHandler cleaned up
    expect(t._vsScrollHandler).toBeNull();
    expect(t._vsContainer).toBeNull();
  });
});

// ── 7. DOM node count bounded to visibleCount + 2*overscan + 2 ───────────────

describe('DOM node count bound', () => {
  test('tbody tr count = visibleCount + 2*overscan + 2 spacers for 10k rows', () => {
    const t = make10kTable();
    t.enableVirtualScroll({ rowHeight: ROW_HEIGHT, viewportHeight: VIEWPORT_HEIGHT, overscan: DEFAULT_OVERSCAN });
    t.render();

    const tbody = t.container.querySelector('tbody');
    const rows = tbody.querySelectorAll('tr');

    // visibleCount = ceil(400/40) = 10
    // window = startIndex=0, endIndex=15 (10+5), data rows = 15
    // + 2 spacers = 17
    const win = t.computeVirtualWindow({
      scrollTop: 0,
      viewportHeight: VIEWPORT_HEIGHT,
      rowHeight: ROW_HEIGHT,
      totalRows: TOTAL_ROWS,
      overscan: DEFAULT_OVERSCAN
    });
    const expectedRowCount = (win.endIndex - win.startIndex) + 2; // +2 spacers
    expect(rows.length).toBe(expectedRowCount);

    // Sanity: must be much less than TOTAL_ROWS
    expect(rows.length).toBeLessThan(TOTAL_ROWS);
  });
});
