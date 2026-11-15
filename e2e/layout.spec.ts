import { expect, test } from '@playwright/test';
import { openChapter, solveWithHints } from './helpers';

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
    expect(m.scroll).toBeLessThanOrEqual(vp.width);
    expect(Math.abs(m.tile - m.tileH)).toBeLessThan(0.5);
    expect(Math.abs(m.width - m.height)).toBeLessThan(1);
    expect(m.left).toBeGreaterThanOrEqual(-0.5);
    expect(m.right).toBeLessThanOrEqual(vp.width + 0.5);
    // On short viewports the board may shrink so the clue cap can stay readable (D-UI-30);
    // it stays square, centred, and larger than the old M4 inset tiles (27.5 px at 320, 37.5 px at 390).
    if (vp.height >= 700) {
      expect(m.left).toBe(0);
      expect(m.right).toBe(vp.width);
      expect(m.tile).toBeGreaterThanOrEqual((vp.width - 8) / 9 - 0.5);
      expect(m.tile).toBeGreaterThan(41);
    } else {
      expect(Math.abs(m.left - (vp.width - m.right))).toBeLessThanOrEqual(1);
      expect(m.tile).toBeGreaterThan(27.5);
    }
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
  expect(r!.x).toBeGreaterThanOrEqual(0);
  expect(r!.x + r!.width).toBeLessThanOrEqual(320.5);
  expect(Math.abs(r!.width - r!.height)).toBeLessThan(1);
  expect(Math.abs(r!.x - (320 - (r!.x + r!.width)))).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test('long splice completion card stays inside a narrow phone and its actions remain reachable', async ({page})=>{
  await page.setViewportSize({width:320,height:568});
  await openChapter(page,'hbb-c08');
  await solveWithHints(page);
  const card=page.getByTestId('win').locator('.card');
  await expect(card).toBeVisible();
  const bounds=(await card.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x+bounds.width).toBeLessThanOrEqual(320);
  expect(await card.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
  await expect(page.getByTestId('win-map')).toBeInViewport();
  await expect(page.getByRole('button',{name:'Next level →'})).toBeInViewport();
});
