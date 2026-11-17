import { expect, test, type Locator } from '@playwright/test';
import { openChapter, readHint, dragBy, documentBox } from './helpers';

// The reserved envelope is tall enough for a replication pair, but must never
// display a second logical row of shorter chips beneath the first.
async function oneVisibleRow(panel: Locator): Promise<void> {
  const tops = await panel.locator('[data-clue-unit]:visible').evaluateAll(elements =>
    elements.map(el => el.getBoundingClientRect().top));
  expect(tops.length).toBeGreaterThan(0);
  // Unit faces of differing height can sit one pixel apart in the same flex row.
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(2);
}

test('replication consumes completed pairs without moving the board or controls', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openChapter(page, 'hbb-c07');
  const panel = page.getByTestId('target-panel');
  const pairs = panel.locator('.rep-pair');
  const pair5 = panel.locator('.rep-pair[data-clue-index="5"]');
  await expect(pairs).toHaveCount(6);
  await expect(panel.locator('.clue-pagination, [data-clue-next], [data-clue-back]')).toHaveCount(0);
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

test('queued Codon Crush clues advance automatically after the first row is completed', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openChapter(page, 'ins-c02');
  const panel = page.getByTestId('target-panel');
  const board = page.getByTestId('mechanics-board');
  const groups = panel.locator('.mixed-codon-clues .clue-part');
  await expect(groups).toHaveCount(4);
  await expect(groups.filter({ visible: true }).locator('.badge')).toHaveText(['1','2']);
  await expect(panel.locator('.clue-pagination, [data-clue-next], [data-clue-back]')).toHaveCount(0);
  await oneVisibleRow(panel);

  const beforePanel = await documentBox(panel);
  const beforeBoard = await documentBox(board);
  await page.getByTestId('lab-cell-12').tap();
  await page.getByTestId('lab-cell-13').tap();
  await expect(board).toHaveAttribute('data-crush-phase', 'idle');
  await expect(page.getByTestId('lab-progress')).toHaveText('2/4 block matches');
  await expect(groups.filter({ visible: true }).locator('.badge')).toHaveText(['3','4']);
  await oneVisibleRow(panel);
  expect(await documentBox(panel)).toEqual(beforePanel);
  expect(await documentBox(board)).toEqual(beforeBoard);

  await page.getByTestId('action-undo').click();
  await expect(groups.filter({ visible: true }).locator('.badge')).toHaveText(['1','2']);
  await oneVisibleRow(panel);
  expect(await documentBox(panel)).toEqual(beforePanel);
  expect(await documentBox(board)).toEqual(beforeBoard);
});

test('the responsive clue envelope remains one row wide on a large phone', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await openChapter(page, 'hbb-c07');
  await oneVisibleRow(page.getByTestId('target-panel'));
});