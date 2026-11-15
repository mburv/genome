import { expect, test } from '@playwright/test';
import { completedLevelSave, openCompleted, openChapter, openMap, solveWithHints } from './helpers';
import m2 from '../src/campaign/levels.generated.json' with {type:'json'};
import type { LevelDefinition } from '../src/engine/types.ts';

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


test('HBB 14/15 completion card stays centered and contains all 96 bases and both actions', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await openChapter(page, 'hbb-c08');
  await solveWithHints(page);
  const win = page.getByTestId('win');
  const card = page.getByTestId('win-card');
  await expect(win).toBeVisible();
  await expect(win.getByTestId('win-meta')).toContainText('HBB 14/15 COMPLETE');
  await expect(win.locator('.win-strand .strip-cell')).toHaveCount(96);
  const assertBounds = async (width: number) => {
    const m = await card.evaluate(el => {
      const r = el.getBoundingClientRect();
      const css = getComputedStyle(el);
      const contentLeft = r.left + parseFloat(css.borderLeftWidth) + parseFloat(css.paddingLeft);
      const contentRight = r.right - parseFloat(css.borderRightWidth) - parseFloat(css.paddingRight);
      const children = Array.from(el.querySelectorAll('.win-strand .strip-cell, .card-actions button')).map(n => n.getBoundingClientRect());
      return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, viewport:window.innerHeight,
        paddingLeft:css.paddingLeft,paddingRight:css.paddingRight,overflow:el.scrollWidth-el.clientWidth,
        contentLeft,contentRight,childLeft:Math.min(...children.map(n=>n.left)),childRight:Math.max(...children.map(n=>n.right)) };
    });
    expect(m.left).toBeGreaterThanOrEqual(13.5);
    expect(width-m.right).toBeGreaterThanOrEqual(13.5);
    expect(Math.abs(m.left-(width-m.right))).toBeLessThanOrEqual(1);
    expect(m.paddingLeft).toBe(m.paddingRight);
    expect(m.top).toBeGreaterThanOrEqual(13.5);
    expect(m.bottom).toBeLessThanOrEqual(m.viewport-13.5);
    expect(m.overflow).toBeLessThanOrEqual(1);
    expect(m.childLeft).toBeGreaterThanOrEqual(m.contentLeft-1);
    expect(m.childRight).toBeLessThanOrEqual(m.contentRight+1);
    await expect(win.getByTestId('win-map')).toBeVisible();
    await expect(win.getByRole('button',{name:'Next level →'})).toBeVisible();
  };
  // The join animation must not widen the card; skip it to measure exact tile bounds.
  await win.locator('.win-strand').click();
  for(const vp of [{width:393,height:852},{width:320,height:568},{width:430,height:932},{width:568,height:320},{width:768,height:900}]){
    await page.setViewportSize(vp);
    await assertBounds(vp.width);
  }
  await page.setViewportSize({width:393,height:852});
  await win.getByRole('button',{name:'Next level →'}).click();
  await expect(page.getByTestId('play-progress')).toHaveText('15/15');
});

test('one numbered campaign map keeps completion ticks and ignores the retired classic URL',async({page})=>{
  const def=(m2.levels as LevelDefinition[]).find(l=>l.id==='ins-02')!;
  const {save}=completedLevelSave(def);
  const raw=JSON.stringify({...save,completed:['ins-01','ins-02']});
  await page.setViewportSize({width:320,height:568});
  await openCompleted(page,raw);
  await page.goto('/?classic=1');await openMap(page);
  await expect(page.getByTestId('classic-toggle')).toHaveCount(0);
  await expect(page.getByText('Use classic boards')).toHaveCount(0);
  await expect(page.locator('.node-mechanic,.cnode.play')).toHaveCount(0);
  await expect(page.locator('.cnode')).toHaveCount(413);
  const nodes=page.getByTestId('run-nodes-INS').locator('.cnode');
  await expect(nodes).toHaveCount(13);
  for(let i=0;i<13;i++)await expect(nodes.nth(i).locator('.node-number')).toHaveText(String(i+1));
  await expect(nodes.nth(0)).toHaveClass(/done/);
  await expect(nodes.nth(1)).toHaveClass(/done/);
  await expect(nodes.nth(1).locator('.node-check')).toHaveText('✓');
  await expect(nodes.nth(2).locator('.node-check')).toHaveCount(0);
  expect(await nodes.nth(1).evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe(await nodes.nth(2).evaluate(el=>getComputedStyle(el).backgroundColor));
  const bounds=await nodes.nth(1).evaluate(el=>{const r=el.getBoundingClientRect();return Array.from(el.children).every(c=>{const b=c.getBoundingClientRect();return b.left>=r.left&&b.right<=r.right&&b.top>=r.top&&b.bottom<=r.bottom;});});
  expect(bounds).toBe(true);
  await nodes.nth(1).click();
  await expect(page.getByTestId('mechanics-board')).toBeVisible();
  await expect(page.getByTestId('board')).toHaveCount(0);
  await expect(page.getByTestId('solved-banner')).toBeVisible();
  await page.getByTestId('replay').click();
  await expect(page.getByTestId('lab-progress')).toHaveText('2/9 bases');
  await openMap(page);await page.getByTestId('cnode-ins-c04').click();
  await expect(page.getByTestId('board')).toBeVisible();
  await expect(page.getByTestId('mechanics-board')).toHaveCount(0);
  await openMap(page);await page.getByTestId('cnode-ins-c06').click();
  await expect(page.getByTestId('mechanics-board')).toBeVisible();
  await expect(page.getByTestId('mixed-range')).toContainText('6-base blocks');
});
