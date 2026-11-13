import { expect, test, type Page } from '@playwright/test';
import { touchSwipe, type Dir } from './helpers';

async function fresh(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByTestId('board')).toBeVisible();
}

/** Ask for a hint and return the selected tile + direction from the status text. */
async function readHint(page: Page): Promise<{ cell: number; dir: Dir }> {
  await page.getByRole('button', { name: 'Hint' }).click();
  const text = await page.getByTestId('status').innerText();
  const m = /Hint: swipe (row|column) \d+ (left|right|up|down)/.exec(text);
  if (!m) throw new Error(`no hint in: ${text}`);
  const cell = Number(await page.locator('.tile.selected').getAttribute('data-cell'));
  return { cell, dir: m[2] as Dir };
}

async function solveWithHints(page: Page) {
  for (let i = 0; i < 40; i++) {
    if (await page.getByTestId('win').isVisible()) return;
    const { cell, dir } = await readHint(page);
    await touchSwipe(page, cell, dir);
  }
  await expect(page.getByTestId('win')).toBeVisible();
}

for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
  test(`fits a small portrait viewport ${size.width}x${size.height} without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize(size);
    await fresh(page);
    const board = page.getByTestId('board');
    await expect(page.locator('.board > .cell')).toHaveCount(81);
    const box = (await board.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(size.width);
    expect(Math.abs(box.width - box.height)).toBeLessThan(2);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    // tiles are large enough to touch
    const tile = (await page.locator('.tile').first().boundingBox())!;
    expect(tile.width).toBeGreaterThanOrEqual(26);
    // board is not a page-scroll surface
    expect(await board.evaluate((el) => getComputedStyle(el).touchAction)).toBe('none');
  });
}

test('tutorial: one touch swipe on the cued tile completes level 1', async ({ page }) => {
  await fresh(page);
  await expect(page.getByTestId('hint-cue')).toBeVisible();
  const status = await page.getByTestId('status').innerText();
  expect(status).toMatch(/Swipe the glowing tile/);
  const cell = Number(await page.locator('.tile.selected').getAttribute('data-cell'));
  const cls = (await page.getByTestId('hint-cue').getAttribute('class'))!;
  const dir = /dir-(\w+)/.exec(cls)![1] as Dir;
  await touchSwipe(page, cell, dir);
  await expect(page.getByTestId('win')).toBeVisible();
  await expect(page.getByTestId('win')).toContainText('+9 INS coding bases');
  await expect(page.getByTestId('progress-text')).toContainText('9 / 27 sample bases');
  await expect(page.getByTestId('moves')).toHaveText('1 move');
});

test('swiping a hole does nothing; tap + arrow buttons and undo work', async ({ page }) => {
  await fresh(page);
  await page.getByRole('button', { name: /Level 2/ }).click();
  await expect(page.getByTestId('level-label')).toHaveText('Level 2 / 3');
  const hole = page.locator('.board > .hole').first();
  const hb = (await hole.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 40, hb.y + hb.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId('moves')).toHaveText('0 moves');

  const before = await page.locator('.board').innerText();
  const track = page.locator('.tile.goal').nth(2);
  await track.tap();
  await expect(track).toHaveClass(/selected/);
  await page.getByRole('button', { name: 'Slide row right' }).click();
  await expect(page.getByTestId('moves')).toHaveText('1 move');
  expect(await page.locator('.board').innerText()).not.toBe(before);
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('moves')).toHaveText('0 moves');
  expect(await page.locator('.board').innerText()).toBe(before);
});

test('keyboard: arrow keys slide the selected tile, Shift+arrow moves the selection', async ({ page }) => {
  await fresh(page);
  await page.getByRole('button', { name: /Level 2/ }).click();
  await page.locator('.tile.selected').focus();
  const sel0 = await page.locator('.tile.selected').getAttribute('data-cell');
  await page.keyboard.press('Shift+ArrowRight');
  const sel1 = await page.locator('.tile.selected').getAttribute('data-cell');
  expect(sel1).not.toBe(sel0);
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('moves')).toHaveText('1 move');
});

test('progression: all three levels can be completed with touch swipes and certified hints', async ({ page }) => {
  await fresh(page);
  for (let level = 1; level <= 3; level++) {
    await expect(page.getByTestId('level-label')).toHaveText(`Level ${level} / 3`);
    await solveWithHints(page);
    await expect(page.getByTestId('win')).toContainText('+9 INS coding bases');
    if (level < 3) await page.getByRole('button', { name: 'Next level →' }).click();
  }
  await expect(page.getByTestId('win')).toContainText('M1 demo complete: 27 of 333');
  await expect(page.getByTestId('win')).toContainText('not a fully assembled gene');
  await expect(page.getByTestId('progress-text')).toContainText('27 / 27 sample bases · 3/3 levels');
  // replay does not add duplicate credit
  await page.getByRole('button', { name: 'Replay' }).click();
  await expect(page.getByTestId('moves')).toHaveText('0 moves');
  await expect(page.getByTestId('progress-text')).toContainText('27 / 27 sample bases · 3/3 levels');
});

test('progress and the board in play survive a reload', async ({ page }) => {
  await fresh(page);
  const cell = Number(await page.locator('.tile.selected').getAttribute('data-cell'));
  const dir = /dir-(\w+)/.exec((await page.getByTestId('hint-cue').getAttribute('class'))!)![1] as Dir;
  await touchSwipe(page, cell, dir);
  await page.getByRole('button', { name: 'Next level →' }).click();
  await page.locator('.tile.goal').nth(1).tap();
  await page.getByRole('button', { name: 'Slide column down' }).click();
  await expect(page.getByTestId('moves')).toHaveText('1 move');
  const board = await page.locator('.board').innerText();
  await page.reload();
  await expect(page.getByTestId('level-label')).toHaveText('Level 2 / 3');
  await expect(page.getByTestId('moves')).toHaveText('1 move');
  expect(await page.locator('.board').innerText()).toBe(board);
  await expect(page.getByRole('button', { name: /Level 1: First swipe, complete/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
});

test('no runtime network requests beyond the local bundle', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => { if (!r.url().startsWith('http://127.0.0.1:4173') && !r.url().startsWith('data:')) external.push(r.url()); });
  await fresh(page);
  await page.waitForTimeout(300);
  expect(external).toEqual([]);
});
