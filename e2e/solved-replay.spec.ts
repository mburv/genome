import { expect, test } from '@playwright/test';
import pack from '../src/campaign/levels.generated.json' with { type: 'json' };
import type { LevelDefinition } from '../src/engine/types.ts';
import { aNonWinningSlide, completedLevelSave, dirOf, fresh, openCompleted, touchSwipe } from './helpers';

const LEVELS = pack.levels as LevelDefinition[];
const def = LEVELS[0]!;

for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }] as const) {
  test(`completed level shows Solved and Replay at ${size.width}x${size.height}; replay keeps the best score`, async ({ page }) => {
    test.setTimeout(45_000);
    await page.setViewportSize(size);
    const { raw } = completedLevelSave(def, { lastMoves: 5, bestMoves: 2 });
    await openCompleted(page, raw);
    await page.getByRole('button', { name: /^Level 1: / }).click();
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

    if (size.width === 390) {
      await page.screenshot({ path: '/workspace/game/screenshots/genome-solved-replay-390x844.png' });
    }

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

test('after solving, View board reveals the Solved banner; Replay then plays again', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fresh(page);
  const cell = Number(await page.locator('.tile.selected').getAttribute('data-cell'));
  const dir = /dir-(\w+)/.exec((await page.getByTestId('hint-cue').getAttribute('class'))!)![1] as 'left' | 'right' | 'up' | 'down';
  await touchSwipe(page, cell, dir);
  await expect(page.getByTestId('win')).toBeVisible();
  await page.getByRole('button', { name: 'View board' }).click();
  await expect(page.getByTestId('win')).toHaveCount(0);
  await expect(page.getByTestId('solved-banner')).toBeVisible();
  await expect(page.getByTestId('solved-result')).toContainText('1 move');
  await expect(page.getByTestId('best')).toHaveText('Best 1');
  await page.getByRole('button', { name: 'Replay' }).click();
  await expect(page.getByTestId('solved-banner')).toHaveCount(0);
  await expect(page.getByTestId('moves')).toHaveText('0 moves');
  await expect(page.getByTestId('best')).toHaveText('Best 1');
});
