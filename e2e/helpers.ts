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
