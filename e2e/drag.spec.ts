import { expect, test, type Page } from '@playwright/test';
import pack from '../src/campaign/levels.generated.json' with { type: 'json' };
import { segmentCells } from '../src/engine/grid.ts';
import type { LevelDefinition } from '../src/engine/types.ts';
import { cellPitch, expectSampleHeading, lettersAt, openLevel as open, rotated, touchDrag } from './helpers';

const LEVELS = pack.levels as LevelDefinition[];

/** First segment on `axis` with at least `min` cells whose letters are not all identical. */
function segmentWith(def: LevelDefinition, axis: 'row' | 'col', min: number): number[] {
  for (let c = 0; c < 81; c++) {
    if (def.mask[c] !== '#') continue;
    const seg = segmentCells(def.mask, c, axis);
    if (seg[0] === c && seg.length >= min && new Set(seg.map((x) => def.initial[x])).size > 2) return seg;
  }
  throw new Error('no such segment');
}

async function openLevel(page: Page, n: number) {
  await open(page, n);
  await expectSampleHeading(page, n);
}

test('horizontal touch drag across three cells commits one 3-step rotation (one move)', async ({ page }) => {
  await openLevel(page, 2);
  const def = LEVELS[1]!;
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

test('segment follows the finger live, wraps, and is clipped to its own cells mid-drag', async ({ page }) => {
  await openLevel(page, 2);
  const def = LEVELS[1]!;
  // a row segment bounded by holes (shorter than the row)
  const origin = [...def.mask].findIndex((ch, c) => ch === '#' && segmentCells(def.mask, c, 'row').length >= 2 && segmentCells(def.mask, c, 'row').length < 9);
  const seg = segmentCells(def.mask, origin, 'row');
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
  await openLevel(page, 2);
  const def = LEVELS[1]!;
  const seg = segmentWith(def, 'row', 9);
  const before = await lettersAt(page, seg);
  const p = await cellPitch(page);
  await touchDrag(page, seg[4]!, [{ dx: 2.2 * p, dy: 0 }, { dx: 0, dy: 0 }], { holdMs: 120 });
  await expect(page.getByTestId('moves')).toHaveText('0 moves');
  expect(await lettersAt(page, seg)).toBe(before);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

test('releasing between cells snaps to the nearest cell', async ({ page }) => {
  await openLevel(page, 2);
  const def = LEVELS[1]!;
  const seg = segmentWith(def, 'row', 9);
  const before = await lettersAt(page, seg);
  const p = await cellPitch(page);
  await touchDrag(page, seg[6]!, [{ dx: -1.62 * p, dy: 0 }], { holdMs: 150 });
  expect(await lettersAt(page, seg)).toBe(rotated(before, -2));
});

test('vertical touch drag rotates the column segment by two', async ({ page }) => {
  await openLevel(page, 3);
  const def = LEVELS[2]!;
  const seg = segmentWith(def, 'col', 6);
  const before = await lettersAt(page, seg);
  const p = await cellPitch(page);
  await touchDrag(page, seg[5]!, [{ dx: 1, dy: -2 * p - 4 }], { holdMs: 120 });
  await expect(page.getByTestId('moves')).toHaveText('1 move');
  expect(await lettersAt(page, seg)).toBe(rotated(before, -2));
});

test('a single-cell segment cannot be dragged on that axis', async ({ page }) => {
  for (const [i, def] of LEVELS.entries()) {
    const single = [...def.mask].findIndex((ch, c) => ch === '#' && segmentCells(def.mask, c, 'row').length === 1);
    if (single < 0) continue;
    await openLevel(page, i + 1);
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

test('target outline lights up live mid-drag before release (tutorial)', async ({ page }) => {
  await openLevel(page, 1);
  const cell = Number(await page.locator('.tile.selected').getAttribute('data-cell'));
  const dir = /dir-(\w+)/.exec((await page.getByTestId('hint-cue').getAttribute('class'))!)![1]!;
  const p = await cellPitch(page);
  const d = { up: { dx: 0, dy: -p }, down: { dx: 0, dy: p }, left: { dx: -p, dy: 0 }, right: { dx: p, dy: 0 } }[dir]!;
  await touchDrag(page, cell, [d], {
    holdMs: 100,
    beforeEnd: async () => {
      await expect(page.locator('.track-outline.all-ok')).toHaveCount(1);
      await expect(page.getByTestId('moves')).toHaveText('0 moves');
    },
  });
  await expect(page.getByTestId('win')).toBeVisible();
});
