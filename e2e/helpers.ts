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

/** Fresh device: clear storage; every launch lands on the title screen. */
export async function fresh(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('title-screen').waitFor();
}

export async function expectChapterHeading(page: Page, symbol: string, part: number, of: number, fullName: string): Promise<void> {
  await expect(page.getByTestId('play-title')).toHaveText(symbol);
  await expect(page.getByTestId('play-progress')).toHaveText(`${part}/${of}`);
  await expect(page.getByTestId('play-fullname')).toHaveText(fullName);
}

export async function expectOpeningHeading(page: Page): Promise<void> {
  await expectChapterHeading(page, 'INS', 1, 13, 'INSULIN');
}

/** Open the level map: Play on the title screen, or Settings → Map otherwise. */
export async function openMap(page: Page): Promise<void> {
  if (await page.getByTestId('level-map').isVisible({ timeout: 500 }).catch(() => false)) return;
  if (await page.getByTestId('title-screen').isVisible({ timeout: 500 }).catch(() => false)) {
    await page.getByTestId('title-play').click();
    await page.getByTestId('level-map').waitFor();
    return;
  }
  if (!(await page.getByTestId('settings').isVisible())) {
    await page.getByTestId('open-settings').click();
    await page.getByTestId('settings').waitFor();
  }
  await page.getByTestId('open-map').click();
  await page.getByTestId('level-map').waitFor();
}

/** Navigate to a chapter puzzle from an already-loaded session. */
export async function goToChapter(page: Page, id: string): Promise<void> {
  await openMap(page);
  await page.getByTestId(`cnode-${id}`).click();
  await page.getByTestId('board').waitFor();
}

/** Open a campaign puzzle through the title screen and the level map. */
export async function openChapter(page: Page, id: string): Promise<void> {
  await fresh(page);
  await goToChapter(page, id);
}

/** Ask for a hint; returns the cued tile and the drag (direction + cells) from the board cue. */
export async function readHint(page: Page): Promise<{ cell: number; dir: Dir; k: number }> {
  const button = page.getByRole('button', { name: 'Hint' });
  if (await button.getAttribute('aria-pressed') !== 'true') await button.click();
  const cue = page.getByTestId('hint-cue');
  await cue.waitFor();
  const dir = (await cue.getAttribute('data-hint-dir')) as Dir;
  const k = Number(await cue.getAttribute('data-hint-k'));
  const cell = Number(await cue.getAttribute('data-hint-cell'));
  if (!dir || !k || Number.isNaN(cell)) throw new Error(`no hint cue data: dir=${dir} k=${k} cell=${cell}`);
  return { cell, dir, k };
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
    schemaVersion: 7,
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

/** Seed localStorage with a completed level, launch (title), then Play to the map. */
export async function openCompleted(page: Page, raw: string): Promise<void> {
  await page.goto('/');
  await page.evaluate((value) => { localStorage.clear(); localStorage.setItem('genome-save', value); }, raw);
  await page.reload();
  await page.getByTestId('title-screen').waitFor();
  await page.getByTestId('title-play').click();
  await page.getByTestId('level-map').waitFor();
}
