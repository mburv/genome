import { expect, test, type Locator } from '@playwright/test';
import { openChapter, readHint, dragBy, documentBox } from './helpers';

// The reserved envelope is tall enough for a replication pair, but must never
// display a second logical row of shorter chips beneath the first.
async function oneVisibleRow(panel: Locator): Promise<void> {
  const tops = await panel.locator('[data-clue-unit]:visible').evaluateAll(elements =>
    elements.map(el => Math.round(el.getBoundingClientRect().top)));
  expect(tops.length).toBeGreaterThan(0);
  expect(new Set(tops).size).toBe(1);
}

test('replication consumes completed pairs without moving the board or controls', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openChapter(page, 'hbb-c07');
  const panel = page.getByTestId('target-panel');
  const pairs = panel.locator('.rep-pair');
  const pair5 = panel.locator('.rep-pair[data-clue-index="5"]');
  await expect(pairs).toHaveCount(6);
  await oneVisibleRow(panel);

  const initial = await documentBox(panel);
  const board = await documentBox(page.getByTestId('board'));
  const toolbar = await documentBox(page.getByTestId('icon-row'));
  const hint = await readHint(page);
  await dragBy(page, hint.cell, hint.dir, hint.k);
  await expect(pair5).toHaveAttribute('data-clue-done', 'true');
  await expect(pair5).toBeHidden();
  await oneVisibleRow(panel);
  expect(await documentBox(panel)).toEqual(initial);
  expect(await documentBox(page.getByTestId('board'))).toEqual(board);
  expect(await documentBox(page.getByTestId('icon-row'))).toEqual(toolbar);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(pair5).toHaveAttribute('data-clue-done', 'false');
  await oneVisibleRow(panel);
  expect(await documentBox(panel)).toEqual(initial);
  expect(await documentBox(page.getByTestId('board'))).toEqual(board);
  expect(await documentBox(page.getByTestId('icon-row'))).toEqual(toolbar);
});

test('overflowing multi-base tracing clues advance into the single visible row', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openChapter(page, 'ins-c06');
  const panel = page.getByTestId('target-panel');
  const chips = panel.locator('[data-clue-unit]');
  await expect(chips).toHaveCount(9);
  await oneVisibleRow(panel);

  const visibleIndices = () => panel.locator('[data-clue-unit]:visible').evaluateAll(elements =>
    elements.map(el => Number(el.getAttribute('data-clue-index'))));
  const before = await visibleIndices();
  expect(before.length).toBeGreaterThan(0);
  expect(before.length).toBeLessThan(9);
  const board = await documentBox(page.getByTestId('mechanics-board'));
  const clue = await documentBox(panel);

  // Simulate a committed match without changing the board, so this tests
  // the shared clue-shell advancement independently from a mechanic's input.
  const first = before[0]!;
  await panel.locator('[data-clue-index="' + first + '"]').evaluate(el => {
    el.setAttribute('data-clue-done', 'true');
    window.dispatchEvent(new Event('resize'));
  });
  await expect(panel.locator('[data-clue-index="' + first + '"]')).toBeHidden();
  const after = await visibleIndices();
  expect(after.some(index => !before.includes(index))).toBe(true);
  await oneVisibleRow(panel);
  expect(await documentBox(panel)).toEqual(clue);
  expect(await documentBox(page.getByTestId('mechanics-board'))).toEqual(board);
});

test('the responsive clue envelope remains one row wide on a large phone', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await openChapter(page, 'hbb-c07');
  await oneVisibleRow(page.getByTestId('target-panel'));
});