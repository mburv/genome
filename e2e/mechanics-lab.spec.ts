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
  for (const [a,b] of [[12,13],[39,40],[66,67]] as const) { await tap(page,a); await tap(page,b); }
  await won(page);
});

test('Genome Assembly aligns overlapping reads on the board', async ({ page }) => {
  await openLab(page, 'assembly');
  for (const [read, slot] of [[1,67],[19,63],[37,65]] as const) { await tap(page,read); await tap(page,slot); }
  await won(page);
});

test('Mutation Detective repairs each complementary mismatch', async ({ page }) => {
  await openLab(page, 'mutation');
  for (const c of [20,23,48,74,78]) {
    const b = await tile(page,c-9).getAttribute('data-base');
    const comp = ({ A:'T',T:'A',C:'G',G:'C' } as Record<string,string>)[b!]!;
    await tap(page,c); await page.getByTestId('lab-base-' + comp).tap();
  }
  await won(page);
});

test('DNA Connections draws three noncrossing touch paths', async ({ page }) => {
  await openLab(page, 'connections');
  for (const path of [[1,2,3,4,5,6,7,16,25],[27,28,29,38,39,40,41,42,43,44,53],[55,64,73,74,75,76,77]]) await trace(page,path);
  await won(page);
});

test('Restriction Enzyme isolates the fragment, and replay clears the cuts', async ({ page }) => {
  await openLab(page, 'restriction');
  await tap(page,10); await tap(page,41);
  await won(page);
  await page.getByRole('button', { name: 'Replay', exact: true }).click();
  await expect(page.getByTestId('lab-progress')).toHaveText('0/2 cuts');
  await expect(page.getByTestId('lab-win')).toHaveCount(0);
});
