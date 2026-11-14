import { expect, type Page } from '@playwright/test';
import { applyCommand, createInitialState, type PuzzleState } from '../src/engine/engine.ts';
import type { Axis, LevelDefinition } from '../src/engine/types.ts';
import m2Pack from '../src/campaign/levels.generated.json' with { type: 'json' };
import chapterPack from '../src/campaign/chapters.generated.json' with { type: 'json' };

// Built here (not via campaign.ts) so Playwright's ESM loader can apply the JSON import attribute.
const PACK = {
  campaignId: 'genome-m4-assembly',
  generatorVersion: m2Pack.generatorVersion,
  tokenGeneratorVersion: chapterPack.generatorVersion,
  catalogueId: chapterPack.catalogueId,
  datasets: { ...chapterPack.datasets, ...m2Pack.datasets },
};

/** Real touch swipe via CDP so the app receives pointer events of type "touch". */
export async function touchSwipe(page: Page, cell: number, dir: Dir, distance = 40): Promise<void> {
  const box = await page.locator(`[data-cell="${cell}"]`).boundingBox();
  if (!box) throw new Error(`cell ${cell} not visible`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const offsets: Record<Dir, [number, number]> = { left: [-distance, 0], right: [distance, 0], up: [0, -distance], down: [0, distance] };
  const [dx, dy] = offsets[dir];
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 4; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / 4, y: y + (dy * i) / 4 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(220);
}

export type Dir = 'left' | 'right' | 'up' | 'down';
export const dirOf = (m: { axis: 'row' | 'col'; direction: 1 | -1 }): Dir => (m.axis === 'row' ? (m.direction === 1 ? 'right' : 'left') : m.direction === 1 ? 'down' : 'up');

/** Low-level CDP touch session for multi-cell drags (start, many moves, optional hold, end). */
export async function touchDrag(
  page: Page,
  cell: number,
  path: { dx: number; dy: number }[],
  opts: { holdMs?: number; beforeEnd?: () => Promise<void> } = {},
): Promise<void> {
  const box = await page.locator(`[data-cell="${cell}"]`).boundingBox();
  if (!box) throw new Error(`cell ${cell} not visible`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  let last = { dx: 0, dy: 0 };
  for (const target of path) {
    for (let i = 1; i <= 8; i++) {
      const p = { dx: last.dx + ((target.dx - last.dx) * i) / 8, dy: last.dy + ((target.dy - last.dy) * i) / 8 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + p.dx, y: y + p.dy }] });
      await page.waitForTimeout(16);
    }
    last = target;
  }
  if (opts.holdMs) await page.waitForTimeout(opts.holdMs);
  if (opts.beforeEnd) await opts.beforeEnd();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(260);
}

/** Distance between neighbouring cell centres on the rendered board. */
export async function cellPitch(page: Page): Promise<number> {
  const a = (await page.locator('.board > .cell').nth(0).boundingBox())!;
  const b = (await page.locator('.board > .cell').nth(1).boundingBox())!;
  return b.x - a.x;
}

export async function lettersAt(page: Page, cells: number[]): Promise<string> {
  let out = '';
  for (const c of cells) out += (await page.locator(`[data-cell="${c}"]`).getAttribute('data-base')) ?? '?';
  return out;
}

/** Rotate a string as the engine does: old[i] -> new[(i + k) mod n]. */
export function rotated(s: string, k: number): string {
  const n = s.length;
  const out = new Array<string>(n);
  for (let i = 0; i < n; i++) out[(((i + k) % n) + n) % n] = s[i]!;
  return out.join('');
}

/** Fresh device: clear storage; first-time players land straight in level 1. */
export async function fresh(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('board').waitFor();
}

/** 1-based sample-campaign symbol and fraction, e.g. level 1 → INS / 1/6, level 7 → HBB / 1/6. */
export const sampleSymbol = (n: number): string => (n <= 6 ? 'INS' : 'HBB');
export const sampleProgress = (n: number): string => (n <= 6 ? `${n}/6` : `${n - 6}/6`);
export const sampleFullName = (n: number): string => (n <= 6 ? 'INSULIN' : 'HEMOGLOBIN SUBUNIT BETA');

export async function expectSampleHeading(page: Page, n: number): Promise<void> {
  await expect(page.getByTestId('play-title')).toHaveText(sampleSymbol(n));
  await expect(page.getByTestId('play-progress')).toHaveText(sampleProgress(n));
  await expect(page.getByTestId('play-fullname')).toHaveText(sampleFullName(n));
}

/** Open the level map, via Settings when the header Map button is absent. */
export async function openMap(page: Page): Promise<void> {
  if (await page.getByTestId('level-map').isVisible()) return;
  if (!(await page.getByTestId('settings').isVisible())) {
    await page.getByTestId('open-settings').click();
    await page.getByTestId('settings').waitFor();
  }
  await page.getByTestId('open-map').click();
  await page.getByTestId('level-map').waitFor();
}

/** Open level n (1-based) through the level map. */
export async function openLevel(page: Page, n: number): Promise<void> {
  await fresh(page);
  if (n === 1) return;
  await openMap(page);
  await page.getByRole('button', { name: new RegExp(`^Level ${n}: `) }).click();
  await page.getByTestId('board').waitFor();
}

/** Ask for a hint; returns the cued tile and the drag (direction + cells) from the status text. */
export async function readHint(page: Page): Promise<{ cell: number; dir: Dir; k: number }> {
  await page.getByRole('button', { name: 'Hint' }).click();
  await page.waitForFunction(() => !/Thinking/.test(document.querySelector('[data-testid="status"]')?.textContent ?? ''));
  const text = await page.getByTestId('status').innerText();
  const m = /Hint: drag (row|column) \d+ (left|right|up|down) (\d+) cells?/.exec(text);
  if (!m) throw new Error(`no hint in: ${text}`);
  const cell = Number(await page.locator('.tile.selected').getAttribute('data-cell'));
  return { cell, dir: m[2] as Dir, k: Number(m[3]) };
}

/** Perform one hinted drag with a real touch gesture of k cells. */
export async function dragBy(page: Page, cell: number, dir: Dir, k: number): Promise<void> {
  const p = await cellPitch(page);
  const d = { right: [k * p, 1], left: [-k * p, 1], down: [1, k * p], up: [1, -k * p] }[dir];
  await touchDrag(page, cell, [{ dx: d[0]!, dy: d[1]! }], { holdMs: 140 });
}

export async function solveWithHints(page: Page): Promise<number> {
  let drags = 0;
  for (let i = 0; i < 30; i++) {
    if (await page.getByTestId('win').isVisible()) return drags;
    const { cell, dir, k } = await readHint(page);
    await dragBy(page, cell, dir, k);
    drags++;
  }
  await page.getByTestId('win').waitFor();
  return drags;
}

/** Open Enzyme lab n (1-based) through the level map. */
export async function openLab(page: Page, n: number): Promise<void> {
  await fresh(page);
  await openMap(page);
  await page.getByRole('button', { name: new RegExp(`^Enzyme lab ${n}: `) }).click();
  await page.getByTestId('board').waitFor();
}

/** A valid v4 save with `levelId` already completed, a solved board, and a recorded best. */
export function completedLevelSave(def: LevelDefinition, opts: { lastMoves?: number; bestMoves?: number } = {}): { save: Record<string, unknown>; raw: string } {
  let s: PuzzleState = createInitialState(def);
  for (const slide of def.certificateSlides) s = applyCommand(def, s, { type: 'slide', ...slide }).state;
  if (s.status !== 'solved') throw new Error(`certificate did not solve ${def.id}`);
  const lastMoves = opts.lastMoves ?? s.moves;
  const bestMoves = opts.bestMoves ?? Math.min(lastMoves, s.moves);
  const save = {
    schemaVersion: 4,
    ...PACK,
    currentLevelId: def.id,
    completed: [def.id],
    discovered: [],
    assembled: [],
    attempts: { [def.id]: { ...s, moves: lastMoves } },
    legacy: { m1Completed: [] },
    settings: { reducedMotion: false, sound: false, haptics: true },
    best: { [def.id]: { moves: bestMoves, powersUsed: 0 } },
  };
  return { save, raw: JSON.stringify(save) };
}

/** One accepted slide from the initial scramble that does not win the level. */
export function aNonWinningSlide(def: LevelDefinition): { origin: number; axis: Axis; steps: 1 | -1 } {
  const start = createInitialState(def);
  for (let origin = 0; origin < 81; origin++) {
    if (def.mask[origin] !== '#') continue;
    for (const axis of ['row', 'col'] as const) {
      for (const steps of [1, -1] as const) {
        const r = applyCommand(def, start, { type: 'slide', origin, axis, steps });
        if (r.accepted && r.state.status !== 'solved') return { origin, axis, steps };
      }
    }
  }
  throw new Error(`no non-winning slide on ${def.id}`);
}

/** Seed localStorage with a completed level and open it (returning players land on the map). */
export async function openCompleted(page: Page, raw: string): Promise<void> {
  await page.goto('/');
  await page.evaluate((value) => { localStorage.clear(); localStorage.setItem('genome-save', value); }, raw);
  await page.reload();
  await page.getByTestId('level-map').waitFor();
}
