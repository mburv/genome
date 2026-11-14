import { expect, test } from '@playwright/test';
import pack from '../src/campaign/levels.generated.json' with { type: 'json' };
import type { LevelDefinition } from '../src/engine/types.ts';
import { completedLevelSave, fresh, openCompleted, openLevel } from './helpers';

const def = (pack.levels as LevelDefinition[])[0]!;

function assertCentred(banner: { x: number; y: number; width: number; height: number }, board: { x: number; y: number; width: number; height: number }) {
  const bcx = board.x + board.width / 2;
  const bcy = board.y + board.height / 2;
  const x = banner.x + banner.width / 2;
  const y = banner.y + banner.height / 2;
  expect(Math.abs(x - bcx)).toBeLessThanOrEqual(4);
  expect(Math.abs(y - bcy)).toBeLessThanOrEqual(4);
  expect(banner.x).toBeGreaterThanOrEqual(board.x - 0.5);
  expect(banner.x + banner.width).toBeLessThanOrEqual(board.x + board.width + 0.5);
  expect(banner.y).toBeGreaterThanOrEqual(board.y - 0.5);
  expect(banner.y + banner.height).toBeLessThanOrEqual(board.y + board.height + 0.5);
}

test('play header shows the current gene and locus; the info card is gone; Map lives in Settings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fresh(page);
  await expect(page.getByTestId('play-title')).toHaveText('INS · 1/6');
  await expect(page.getByTestId('play-locus')).toHaveText('CHROMOSOME 11 · NM_000207.3');
  await expect(page.getByRole('heading', { name: 'GENOME' })).toHaveCount(0);
  await expect(page.getByText('Build what makes you human')).toHaveCount(0);
  await expect(page.locator('.panel.info')).toHaveCount(0);
  await expect(page.getByTestId('level-label')).toHaveCount(0);
  await expect(page.getByTestId('mode-label')).toHaveCount(0);
  await expect(page.getByTestId('progress-text')).toHaveCount(0);
  await expect(page.getByTestId('open-map')).toHaveCount(0);
  const mark = await page.locator('h1').evaluate((el) => getComputedStyle(el, '::before').content);
  expect(mark === 'none' || mark === 'normal').toBe(true);
  // Heading and locus must fit the 320px-wide header area too; check after a resize later.
  await page.screenshot({ path: '/workspace/game/screenshots/genome-tidy-board-390x844.png' });

  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'GENOME' })).toBeVisible();
  await page.getByTestId('open-map').click();
  await expect(page.getByTestId('level-map')).toBeVisible();
});

test('heading stays compact at 320px and updates on the next gene', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openLevel(page, 7);
  await expect(page.getByTestId('play-title')).toHaveText('HBB · 1/6');
  await expect(page.getByTestId('play-locus')).toHaveText('CHROMOSOME 11 · NM_000518.5');
  const heading = (await page.getByTestId('play-heading').boundingBox())!;
  expect(heading.x).toBeGreaterThanOrEqual(0);
  expect(heading.x + heading.width).toBeLessThanOrEqual(320);
  const overflow = await page.getByTestId('play-heading').evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }] as const) {
  test(`Solved banner is centred over the board at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    const { raw } = completedLevelSave(def, { lastMoves: 5, bestMoves: 2 });
    await openCompleted(page, raw);
    await page.getByRole('button', { name: /^Level 1: / }).click();
    await page.getByTestId('board').waitFor();
    const banner = page.getByTestId('solved-banner');
    await expect(banner).toBeVisible();
    await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next level →' })).toBeVisible();
    const b = (await banner.boundingBox())!;
    const board = (await page.getByTestId('board').boundingBox())!;
    assertCentred(b, board);
    if (size.width === 390) {
      await page.screenshot({ path: '/workspace/game/screenshots/genome-tidy-solved-390x844.png' });
    }
  });
}
