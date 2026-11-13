import type { Page } from '@playwright/test';

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
