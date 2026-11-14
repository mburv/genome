import { expect, test } from '@playwright/test';
import { openChapter } from './helpers';

// Swiss redesign (D-UI-01): the board is full-bleed on phones, with 1px hairline gutters.
for (const vp of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 430, height: 932 }]) {
  test(`board runs edge to edge at ${vp.width}×${vp.height} with no horizontal overflow and maximal tiles`, async ({ page }) => {
    await page.setViewportSize(vp);
    await openChapter(page, 'ins-01');
    const m = await page.evaluate(() => {
      const b = document.querySelector('.board')!.getBoundingClientRect();
      const t = document.querySelector('.board > .cell')!.getBoundingClientRect();
      return { left: b.left, right: b.right, width: b.width, height: b.height, tile: t.width, tileH: t.height, scroll: document.documentElement.scrollWidth, inner: window.innerWidth };
    });
    expect(m.left).toBe(0);
    expect(m.right).toBe(vp.width);
    expect(m.scroll).toBeLessThanOrEqual(vp.width);
    // 9 tiles + 8 one-pixel gutters fill the width (tiles are square).
    expect(m.tile).toBeGreaterThanOrEqual((vp.width - 8) / 9 - 0.5);
    expect(Math.abs(m.tile - m.tileH)).toBeLessThan(0.5);
    // Clearly larger than the M4 inset board (37.5 px at 390, 27.5 px at 320).
    expect(m.tile).toBeGreaterThan(vp.width === 320 ? 34 : 41);
  });
}

test('clinical light theme: paper canvas, light theme-color, flat square tiles', async ({ page }) => {
  await openChapter(page, 'ins-01');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(247, 247, 245)');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f7f7f5');
  const tile = page.locator('.tile').first();
  expect(await tile.evaluate((e) => getComputedStyle(e).borderRadius)).toBe('0px');
});

test('a long-token chapter board is also full-bleed at 320px with no overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openChapter(page, 'hbb-c08');
  const r = await page.locator('.board').boundingBox();
  expect(r!.x).toBe(0);
  expect(Math.round(r!.width)).toBe(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
