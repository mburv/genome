import { expect, test, type Page } from '@playwright/test';
import {CAMPAIGN_LEVELS} from '../src/campaign/campaign.ts';
import {mechanicOf} from '../src/campaign/mixed.ts';
import { segmentCells } from '../src/engine/grid.ts';
import type { LevelDefinition } from '../src/engine/types.ts';
import { cellPitch, lettersAt, openChapter, rotated, touchDrag } from './helpers';

const SLIDES = CAMPAIGN_LEVELS.filter(l=>!l.tier&&!l.tutorial&&mechanicOf(l)==='slide');
const hasSegment=(def:LevelDefinition,axis:'row'|'col',min:number)=>[...def.mask].some((ch,c)=>ch==='#'&&segmentCells(def.mask,c,axis).length>=min&&new Set(segmentCells(def.mask,c,axis).map(x=>def.initial[x])).size>2);
const horizontal = SLIDES.find(l=>hasSegment(l,'row',9))!;
const vertical = SLIDES.find(l=>hasSegment(l,'col',6))!;

/** First segment on `axis` with at least `min` cells whose letters are not all identical. */
function segmentWith(def: LevelDefinition, axis: 'row' | 'col', min: number): number[] {
  for (let c = 0; c < 81; c++) {
    if (def.mask[c] !== '#') continue;
    const seg = segmentCells(def.mask, c, axis);
    if (seg[0] === c && seg.length >= min && new Set(seg.map((x) => def.initial[x])).size > 2) return seg;
  }
  throw new Error('no such segment');
}

async function openHorizontal(page: Page) {
  await openChapter(page, horizontal.id);
}
async function openVertical(page: Page) {
  await openChapter(page, vertical.id);
}

test('horizontal touch drag across three cells commits one 3-step rotation (one move)', async ({ page }) => {
  await openHorizontal(page);
  const def = horizontal;
  const seg = segmentWith(def, 'row', 9);
  expect(seg.length).toBe(9);
  const before = await lettersAt(page, seg);
  const p = await cellPitch(page);
  await touchDrag(page, seg[1]!, [{ dx: 3 * p + 6, dy: 2 }], { holdMs: 120 });
  await expect(page.getByTestId('moves')).toHaveText('1 move');
  expect(await lettersAt(page, seg)).toBe(rotated(before, 3));
  // one drag = one undo
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('moves')).toHaveText('0 moves');
  expect(await lettersAt(page, seg)).toBe(before);
});

async function openSlideWithShortMixedRow(page: Page): Promise<{ def: LevelDefinition; seg: number[] }> {
  for (const def of SLIDES) {
    for (let c = 0; c < 81; c++) {
      if (def.mask[c] !== '#') continue;
      const seg = segmentCells(def.mask, c, 'row');
      if (seg[0] !== c || seg.length < 2 || seg.length >= 9) continue;
      if (new Set(seg.map((x) => def.initial[x])).size < 2) continue;
      await openChapter(page, def.id);
      return { def, seg };
    }
  }
  throw new Error('no short mixed row in the sliding campaign');
}

test('segment follows the finger live, wraps, and is clipped to its own cells mid-drag', async ({ page }) => {
  const { def, seg } = await openSlideWithShortMixedRow(page);
  const before = await lettersAt(page, seg);
  const outside = [...Array(81).keys()].filter((c) => def.mask[c] === '#' && !seg.includes(c));
  const outsideBefore = await lettersAt(page, outside);
  const p = await cellPitch(page);
  const first = (await page.locator(`[data-cell="${seg[0]}"]`).boundingBox())!;
  const last = (await page.locator(`[data-cell="${seg[seg.length - 1]}"]`).boundingBox())!;
  const k = seg.length + 1; // drag further than the segment is long: wraps
  await touchDrag(page, seg[0]!, [{ dx: k * p, dy: 0 }], {
    holdMs: 100,
    beforeEnd: async () => {
      const clip = (await page.locator('.drag-clip').boundingBox())!;
      expect(Math.abs(clip.x - first.x)).toBeLessThan(1.5);
      expect(Math.abs(clip.x + clip.width - (last.x + last.width))).toBeLessThan(1.5);
      expect(await page.locator('.drag-clip > .tile').count()).toBe(seg.length * 2);
    },
  });
  await expect(page.locator('.drag-clip')).toHaveCount(0);
  expect(await lettersAt(page, seg)).toBe(rotated(before, k));
  expect(await lettersAt(page, outside)).toBe(outsideBefore);
  await expect(page.getByTestId('moves')).toHaveText('1 move');
});

test('dragging out and back to the origin in one gesture is a no-op (no move counted)', async ({ page }) => {
  await openHorizontal(page);
  const def = horizontal;
  const seg = segmentWith(def, 'row', 9);
  const before = await lettersAt(page, seg);
  const p = await cellPitch(page);
  await touchDrag(page, seg[4]!, [{ dx: 2.2 * p, dy: 0 }, { dx: 0, dy: 0 }], { holdMs: 120 });
  await expect(page.getByTestId('moves')).toHaveText('0 moves');
  expect(await lettersAt(page, seg)).toBe(before);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

test('releasing between cells snaps to the nearest cell', async ({ page }) => {
  await openHorizontal(page);
  const def = horizontal;
  const seg = segmentWith(def, 'row', 9);
  const before = await lettersAt(page, seg);
  const p = await cellPitch(page);
  await touchDrag(page, seg[6]!, [{ dx: -1.62 * p, dy: 0 }], { holdMs: 150 });
  expect(await lettersAt(page, seg)).toBe(rotated(before, -2));
});

test('vertical touch drag rotates the column segment by two', async ({ page }) => {
  await openVertical(page);
  const def = vertical;
  const seg = segmentWith(def, 'col', 6);
  const before = await lettersAt(page, seg);
  const p = await cellPitch(page);
  await touchDrag(page, seg[5]!, [{ dx: 1, dy: -2 * p - 4 }], { holdMs: 120 });
  await expect(page.getByTestId('moves')).toHaveText('1 move');
  expect(await lettersAt(page, seg)).toBe(rotated(before, -2));
});

test('a single-cell segment cannot be dragged on that axis', async ({ page }) => {
  for (const def of SLIDES) {
    const single = [...def.mask].findIndex((ch, c) => ch === '#' && segmentCells(def.mask, c, 'row').length === 1);
    if (single < 0) continue;
    await openChapter(page, def.id);
    const board = await page.locator('.board').innerText();
    const p = await cellPitch(page);
    await touchDrag(page, single, [{ dx: 2 * p, dy: 0 }], { holdMs: 80 });
    await expect(page.getByTestId('moves')).toHaveText('0 moves');
    expect(await page.locator('.board').innerText()).toBe(board);
    await expect(page.locator('.drag-clip')).toHaveCount(0);
    return;
  }
  test.skip(true, 'no single-cell row segment in the pinned levels');
});

test('target outline lights up live mid-drag before release (opening puzzle)', async ({ page }) => {
  await openChapter(page, 'ins-01');
  const cue = page.getByTestId('hint-cue');
  const cell = Number(await cue.getAttribute('data-hint-cell'));
  const dir = (await cue.getAttribute('data-hint-dir'))!;
  const k = Number(await cue.getAttribute('data-hint-k'));
  const p = await cellPitch(page);
  const d = { up: { dx: 0, dy: -k * p }, down: { dx: 0, dy: k * p }, left: { dx: -k * p, dy: 0 }, right: { dx: k * p, dy: 0 } }[dir]!;
  await touchDrag(page, cell, [d], {
    holdMs: 100,
    beforeEnd: async () => {
      await expect(page.locator('.track-outline')).toHaveCount(1);
      await expect(page.getByTestId('moves')).toHaveText('0 moves');
    },
  });
  await expect(page.getByTestId('moves')).toHaveText('1 move');
});
