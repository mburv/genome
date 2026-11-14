import { expect, test, type Page } from '@playwright/test';
import { fresh, openMap } from './helpers';

async function openLab(page: Page, id: string) {
  await fresh(page);
  await openMap(page);
  await page.getByTestId('open-mechanics').click();
  await expect(page.getByTestId('mechanics-menu')).toBeVisible();
  await page.getByTestId('mechanic-' + id).click();
  await expect(page.getByTestId('mechanics-board')).toBeVisible();
  await expect(page.locator('[data-lab-cell]')).toHaveCount(81);
}
const tile = (page: Page, c: number) => page.getByTestId('lab-cell-' + c);
async function tap(page: Page, c: number) { await tile(page, c).tap(); }
async function trace(page: Page, path: readonly number[]) {
  const cdp = await page.context().newCDPSession(page);
  const boxes = await Promise.all(path.map(c => tile(page, c).boundingBox()));
  const points = boxes.map(b => ({ x: b!.x + b!.width / 2, y: b!.y + b!.height / 2 }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]!] });
  for (const p of points.slice(1)) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] });
    await page.waitForTimeout(45);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
const won = async (page: Page) => { await expect(page.getByTestId('lab-win')).toBeVisible(); };

test('mechanics menu exposes six separate games and leaves campaign save untouched', async ({ page }) => {
  await fresh(page); await openMap(page);
  const before = await page.evaluate(() => localStorage.getItem('genome-save'));
  await page.getByTestId('open-mechanics').click();
  await expect(page.locator('.mechanic-entry')).toHaveCount(6);
  await page.getByTestId('mechanic-trace').click();
  await trace(page, [10,11,12,21,30,31,40,49,50]);
  await won(page);
  await page.getByRole('button', { name: 'Next mechanic' }).click();
  await expect(page.getByRole('heading', { name: 'Codon Crush' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('genome-save'))).toBe(before);
});

test('Codon Crush swaps, refills, and supports undo', async ({ page }) => {
  await openLab(page, 'crush');
  await trace(page, [12,13]);
  await expect(page.getByTestId('lab-progress')).toHaveText('1/3 codons');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('lab-progress')).toHaveText('0/3 codons');
  for (const [a,b] of [[12,13],[39,40],[66,67]] as const) { await tap(page,a); await tap(page,b); await expect(page.getByTestId('mechanics-board')).toHaveAttribute('data-crush-phase', 'idle'); }
  await won(page);
});

test('Genome Assembly aligns overlapping reads on the board', async ({ page }) => {
  await openLab(page, 'assembly');
  const reference = page.getByTestId('assembly-reference');
  await expect(reference.locator('span')).toHaveCount(9);
  expect(await reference.locator('span').evaluateAll(cells => cells.map(c => c.firstChild?.textContent).join(''))).toBe('ATGGCCCTG');
  await expect(reference.locator('.assembled-match')).toHaveCount(0);
  for (const [read, slot] of [[1,67],[19,63],[37,65]] as const) { await tap(page,read); await tap(page,slot); }
  await won(page);
  await expect(reference.locator('.assembled-match')).toHaveCount(9);
});

test('Mutation Detective repairs each complementary mismatch', async ({ page }) => {
  await openLab(page, 'mutation');
  const target = page.getByTestId('mutation-reference');
  await expect(target).toBeVisible();
  await expect(target.locator('.mutation-reference-row')).toHaveCount(3);
  await expect(target.locator('.mutation-target-base')).toHaveCount(21);
  await expect(target.locator('.mismatch')).toHaveCount(5);
  await expect(page.locator('.lab-cell.mutation-mismatch')).toHaveCount(5);
  // Compare every displayed target with the fixed reference strand directly above it.
  for (const c of [19,20,21,22,23,24,25,46,47,48,49,50,51,52,73,74,75,76,77,78,79]) {
    const ref = await tile(page,c-9).getAttribute('data-base');
    const want = ({ A:'T',T:'A',C:'G',G:'C' } as Record<string,string>)[ref!]!;
    await expect(page.getByTestId('mutation-target-' + c)).toHaveText(want);
  }
  for (const c of [20,23,48,74,78]) {
    const b = await tile(page,c-9).getAttribute('data-base');
    const comp = ({ A:'T',T:'A',C:'G',G:'C' } as Record<string,string>)[b!]!;
    await tap(page,c);
    await expect(page.getByTestId('mutation-selection')).toContainText('Target ' + comp);
    await page.getByTestId('lab-base-' + comp).tap();
    await expect(page.getByTestId('mutation-target-' + c)).toHaveClass(/matched/);
  }
  await won(page);
  await expect(target.locator('.matched')).toHaveCount(21);
  await expect(target.locator('.mismatch')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(target.locator('.mismatch')).toHaveCount(1);
});

test('DNA Connections draws three noncrossing touch paths', async ({ page }) => {
  await openLab(page, 'connections');
  const paths = [[1,2,3,4,5,6,7,16,25],[27,28,29,38,39,40,41,42,43,44,53],[55,64,73,74,75,76,77]];
  const color = (c: number) => tile(page,c).evaluate(el => getComputedStyle(el).backgroundColor);
  const colors = await Promise.all(paths.map(p => color(p[0]!)));
  expect(new Set(colors).size).toBe(3);
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i]!;
    const start = path[0]!, end = path.at(-1)!, middle = path[1]!;
    expect(await color(end)).toBe(colors[i]);
    expect(await color(middle)).not.toBe(colors[i]);
    await trace(page,path);
    await expect(tile(page,middle)).toHaveAttribute('data-connection-pair', String(i + 1));
    expect(await color(middle)).toBe(colors[i]);
  }
  await won(page);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('lab-progress')).toHaveText('2/3 pairs');
  // Re-start the third route: old path squares immediately lose their colour.
  await tap(page,55);
  await expect(tile(page,64)).not.toHaveAttribute('data-connection-pair', '3');
  expect(await color(64)).not.toBe(colors[2]);
});

test('Restriction Enzyme isolates the fragment, and replay clears the cuts', async ({ page }) => {
  await openLab(page, 'restriction');
  await tap(page,10); await tap(page,41);
  await won(page);
  await page.getByRole('button', { name: 'Replay', exact: true }).click();
  await expect(page.getByTestId('lab-progress')).toHaveText('0/2 cuts');
  await expect(page.getByTestId('lab-win')).toHaveCount(0);
});

test('Codon Crush follows a held finger and shows swap, clear and falling phases before committing', async ({ page }) => {
  await openLab(page, 'crush');
  const board = page.getByTestId('mechanics-board');
  const a = tile(page,12), b = tile(page,13);
  const aa = (await a.boundingBox())!, bb = (await b.boundingBox())!;
  const p = { x: aa.x + aa.width / 2, y: aa.y + aa.height / 2 };
  const end = { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x + (end.x - p.x) * .6, y: p.y }] });
  await expect(board).toHaveAttribute('data-crush-phase', 'drag');
  await expect(a).toHaveClass(/crush-moving/);
  await expect(b).toHaveClass(/crush-moving/);
  expect((await a.boundingBox())!.x).toBeGreaterThan(aa.x + 5);
  expect((await b.boundingBox())!.x).toBeLessThan(bb.x - 5);
  await expect(page.getByTestId('lab-progress')).toHaveText('0/3 codons');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(board).toHaveAttribute('data-crush-phase', 'swap');
  await expect(board).toHaveAttribute('data-crush-phase', 'clear');
  await expect(board.locator('.crush-clearing')).toHaveCount(3);
  await expect(board).toHaveAttribute('data-crush-phase', 'fall');
  await expect(board.locator('.crush-new')).toHaveCount(3);
  expect(await board.locator('.crush-falling:not(.crush-new)').count()).toBeGreaterThan(0);
  await expect(board).toHaveAttribute('data-crush-phase', 'idle');
  await expect(page.getByTestId('lab-progress')).toHaveText('1/3 codons');
  await cdp.detach();
});

test('Codon Crush rejected swap returns to the unchanged board; reduced motion skips stages', async ({ page }) => {
  await openLab(page, 'crush');
  const board = page.getByTestId('mechanics-board');
  const snapshot = () => board.locator('.lab-cell').evaluateAll(cells => cells.map(c => c.getAttribute('data-base')).join(''));
  const before = await snapshot();
  // Identical bases produce a rejected swap; choose a known nonmatching adjacent pair.
  await tap(page,10); await tap(page,11);
  await expect(board).toHaveAttribute('data-crush-phase', 'return');
  await expect(board).toHaveAttribute('data-crush-phase', 'idle');
  expect(await snapshot()).toBe(before);
  await expect(page.getByTestId('lab-progress')).toHaveText('0/3 codons');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await openMap(page); await page.getByTestId('open-mechanics').click(); await page.getByTestId('mechanic-crush').click();
  await tap(page,12); await tap(page,13);
  await expect(page.getByTestId('lab-progress')).toHaveText('1/3 codons');
  await expect(board).toHaveAttribute('data-crush-phase', 'idle');
});
