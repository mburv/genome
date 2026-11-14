import { expect, test } from '@playwright/test';
import { completedLevelSave, fresh, openCompleted, openMap } from './helpers';
import pack from '../src/campaign/chapters.generated.json' with { type: 'json' };
import type { LevelDefinition } from '../src/engine/types.ts';

const LEVELS = pack.levels as LevelDefinition[];

test('launch shows the title screen; Play goes to the map', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fresh(page);
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await expect(page.getByTestId('title-wordmark')).toHaveText('GENOME');
  await expect(page.getByTestId('title-tag')).toHaveText('ASSEMBLE THE HUMAN GENOME');
  await expect(page.getByTestId('title-motif')).toBeVisible();
  await expect(page.getByTestId('board')).toHaveCount(0);
  await expect(page.getByTestId('level-map')).toHaveCount(0);
  const play = page.getByTestId('title-play');
  await expect(play).toBeVisible();
  await expect(play).toBeEnabled();
  await page.screenshot({ path: '/workspace/game/screenshots/genome-title-390x844.png', animations: 'disabled' });
  await play.focus();
  await expect(play).toBeFocused();
  await play.click();
  await expect(page.getByTestId('title-screen')).toHaveCount(0);
  await expect(page.getByTestId('level-map')).toBeVisible();
});

for (const vp of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }] as const) {
  test(`title screen fits ${vp.width}×${vp.height} without scrolling`, async ({ page }) => {
    await page.setViewportSize(vp);
    await fresh(page);
    await expect(page.getByTestId('title-screen')).toBeVisible();
    await expect(page.getByTestId('title-play')).toBeVisible();
    await expect(page.getByTestId('title-tag')).toHaveText('ASSEMBLE THE HUMAN GENOME');
    const overflow = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - window.innerWidth,
      y: document.documentElement.scrollHeight - window.innerHeight,
    }));
    expect(overflow.x).toBeLessThanOrEqual(0);
    expect(overflow.y).toBeLessThanOrEqual(1);
    const tag = (await page.getByTestId('title-tag').boundingBox())!;
    expect(tag.x).toBeGreaterThanOrEqual(0);
    expect(tag.x + tag.width).toBeLessThanOrEqual(vp.width);
    const play = (await page.getByTestId('title-play').boundingBox())!;
    expect(play.height).toBeGreaterThanOrEqual(44);
    expect(play.width).toBeGreaterThanOrEqual(44);
  });
}

test('Reset progress returns to the title screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { raw } = completedLevelSave(LEVELS[0]!);
  await openCompleted(page, raw);
  await expect(page.getByTestId('level-map')).toBeVisible();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('reset-progress').click();
  await page.getByTestId('reset-confirm-btn').click();
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await expect(page.getByTestId('title-play')).toBeVisible();
  await expect(page.getByTestId('level-map')).toHaveCount(0);
  await expect(page.getByTestId('settings')).toHaveCount(0);
  await openMap(page);
  await expect(page.getByTestId('level-map')).toBeVisible();
  await expect(page.getByTestId('continue')).toHaveText(/Start · INS 1\/13/);
  await expect(page.locator('.cnode.done')).toHaveCount(0);
});
