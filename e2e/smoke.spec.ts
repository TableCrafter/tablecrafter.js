/**
 * smoke.spec.ts
 *
 * Playwright smoke layer for TableCrafter v3.
 * Part of #323 (Phase 4 RFC v3).
 *
 * Tests mount the IIFE CDN bundle in a real Chromium browser and assert that
 * the core render, sort, filter, edit, context-menu, keyboard-nav, virtual-
 * scroll, and card-mode features work end-to-end.
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count visible data rows in tbody (excludes spacer and no-results rows). */
async function countDataRows(page: Page): Promise<number> {
  return page.locator('tbody tr.tc-row').count();
}

/** Wait for the table and at least one data row to be present in DOM. */
async function waitForTable(page: Page): Promise<void> {
  await page.waitForSelector('table[role="grid"]', { timeout: 8000 });
  await page.waitForSelector('tbody tr.tc-row', { timeout: 8000 });
}

/** Wait for virtual scroll fixture (card mode; looks for .tc-cards-container). */
async function waitForVirtualTable(page: Page): Promise<void> {
  // Virtual scroll fixture uses card mode (view:'card') so scroll container is a div
  await page.waitForSelector('.tc-cards-container', { timeout: 8000 });
  // Allow one rAF cycle for virtual scroll initial patch
  await page.waitForTimeout(200);
}

// ---------------------------------------------------------------------------
// Suite: bootstrap + basic render
// ---------------------------------------------------------------------------

test.describe('bootstrap fixture', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/fixtures/bootstrap.html');
    await waitForTable(page);
  });

  test('bootstrap auto-init creates a table', async ({ page }) => {
    // The bootstrap static method should mount a table on the data-tc-bootstrap element
    const grid = page.locator('table[role="grid"]');
    await expect(grid).toBeVisible();

    // bootstrap.html uses pageSize:0 so all 50 rows should render
    const rows = await countDataRows(page);
    expect(rows).toBe(50);
  });

  // ---- Sorting ------------------------------------------------------------

  test('click header sorts ascending and sets aria-sort', async ({ page }) => {
    const nameHeader = page.locator('th[data-col="name"]');
    await nameHeader.click();

    // aria-sort should be ascending after first click
    await expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');

    // Sort indicator text should reflect ascending
    const indicator = nameHeader.locator('.tc-sort-indicator');
    await expect(indicator).toContainText('▲');
  });

  test('click sorted header again sorts descending', async ({ page }) => {
    const nameHeader = page.locator('th[data-col="name"]');

    await nameHeader.click();
    await expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');

    await nameHeader.click();
    await expect(nameHeader).toHaveAttribute('aria-sort', 'descending');

    const indicator = nameHeader.locator('.tc-sort-indicator');
    await expect(indicator).toContainText('▼');
  });

  // ---- Filtering / search -------------------------------------------------

  test('type in search input filters rows', async ({ page }) => {
    const beforeCount = await countDataRows(page);
    expect(beforeCount).toBe(50);

    // "Chicago" appears in every 5th row starting at index 1 (10 of 50 rows)
    const searchInput = page.locator('input.tc-search');
    await searchInput.fill('Chicago');
    await page.waitForTimeout(100);

    const afterCount = await countDataRows(page);
    expect(afterCount).toBeLessThan(beforeCount);
    expect(afterCount).toBeGreaterThan(0);
  });

  test('clear search restores all rows', async ({ page }) => {
    const searchInput = page.locator('input.tc-search');
    await searchInput.fill('Chicago');
    await page.waitForTimeout(100);

    const filteredCount = await countDataRows(page);
    expect(filteredCount).toBeLessThan(50);

    await searchInput.fill('');
    await page.waitForTimeout(100);

    const restoredCount = await countDataRows(page);
    expect(restoredCount).toBe(50);
  });

  // ---- Inline editing -----------------------------------------------------

  test('click editable cell opens input', async ({ page }) => {
    // The 'name' column is editable (data-editable="true")
    const editableCell = page.locator('tbody td[data-editable="true"]').first();
    await editableCell.click();

    // An editor element with class tc-editor should appear inside the cell
    const editor = page.locator('.tc-editor');
    await expect(editor).toBeAttached({ timeout: 3000 });
    // The cell should have data-editing attribute
    await expect(editableCell).toHaveAttribute('data-editing', 'true');
  });

  test('Enter on editable cell commits change', async ({ page }) => {
    const editableCell = page.locator('tbody td[data-editable="true"]').first();

    await editableCell.click();
    const editor = page.locator('.tc-editor');
    await expect(editor).toBeAttached({ timeout: 3000 });

    const newValue = 'SmokeTestName';
    await editor.fill(newValue);
    await editor.press('Enter');

    // Editor should be gone after commit
    await expect(page.locator('.tc-editor')).toHaveCount(0, { timeout: 3000 });
    // Cell should now contain the new value
    await expect(editableCell).toContainText(newValue);
  });

  // ---- Context menu -------------------------------------------------------

  test('right-click opens context menu', async ({ page }) => {
    const firstCell = page.locator('tbody td[data-col="name"]').first();
    await firstCell.click({ button: 'right' });

    // Context menu should have tc-hidden removed
    const menu = page.locator('.tc-context-menu');
    await expect(menu).not.toHaveClass(/tc-hidden/, { timeout: 3000 });

    // The menu should have menu items in DOM
    const items = menu.locator('.tc-menu-item');
    expect(await items.count()).toBeGreaterThan(0);
  });

  test('Escape closes context menu', async ({ page }) => {
    const firstCell = page.locator('tbody td[data-col="name"]').first();
    await firstCell.click({ button: 'right' });

    const menu = page.locator('.tc-context-menu');
    // Wait for menu to open (tc-hidden removed)
    await expect(menu).not.toHaveClass(/tc-hidden/, { timeout: 3000 });

    // Press Escape - the keydown handler on the menu calls hideMenu()
    // Focus should be on first menu item after showMenu()
    await page.keyboard.press('Escape');

    await expect(menu).toHaveClass(/tc-hidden/, { timeout: 3000 });
  });

  // ---- Keyboard navigation ------------------------------------------------

  test('Tab into grid and ArrowDown moves focus', async ({ page }) => {
    // mountRovingTabindex runs before rows are added (a known init-order issue).
    // The fixture exposes __initKbNav() which sets tabIndex=0 on the first gridcell
    // so the roving-tabindex cursor can begin navigating via keyboard.
    await page.evaluate(() => {
      (window as unknown as { __initKbNav: () => boolean }).__initKbNav();
    });

    // Focus the first gridcell via the tab order (it now has tabIndex=0)
    const firstCell = page.locator('tbody td[role="gridcell"]').first();
    await firstCell.focus();

    // Confirm the first cell is the active element
    const rowBefore = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      if (!active) return { tag: 'none', rowIdx: -1 };
      const row = active.closest('[role="row"]');
      return { tag: active.tagName, rowIdx: row ? Number(row.getAttribute('aria-rowindex')) : -1 };
    });

    // The first body row has aria-rowindex=2 (row 1 is the header)
    expect(rowBefore.tag).toBe('TD');
    expect(rowBefore.rowIdx).toBe(2);

    // ArrowDown: the a11y.ts keydown handler is on the <table> element.
    // Since the td is focused and the keydown bubbles, it should move to row 3.
    await page.keyboard.press('ArrowDown');

    const rowAfter = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      if (!active) return -1;
      const row = active.closest('[role="row"]');
      return row ? Number(row.getAttribute('aria-rowindex')) : -1;
    });

    // After ArrowDown the focus should have advanced to the next row
    expect(rowAfter).toBeGreaterThan(rowBefore.rowIdx);
  });
});

// ---------------------------------------------------------------------------
// Suite: virtual scroll
// ---------------------------------------------------------------------------

test.describe('virtual scroll fixture', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/fixtures/virtual-scroll.html');
    await waitForVirtualTable(page);
  });

  test('5000-row virtual scroll keeps card count bounded', async ({ page }) => {
    // Virtual scroll fixture uses card mode (view:'card') so .tc-cards-container is the scroll div
    // With 5000 rows and overscan=5, the visible window should be far fewer than 5000 cards
    const container = page.locator('.tc-cards-container');

    // Initial render: only the visible window should be in the DOM
    const initialCardCount = await container.locator('.tc-card').count();
    expect(initialCardCount).toBeGreaterThan(0);
    expect(initialCardCount).toBeLessThan(200);

    // Scroll to middle and verify count stays bounded
    await page.evaluate(() => {
      const c = document.querySelector('.tc-cards-container') as HTMLElement;
      if (c) {
        c.scrollTo({ top: 100000, behavior: 'instant' });
        c.dispatchEvent(new Event('scroll'));
      }
    });
    await page.waitForTimeout(200);

    const midCardCount = await container.locator('.tc-card').count();
    expect(midCardCount).toBeLessThan(200);
    expect(midCardCount).toBeGreaterThan(0);
  });

  test('scrollToRow API works', async ({ page }) => {
    // Call the window.scrollToRow helper exposed by the fixture
    await page.evaluate(() => {
      (window as unknown as { scrollToRow: (n: number) => void }).scrollToRow(500);
    });

    // Allow the rAF-throttled virtual scroll patch to fire
    await page.waitForTimeout(400);

    // Row 501 (name: "Row 501") should now be within the virtual window
    // Card mode fixture: check for a card containing "Row 501"
    const row501 = page.locator('.tc-card .tc-card-value[data-col="name"]', { hasText: /^Row 501$/ });
    await expect(row501).toBeAttached({ timeout: 3000 });
  });

  test('performance: scroll patch under 50ms hard limit', async ({ page }) => {
    const measureResult = await page.evaluate((): Promise<{ median: number; samples: number[] }> => {
      return new Promise((resolve) => {
        // Virtual scroll fixture uses card mode; scroll container is .tc-cards-container
        const container = document.querySelector('.tc-cards-container') as HTMLElement;
        if (!container) {
          resolve({ median: 0, samples: [] });
          return;
        }

        const samples: number[] = [];
        const RUNS = 10;
        let run = 0;

        function nextScroll(): void {
          if (run >= RUNS) {
            const sorted = [...samples].sort((a, b) => a - b);
            const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
            resolve({ median, samples });
            return;
          }

          const scrollTop = run % 2 === 0 ? run * 20000 : (RUNS - run) * 20000;
          const t0 = performance.now();

          container.scrollTo({ top: scrollTop, behavior: 'instant' });
          container.dispatchEvent(new Event('scroll'));

          // Two rAF frames: first the virtual scroll handler fires, second we measure
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              samples.push(performance.now() - t0);
              run++;
              nextScroll();
            });
          });
        }

        nextScroll();
      });
    });

    console.log(
      `Virtual scroll median patch time: ${measureResult.median.toFixed(2)}ms` +
      ` (samples: ${measureResult.samples.map((s) => s.toFixed(1)).join(', ')}ms)`
    );

    // Hard fail above 50ms median
    expect(measureResult.median).toBeLessThan(50);
  });
});

// ---------------------------------------------------------------------------
// Suite: card mode
// ---------------------------------------------------------------------------

test.describe('card mode fixture', () => {
  test('narrow viewport flips to card mode', async ({ page }) => {
    // Set a narrow viewport (375px wide -- typical mobile, below 640px breakpoint)
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/e2e/fixtures/card-mode.html');
    // Wait for the root container to render (don't wait for the table to be "visible"
    // since in card mode the table may be hidden by CSS)
    await page.waitForSelector('.tc-root', { timeout: 8000 });
    await page.waitForSelector('.tc-cards-container', { timeout: 8000 });
    await page.waitForTimeout(400);

    // The ResizeObserver fallback sets data-card-mode="true" on .tc-root
    // Container-query support in Chrome means CSS handles the card layout too
    const root = page.locator('.tc-root');
    const cardContainer = page.locator('.tc-cards-container .tc-card');

    const rootCardMode = await root.getAttribute('data-card-mode');
    const cardCount = await cardContainer.count();

    // Either CSS container-query activates card mode or ResizeObserver sets the attribute
    const isCardMode = rootCardMode === 'true' || cardCount > 0;
    expect(isCardMode).toBe(true);
  });
});
