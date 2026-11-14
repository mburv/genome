import { expect, test, type Page } from '@playwright/test';
import pack from '../src/campaign/levels.generated.json' with { type: 'json' };
import { segmentCells } from '../src/engine/grid.ts';
import type { LevelDefinition } from '../src/engine/types.ts';
import { lettersAt, openLevel, rotated } from './helpers';

/**
 * Regression: rows/columns stopped dragging on iOS Safari. WebKit implicitly captures a touch pointer to the
 * touched tile; the board then re-captured it, the tile received `lostpointercapture` (it bubbles) and the
 * board treated that as a cancel before the first move. Chromium does not fire that event, so these tests
 * emulate WebKit's capture hand-over on top of genuine CDP touch input (touchstart → many touchmoves →
 * touchend, hasTouch/isMobile) and also check that the page never scrolls during a board gesture.
 */
const LEVELS = pack.levels as LevelDefinition[];

async function emulateWebKitImplicitCapture(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __capturedBy?: Element | null; __touchMoves: number; __touchMovesPrevented: number };
    w.__touchMoves = 0;
    w.__touchMovesPrevented = 0;
    document.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') w.__capturedBy = e.target as Element; }, true);
    const set = Element.prototype.setPointerCapture;
    Element.prototype.setPointerCapture = function (this: Element, id: number) {
      try { set.call(this, id); } catch { /* emulation only */ }
      const prev = w.__capturedBy;
      if (prev && prev !== this) {
        w.__capturedBy = this;
        queueMicrotask(() => prev.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: id, bubbles: true, pointerType: 'touch' })));
      }
    };
    // Read after the board's own (non-passive) listener has run.
    window.addEventListener('touchmove', (e) => { w.__touchMoves++; if (e.defaultPrevented) w.__touchMovesPrevented++; }, { passive: true });
  });
}

function segmentWith(def: LevelDefinition, axis: 'row' | 'col', min: number): number[] {
  for (let c = 0; c < 81; c++) {
    if (def.mask[c] !== '#') continue;
    const seg = segmentCells(def.mask, c, axis);
    if (seg[0] === c && seg.length >= min && new Set(seg.map((x) => def.initial[x])).size > 2) return seg;
  }
  throw new Error('no such segment');
}

/** Genuine multi-step touch drag through CDP (pointerType "touch"). */
async function realTouchDrag(page: Page, cell: number, dx: number, dy: number, steps = 12) {
  const box = (await page.locator(`[data-cell="${cell}"]`).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / steps, y: y + (dy * i) / steps }] });
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(80);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(300);
}

for (const vp of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test.describe(`real touch drag at ${vp.width}×${vp.height} (WebKit capture semantics)`, () => {
    test.use({ viewport: vp, hasTouch: true, isMobile: true });
    test.beforeEach(async ({ page }) => emulateWebKitImplicitCapture(page));

    for (const axis of ['row', 'col'] as const) {
      test(`a ${axis} drags with the finger, commits one move, and the page does not scroll`, async ({ page }) => {
        await openLevel(page, 2);
        const def = LEVELS[1]!;
        const seg = segmentWith(def, axis, 4);
        const tile = page.locator(`[data-cell="${seg[1]}"]`);
        await tile.scrollIntoViewIfNeeded();
        const scrollBefore = await page.evaluate(() => [window.scrollX, window.scrollY]);
        const before = await lettersAt(page, seg);
        await page.evaluate(() => { const w = window as unknown as { __touchMoves: number; __touchMovesPrevented: number }; w.__touchMoves = 0; w.__touchMovesPrevented = 0; });
        const box = (await tile.boundingBox())!;
        const pitch = axis === 'row' ? box.width + 1 : box.height + 1;
        await realTouchDrag(page, seg[1]!, axis === 'row' ? 2 * pitch + 4 : 0, axis === 'col' ? 2 * pitch + 4 : 0);
        await expect(page.getByTestId('moves')).toHaveText('1 move');
        expect(await lettersAt(page, seg)).toBe(rotated(before, 2));
        expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual(scrollBefore);
        const t = await page.evaluate(() => { const w = window as unknown as { __touchMoves: number; __touchMovesPrevented: number }; return { moves: w.__touchMoves, prevented: w.__touchMovesPrevented }; });
        expect(t.moves).toBeGreaterThan(8);
        expect(t.prevented).toBe(t.moves);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vp.width);
        // one drag = one undo
        await page.getByRole('button', { name: 'Undo' }).click();
        expect(await lettersAt(page, seg)).toBe(before);
      });
    }

    test('a vertical swipe that starts off the board still scrolls the page normally', async ({ page }) => {
      await openLevel(page, 2);
      const h = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
      test.skip(h < 40, 'page does not scroll at this size');
      const label = (await page.getByTestId('level-label').boundingBox())!;
      const board = (await page.getByTestId('board').boundingBox())!;
      expect(label.y + label.height).toBeLessThan(board.y);
      const cdp = await page.context().newCDPSession(page);
      const x = label.x + 5;
      const y = label.y + label.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * Math.min(15, (y - 4) / 10) }] }); await page.waitForTimeout(16); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    });
  });
}

test('mouse drag still slides a row (explicit capture for mouse/pen)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: false, isMobile: false });
  const page = await ctx.newPage();
  await openLevel(page, 2);
  const def = LEVELS[1]!;
  const seg = segmentWith(def, 'row', 4);
  const before = await lettersAt(page, seg);
  const box = (await page.locator(`[data-cell="${seg[1]}"]`).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x + ((box.width + 1) * i) / 10 + (i === 10 ? 3 : 0), y + 1);
  await page.mouse.up();
  await expect(page.getByTestId('moves')).toHaveText('1 move');
  expect(await lettersAt(page, seg)).toBe(rotated(before, 1));
  await ctx.close();
});
