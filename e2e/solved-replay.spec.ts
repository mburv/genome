import { expect, test } from '@playwright/test';
import pack from '../src/campaign/chapters.generated.json' with { type: 'json' };
import type { LevelDefinition } from '../src/engine/types.ts';
import { aNonWinningSlide, completedLevelSave, dirOf, openChapter, openCompleted, solveWithHints, touchSwipe } from './helpers';

const LEVELS = pack.levels as LevelDefinition[];
const def = LEVELS[0]!;

for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }] as const) {
  test(`completed level shows Solved and Replay at ${size.width}x${size.height}; replay keeps the best score`, async ({ page }) => {
    test.setTimeout(45_000);
    await page.setViewportSize(size);
    const { raw } = completedLevelSave(def, { lastMoves: 5, bestMoves: 2 });
    await openCompleted(page, raw);
    await page.getByTestId('cnode-ins-c01').click();
    await page.getByTestId('board').waitFor();

    const banner = page.getByTestId('solved-banner');
    await expect(banner).toBeVisible();
    await expect(banner.getByText('Solved', { exact: true })).toBeVisible();
    await expect(page.getByTestId('solved-result')).toContainText('5 moves');
    await expect(page.getByTestId('solved-result')).toContainText('Best 2');
    await expect(page.getByTestId('best')).toHaveText('Best 2');
    await expect(page.getByTestId('board')).toHaveClass(/solved/);
    await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next level →' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
    await expect(page.getByTestId('win')).toHaveCount(0);
    const box = (await banner.boundingBox())!;
    const board = (await page.getByTestId('board').boundingBox())!;
    expect(Math.abs((box.x + box.width / 2) - (board.x + board.width / 2))).toBeLessThanOrEqual(4);
    expect(Math.abs((box.y + box.height / 2) - (board.y + board.height / 2))).toBeLessThanOrEqual(4);

    await page.getByRole('button', { name: 'Replay' }).click();
    await expect(banner).toHaveCount(0);
    await expect(page.getByTestId('board')).not.toHaveClass(/solved/);
    await expect(page.getByTestId('moves')).toHaveText('0 moves');
    await expect(page.getByTestId('best')).toHaveText('Best 2');
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();

    const slide = aNonWinningSlide(def);
    await touchSwipe(page, slide.origin, dirOf({ axis: slide.axis, direction: slide.steps }));
    await expect(page.getByTestId('moves')).toHaveText('1 move');
    await expect(page.getByTestId('best')).toHaveText('Best 2');
    await expect(page.getByTestId('win')).toHaveCount(0);
    await expect(page.getByTestId('solved-banner')).toHaveCount(0);

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('genome-save')!));
    expect(stored.completed).toEqual([def.id]);
    expect(stored.best[def.id].moves).toBe(2);
  });
}

async function solveOpening(page: import('@playwright/test').Page) {
  await solveWithHints(page);
  await expect(page.getByTestId('win')).toBeVisible();
}

function boxesOverlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
}

for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }] as const) {
  test(`after solving, close reveals the Solved banner at ${size.width}x${size.height}; Replay then plays again`, async ({ page }) => {
    await page.setViewportSize(size);
    await openChapter(page, 'ins-01');
    await solveOpening(page);
    await expect(page.getByTestId('win')).not.toContainText('View board');
    await expect(page.getByRole('button', { name: 'View board', exact: true })).toHaveCount(0);
    const close = page.getByRole('button', { name: 'Close and view board' });
    await expect(close).toBeVisible();
    const closeBox = (await close.boundingBox())!;
    expect(closeBox.width).toBeGreaterThanOrEqual(44);
    expect(closeBox.height).toBeGreaterThanOrEqual(44);
    const title = (await page.locator('#win-title').boundingBox())!;
    expect(boxesOverlap(closeBox, title), 'close must not overlap the dialog title').toBe(false);
    if (size.width === 390) {
      await page.screenshot({ path: '/workspace/game/screenshots/genome-win-dialog-390x844.png', animations: 'disabled' });
    }
    await close.click();
    await expect(page.getByTestId('win')).toHaveCount(0);
    await expect(page.getByTestId('solved-banner')).toBeVisible();
    await expect(page.getByTestId('solved-result')).toContainText('1 move');
    await expect(page.getByTestId('best')).toHaveText('Best 1');
    await page.getByRole('button', { name: 'Replay' }).click();
    await expect(page.getByTestId('solved-banner')).toHaveCount(0);
    await expect(page.getByTestId('moves')).toHaveText('0 moves');
    await expect(page.getByTestId('best')).toHaveText('Best 1');
  });
}

test('after solving, Level map navigates to the map', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openChapter(page, 'ins-01');
  await solveOpening(page);
  await expect(page.getByRole('button', { name: 'View board', exact: true })).toHaveCount(0);
  await page.getByTestId('win-map').click();
  await expect(page.getByTestId('win')).toHaveCount(0);
  await expect(page.getByTestId('level-map')).toBeVisible();
});
