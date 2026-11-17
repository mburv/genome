import { expect, test, type Page } from '@playwright/test';
import { fresh, openMap, openChapter } from './helpers';
import { CAMPAIGN_LEVELS } from '../src/campaign/campaign.ts';
import { mechanicOf, mixedStage } from '../src/campaign/mixed.ts';
import { genomeStage } from '../src/campaign/bonus.ts';
import { DEFAULT_LAB_SPEC } from '../src/engine/mechanicsLab.ts';

async function openLab(page: Page, id: string) {
  await fresh(page);
  await openMap(page);
  await page.getByTestId('open-mechanics').click();
  await expect(page.getByTestId('mechanics-menu')).toBeVisible();
  await page.getByTestId('mechanic-' + id).click();
  await expect(page.getByTestId('mechanics-board')).toBeVisible();
  await expect(page.locator('[data-lab-cell]')).toHaveCount(81);
  await expect(page.getByTestId('play-title')).toHaveText('INS');
  await expect(page.getByTestId('play-progress')).toHaveText('PRACTICE');
  await expect(page.getByTestId('target-panel')).toBeVisible();
  await expect(page.getByTestId('icon-row')).toBeVisible();
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
const won = async (page: Page) => { await expect(page.getByTestId('win')).toBeVisible(); };

test('mechanics menu exposes six separate games and leaves campaign save untouched', async ({ page }) => {
  await fresh(page); await openMap(page);
  const before = await page.evaluate(() => localStorage.getItem('genome-save'));
  await page.getByTestId('open-mechanics').click();
  await expect(page.locator('.mechanic-entry')).toHaveCount(6);
  await page.getByTestId('mechanic-trace').click();
  await expect(page.getByTestId('lab-progress')).toHaveText('2/9 bases');
  await expect(page.getByTestId('moves')).toHaveText('0 moves');
  await trace(page, [11,12,21,30,31,40,49,50]);
  await won(page);
  await page.getByRole('button', { name: 'Next mechanic' }).click();
  await expect(page.getByTestId('target-panel').locator('.target-title')).toHaveText('Codon Crush');
  expect(await page.evaluate(() => localStorage.getItem('genome-save'))).toBe(before);
});

test('Codon Crush swaps, refills, and supports undo', async ({ page }) => {
  await openLab(page, 'crush');
  await expect(page.getByTestId('lab-message')).toHaveCount(0);
  await trace(page, [12,13]);
  await expect(page.getByTestId('mechanics-board')).toHaveAttribute('data-crush-phase','idle');
  await expect(page.getByTestId('lab-progress')).toHaveText('4/6 codons');
  await expect(page.getByTestId('lab-message')).toHaveCount(0);
  await expect(page.getByText(/tiles refilled|Chain reaction ×/)).toHaveCount(0);
  await expect(page.locator('.mixed-codon-clues .clue-part:visible .badge')).toHaveText(['5','6']);
  await expect(page.getByTestId('moves')).toHaveText('1 move');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('lab-progress')).toHaveText('0/6 codons');
  await expect(page.locator('.mixed-codon-clues .clue-part:visible .badge')).toHaveText(['1','2','3']);
  for (const [a,b] of [[12,13],[4,13]] as const) { await tap(page,a); await tap(page,b); await expect(page.getByTestId('mechanics-board')).toHaveAttribute('data-crush-phase', 'idle'); }
  await won(page);
});

test('Genome Assembly aligns overlapping reads on the board', async ({ page }) => {
  await openLab(page, 'assembly');
  await expect(page.getByTestId('lab-message')).toHaveCount(0);
  const reference = page.getByTestId('assembly-reference');
  await expect(reference.locator('span')).toHaveCount(9);
  expect(await reference.locator('span').evaluateAll(cells => cells.map(c => c.firstChild?.textContent).join(''))).toBe('ATGGCCCTG');
  await expect(reference.locator('.assembled-match')).toHaveCount(0);
  for (const [read, slot] of [[1,67],[19,63],[37,65]] as const) {
    await tap(page,read); await tap(page,slot);
    await expect(page.getByTestId('lab-message')).toHaveCount(0);
    await expect(page.getByText('Read placed. Align all three.',{exact:true})).toHaveCount(0);
  }
  await won(page);
  await expect(reference.locator('.assembled-match')).toHaveCount(9);
});

test('Mutation Correction repairs each complementary mismatch', async ({ page }) => {
  await openLab(page, 'mutation');
  await expect(page.getByTestId('target-panel').locator('.target-title')).toHaveText('Mutation Correction');
  await expect(page.locator('.mechanic-instructions')).toHaveCount(0);
  await expect(page.getByText('Target complementary strands · 3′ → 5′', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Green underline = correct · Red outline = needs repair', { exact: true })).toHaveCount(0);
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
    await expect(tile(page,c)).toHaveAttribute('aria-pressed','true');
    await expect(page.getByTestId('mutation-selection')).toHaveCount(0);
    await page.getByTestId('lab-base-' + comp).tap();
    await expect(page.getByTestId('mutation-target-' + c)).toHaveClass(/matched/);
  }
  await won(page);
  await page.getByTestId('win-close').click();
  await expect(target.locator('.matched')).toHaveCount(21);
  await expect(target.locator('.mismatch')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(target.locator('.mismatch')).toHaveCount(1);
});

test('DNA Connections draws three noncrossing touch paths', async ({ page }) => {
  await openLab(page, 'connections');
  await expect(page.getByTestId('lab-message')).toHaveCount(0);
  const paths = [[1,2,3,4,5,6,7,16,25],[27,28,29,38,39,40,41,42,43,44,53],[55,64,73,74,75,76,77]];
  const color = (c: number) => tile(page,c).evaluate(el => getComputedStyle(el).backgroundColor);
  const colors = await Promise.all(paths.map(p => color(p[0]!)));
  expect(new Set(colors).size).toBe(3);
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i]!;
    const start = path[0]!, end = path.at(-1)!, middle = path[1]!;
    await expect(tile(page,start)).toHaveAttribute('data-connection-pair', String(i + 1));
    expect(await color(end)).toBe(colors[i]);
    expect(await color(middle)).not.toBe(colors[i]);
    await trace(page,path);
    await expect(page.getByTestId('lab-message')).toHaveCount(0);
    await expect(tile(page,middle)).toHaveAttribute('data-connection-pair', String(i + 1));
    expect(await color(middle)).toBe(colors[i]);
  }
  await won(page);
  await page.getByTestId('win-close').click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('lab-progress')).toHaveText('2/3 pairs');
  // Re-start the third route: old path squares immediately lose their colour.
  await tap(page,55);
  await expect(page.getByTestId('lab-message')).toHaveCount(0);
  await expect(tile(page,64)).not.toHaveAttribute('data-connection-pair', '3');
  expect(await color(64)).not.toBe(colors[2]);
});

test('Restriction Enzyme isolates the fragment, and replay clears the cuts', async ({ page }) => {
  await openLab(page, 'restriction');
  const target = page.getByTestId('restriction-target');
  const chips = target.locator('.restriction-target-base');
  await expect(chips).toHaveCount(29);
  expect(await chips.allTextContents()).toEqual([... 'CCCTGGTGCAGGCAGCCTGCAGCCCTTGG']);
  for (const base of ['A', 'C', 'G', 'T']) {
    const chip = target.locator('[data-base="' + base + '"]').first();
    const tile = page.locator('.mechanics-board .lab-cell[data-base="' + base + '"]').first();
    const style = (el: Element) => ({ background: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderTopColor });
    expect(await chip.evaluate(style)).toEqual(await tile.evaluate(style));
    await expect(chip).toHaveCSS('font-size', '12px');
  }
  const noText=async()=>await expect(page.locator('.lab-hint,[data-testid="lab-message"]')).toHaveCount(0);
  const hint=page.getByTestId('action-hint'), suggested=page.locator('.restriction-hinted');
  await noText();
  await hint.click();
  await expect(suggested).toHaveAttribute('data-lab-cell','10');
  expect(await suggested.evaluate(el=>getComputedStyle(el,'::after').backgroundImage)).toContain('repeating-linear-gradient');
  await tap(page,10);
  await expect(page.getByTestId('lab-progress')).toHaveText('1/2 cuts');
  await noText();
  await expect(suggested).toHaveAttribute('data-lab-cell','41');
  await page.getByTestId('action-undo').click();
  await expect(suggested).toHaveAttribute('data-lab-cell','10');
  await tap(page,10); await tap(page,41);
  await noText();
  await expect(suggested).toHaveCount(0);
  await won(page);
  await page.getByTestId('win-close').click();
  await page.getByTestId('replay').click();
  await expect(page.getByTestId('lab-progress')).toHaveText('0/2 cuts');
  await expect(page.getByTestId('win')).toHaveCount(0);
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
  await expect(page.getByTestId('lab-progress')).toHaveText('0/6 codons');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(board).toHaveAttribute('data-crush-phase', 'swap');
  await expect(board).toHaveAttribute('data-crush-phase', 'clear');
  await expect(board.locator('.crush-clearing')).toHaveCount(3);
  await expect(board).toHaveAttribute('data-crush-phase', 'fall');
  await expect(board.locator('.crush-new')).toHaveCount(3);
  expect(await board.locator('.crush-falling:not(.crush-new)').count()).toBeGreaterThan(0);
  await expect(board).toHaveAttribute('data-crush-chain','2');
  await expect(board).toHaveAttribute('data-crush-phase', 'idle');
  await expect(page.getByTestId('lab-progress')).toHaveText('4/6 codons');
  await expect(page.getByTestId('moves')).toHaveText('1 move');
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
  await expect(page.getByTestId('lab-progress')).toHaveText('0/6 codons');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await openMap(page); await page.getByTestId('open-mechanics').click(); await page.getByTestId('mechanic-crush').click();
  await tap(page,12); await tap(page,13);
  await expect(page.getByTestId('lab-progress')).toHaveText('4/6 codons');
  await expect(board).toHaveAttribute('data-crush-phase', 'idle');
});


test('Mutation Correction retains the shared board and usable controls on a short phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openLab(page, 'mutation');
  const board = page.getByTestId('mechanics-board');
  const bounds = (await board.boundingBox())!;
  expect(bounds.width).toBe(320);
  expect(bounds.x).toBe(0);
  expect(Math.abs(bounds.width - bounds.height)).toBeLessThan(2);
  await expect(page.getByTestId('mutation-reference').locator('.mutation-target-base')).toHaveCount(21);
  await expect(page.getByTestId('lab-base-A')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  await tap(page, 20);
  await expect(tile(page,20)).toHaveAttribute('aria-pressed','true');
  await expect(page.getByTestId('mutation-selection')).toHaveCount(0);
});


test('Genome Assembly greys only placed source reads and restores them on undo or restart', async ({ page }) => {
  await openLab(page, 'assembly');
  const board=page.getByTestId('mechanics-board');
  const placed=board.locator('.assembly-placed');
  const source=tile(page,1);
  const original=await source.evaluate(el=>getComputedStyle(el).backgroundColor);
  await expect(placed).toHaveCount(0);
  await tap(page,1);
  await expect(placed).toHaveCount(0);
  await tap(page,71); // five-base read cannot fit at slot nine
  await expect(placed).toHaveCount(0);
  await trace(page,[1,67]);
  await expect(placed).toHaveCount(5);
  for(const c of [1,2,3,4,5]){
    await expect(tile(page,c)).toHaveAttribute('data-read-placed','true');
    await expect(tile(page,c)).toHaveCSS('background-color','rgb(232, 232, 228)');
  }
  await expect(source).toHaveAttribute('aria-label',/placed at slot 5/);
  await expect(tile(page,19)).toHaveAttribute('data-read-placed','false');
  await expect(board.locator('.assembly-slot.assembly-placed')).toHaveCount(0);
  await expect(tile(page,67)).toHaveAttribute('data-base','C');
  await expect(tile(page,67)).toHaveCSS('background-color','rgb(207, 225, 243)');
  await page.getByTestId('action-undo').click();
  await expect(placed).toHaveCount(0);
  await expect(source).toHaveCSS('background-color',original);
  await tap(page,1);await tap(page,67);
  await tap(page,19);await tap(page,63);
  await expect(placed).toHaveCount(10);
  await page.getByTestId('action-restart').click();
  await expect(placed).toHaveCount(0);
  await expect(page.getByTestId('lab-progress')).toHaveText('0/3 reads');
});


test('Mutation Correction hints highlight a mismatched square and its correct base without text', async ({page}) => {
  await openLab(page,'mutation');
  const board=page.getByTestId('mechanics-board'), hint=page.getByTestId('action-hint');
  const square=board.locator('.mutation-hinted'), replacement=page.locator('.mutation-base-hinted');
  const noText=async()=>await expect(page.locator('.lab-hint,[data-testid="lab-message"],[data-testid="mutation-selection"]')).toHaveCount(0);
  const at=async(c:number)=>{
    await expect(square).toHaveCount(1);
    await expect(tile(page,c)).toHaveClass(/mutation-hinted/);
    await expect(tile(page,c)).toHaveClass(/mutation-mismatch/);
    await expect(tile(page,c)).toHaveAttribute('aria-pressed','true');
    await expect(tile(page,c)).toHaveCSS('outline-color','rgb(42, 110, 79)');
    const want=await page.getByTestId('mutation-target-'+c).textContent();
    await expect(replacement).toHaveCount(1);
    await expect(replacement).toHaveText(want!);
    await expect(replacement).toHaveCSS('outline-color','rgb(42, 110, 79)');
    await expect(replacement).toBeEnabled();
    await noText();
  };
  await noText();await expect(square).toHaveCount(0);
  await hint.click();await at(20);
  await tap(page,23);await at(23);
  await replacement.tap();await at(20);
  await replacement.tap();await at(48);
  await page.getByTestId('action-undo').click();await at(20);
  await tap(page,19);await at(20); // a correct base must not steal the repair cue
  await hint.click();await expect(square).toHaveCount(0);await expect(replacement).toHaveCount(0);await noText();
  await hint.click();await at(20);
  await page.getByTestId('action-restart').click();await at(20);
  for(const c of [20,23,48,74,78]){await at(c);await replacement.tap();}
  await won(page);await expect(square).toHaveCount(0);await expect(replacement).toHaveCount(0);await noText();
});


test('DNA Connections graphical hints follow routes and recover without written hints',async({page})=>{
  await openLab(page,'connections');
  const board=page.getByTestId('mechanics-board'), dashed=board.locator('.connection-hinted');
  const hint=page.getByTestId('action-hint');
  const at=async(c:number)=>{
    await expect(dashed).toHaveCount(1);
    await expect(tile(page,c)).toHaveClass(/connection-hinted/);
    expect(await dashed.evaluate(el=>getComputedStyle(el,'::after').backgroundImage)).toContain('repeating-linear-gradient');
    await expect(page.locator('.lab-hint')).toHaveCount(0);
  };
  await expect(dashed).toHaveCount(0);await hint.click();await at(1);
  await tap(page,1);await at(2);
  await tap(page,27);await at(28);
  await tap(page,28);await at(29);
  await hint.click();await expect(dashed).toHaveCount(0);
  await hint.click();await at(29);
  await page.getByTestId('action-undo').click();await at(2);
  await page.getByTestId('action-restart').click();await at(1);
  for(const c of [1,2,3,4,5,6,15,24])await tap(page,c);
  await at(25);await tap(page,25);await at(27);
  for(const c of [27,28,29,38,39,40,41,42,43,44,53])await tap(page,c);
  await at(55);
  for(const c of [55,64,73,74,75,76,77])await tap(page,c);
  await won(page);await expect(dashed).toHaveCount(0);
});


test('Codon Crush hints show two dashed swap tiles and update after animations',async({page})=>{
  await openLab(page,'crush');
  const board=page.getByTestId('mechanics-board'), hint=page.getByTestId('action-hint');
  const dashed=board.locator('.crush-hinted'), arrow=board.getByTestId('crush-hint-arrow');
  const at=async(a:number,b:number)=>{
    await expect(dashed).toHaveCount(2);
    await expect(tile(page,a)).toHaveClass(/crush-hinted/);
    await expect(tile(page,b)).toHaveClass(/crush-hinted/);
    expect(await tile(page,a).evaluate(el=>getComputedStyle(el,'::after').backgroundImage)).toContain('repeating-linear-gradient');
    expect(await tile(page,b).evaluate(el=>getComputedStyle(el,'::after').backgroundImage)).toContain('repeating-linear-gradient');
    await expect(arrow).toBeVisible();
    await expect(page.locator('.lab-hint')).toHaveCount(0);
  };
  await expect(dashed).toHaveCount(0);
  await hint.click();await at(12,13);
  await hint.click();await expect(dashed).toHaveCount(0);await expect(arrow).toHaveCount(0);
  await hint.click();await at(12,13);
  await tap(page,12);await at(12,13);
  await tap(page,13);
  await expect(board).toHaveAttribute('data-crush-phase','idle');
  await at(4,13);
  await expect(hint).toHaveAttribute('aria-pressed','true');
  await page.getByTestId('action-undo').click();await at(12,13);
  await trace(page,[12,13]);await expect(board).toHaveAttribute('data-crush-phase','idle');await at(4,13);
  await page.getByTestId('action-restart').click();await at(12,13);
  for(const [a,b] of [[12,13],[4,13]] as const){await at(a,b);await tap(page,a);await tap(page,b);await expect(board).toHaveAttribute('data-crush-phase','idle');}
  await won(page);await expect(dashed).toHaveCount(0);await expect(arrow).toHaveCount(0);
});


test('Genome Assembly hint shows the next read and destination, updates on undo and toggles off',async({page})=>{
  await openLab(page,'assembly');
  const source=page.locator('.assembly-hint-source'), destination=page.locator('.assembly-hint-destination');
  const hint=page.getByTestId('action-hint');
  await hint.click();
  await expect(source).toHaveAttribute('data-lab-cell','1');
  await expect(destination).toHaveAttribute('data-lab-cell','67');
  expect(await source.evaluate(el=>getComputedStyle(el,'::after').backgroundImage)).toContain('repeating-linear-gradient');
  await expect(destination).toHaveCSS('outline-style','solid');
  await expect(page.locator('.lab-hint')).toHaveCount(0);
  await tap(page,19);
  await expect(source).toHaveAttribute('data-lab-cell','19');
  await expect(destination).toHaveAttribute('data-lab-cell','63');
  await tap(page,63);
  await expect(source).toHaveAttribute('data-lab-cell','1');
  await tap(page,1);await tap(page,67);
  await expect(source).toHaveAttribute('data-lab-cell','37');
  await page.getByTestId('action-undo').click();
  await expect(source).toHaveAttribute('data-lab-cell','1');
  await hint.click();
  await expect(source).toHaveCount(0);await expect(destination).toHaveCount(0);
  await hint.click();
  await expect(source).toHaveAttribute('data-lab-cell','1');
});

test('Mutation Correction puts four replacements in the unused rightmost grid column and animates a repair', async ({page}) => {
  await page.setViewportSize({width:320,height:568});
  await openLab(page,'mutation');
  const board=page.getByTestId('mechanics-board');
  await expect(board.locator('[data-lab-cell]')).toHaveCount(81);
  await expect(page.getByTestId('under-board').locator('.lab-base-picker')).toHaveCount(0);
  const geometry=await page.evaluate(()=>{
    const board=document.querySelector('[data-testid="mechanics-board"]')!.getBoundingClientRect();
    const buttons=[...document.querySelectorAll('.mutation-rail-button')].map(el=>{
      const r=el.getBoundingClientRect();
      return {x:r.x,y:r.y,width:r.width,height:r.height,cell:Number(el.getAttribute('data-lab-cell'))};
    });
    return {board:{x:board.x,width:board.width,height:board.height},buttons};
  });
  expect(geometry.board.x).toBe(0);
  expect(geometry.board.width).toBe(320);
  expect(geometry.board.height).toBe(320);
  expect(geometry.buttons.map(b=>b.cell)).toEqual([26,35,44,53]);
  // Nine square columns remain; the DNA shifts left and the entire eighth
  // column is deliberately blank between it and the rightmost rail.
  const layout=await board.evaluate(root=>{
    const spacers=[...root.querySelectorAll<HTMLElement>('.mutation-spacer')].map(el=>{
      const style=getComputedStyle(el),r=el.getBoundingClientRect();
      return {visible:Number(el.dataset.visualCell), background:style.backgroundColor, image:style.backgroundImage, x:r.x};
    });
    const standardHole=root.querySelector<HTMLElement>('.lab-hole:not(.mutation-spacer):not(.mutation-rail-slot)')!;
    const standardStyle=getComputedStyle(standardHole);
    return {spacers,standardHole:{image:standardStyle.backgroundImage,background:standardStyle.backgroundColor},
      shifted:root.querySelector<HTMLElement>('[data-lab-cell="20"]')!.dataset.visualCell,
      dnaInGap:root.querySelectorAll('.lab-cell[data-visual-cell="7"],.lab-cell[data-visual-cell="16"],.lab-cell[data-visual-cell="25"],.lab-cell[data-visual-cell="34"],.lab-cell[data-visual-cell="43"],.lab-cell[data-visual-cell="52"],.lab-cell[data-visual-cell="61"],.lab-cell[data-visual-cell="70"],.lab-cell[data-visual-cell="79"]').length};
  });
  expect(layout.shifted).toBe('19');
  expect(layout.spacers.map(c=>c.visible).sort((a,b)=>a-b)).toEqual([7,16,25,34,43,52,61,70,79]);
  expect(layout.dnaInGap).toBe(0);
  for(const spacer of layout.spacers){
    expect(spacer.image).toBe(layout.standardHole.image);
    expect(spacer.background).toBe(layout.standardHole.background);
    expect(spacer.image).toContain('repeating-linear-gradient');
    expect(spacer.image).toContain('rgb(217, 217, 210)');
    expect(spacer.x).toBeGreaterThanOrEqual(320*7/9-1);
    expect(spacer.x).toBeLessThan(320*8/9+1);
  }
  for (const b of geometry.buttons) {
    expect(b.x).toBeGreaterThanOrEqual(320*8/9-1);
    expect(b.x+b.width).toBeLessThanOrEqual(320+1);
    expect(Math.abs(b.width-b.height)).toBeLessThan(1.5);
  }
  // The palette, text and sizing must match ordinary board tiles even before a repair is selected.
  // Only the dedicated rightmost-column border and hatch distinguish the replacement rail.
  const visual=await board.evaluate(root=>{
    const boardTile=root.querySelector<HTMLElement>('.lab-cell[data-base="A"]')!;
    const option=root.querySelector<HTMLElement>('.mutation-rail-button[data-base-option="A"]')!;
    const appearance=(el:HTMLElement)=>{
      const style=getComputedStyle(el);
      return {background:style.backgroundColor,colour:style.color,font:style.fontFamily,size:style.fontSize,opacity:style.opacity,border:style.borderTopColor};
    };
    const holes=[...root.querySelectorAll<HTMLElement>('.mutation-rail-slot')].map(el=>{
      const style=getComputedStyle(el);
      return {cell:Number(el.dataset.labCell),border:style.borderTopColor,hatch:style.backgroundImage};
    });
    return {boardTile:appearance(boardTile),option:appearance(option),holes};
  });
  expect(visual.option.background).toBe(visual.boardTile.background);
  expect(visual.option.colour).toBe(visual.boardTile.colour);
  expect(visual.option.font).toBe(visual.boardTile.font);
  expect(visual.option.size).toBe(visual.boardTile.size);
  expect(visual.option.opacity).toBe('1');
  expect(visual.option.border).toBe(visual.boardTile.colour);
  expect(visual.holes.map(h=>h.cell)).toEqual([8,17,62,71,80]);
  for(const hole of visual.holes){
    expect(hole.border).toBe(visual.boardTile.colour);
    expect(hole.hatch).toContain('repeating-linear-gradient');
    expect(hole.hatch).toContain('rgb(68, 68, 67)');
  }
  const chosen=20;
  const expected=await page.getByTestId('mutation-target-'+chosen).getAttribute('data-symbol');
  await tile(page,chosen).tap();
  const option=page.getByTestId('lab-base-'+expected);
  await expect(option).toBeEnabled();
  const flight=page.getByTestId('mutation-flight');
  await Promise.all([flight.waitFor({state:'visible'}),option.tap()]);
  await expect(flight).toHaveCSS('animation-name','mutation-slide');
  // The engine and controls stay responsive throughout the decorative flight.
  await expect(board).toHaveAttribute('aria-busy','false');
  await expect(page.getByTestId('moves')).toHaveText('1 move');
  await expect(flight).toHaveCount(0);
  await expect(page.getByTestId('moves')).toHaveText('1 move');
  await expect(tile(page,chosen)).toHaveAttribute('data-base',expected!);
  await expect(page.getByTestId('mutation-target-'+chosen)).toHaveClass(/matched/);
  // The next tile must still be selectable if its predecessor is mid-flight.
  for (const c of [23,48]) {
    const nextBase=await page.getByTestId('mutation-target-'+c).getAttribute('data-symbol');
    await tile(page,c).tap();
    await expect(tile(page,c)).toHaveAttribute('aria-pressed','true');
    await page.getByTestId('lab-base-'+nextBase).tap();
  }
  for (const c of [23,48]) await expect(page.getByTestId('mutation-target-'+c)).toHaveClass(/matched/);
  await expect(page.getByTestId('moves')).toHaveText('3 moves');
});

test('Mutation Correction first-use tutorial teaches the right-side rail and shows its landing animation', async ({page}) => {
  await page.setViewportSize({width:320,height:568});
  await fresh(page,true);await openMap(page);
  await page.getByTestId('cnode-ins-06').click();
  const tutorial=page.getByTestId('mechanic-tutorial');
  await expect(tutorial).toHaveAttribute('data-mechanic','mutation');
  const board=page.getByTestId('tutorial-board');
  for(let step=1;step<=3;step++){
    await expect(board).toHaveAttribute('data-step',String(step));
    await expect(board.getByTestId('tutorial-mutation-rail')).toHaveCount(4);
    await expect(board.locator('.tutorial-mutation-rail-slot')).toHaveCount(9);
    await expect(board.locator('.tutorial-mutation-gap')).toHaveCount(9);
    await expect(board.locator('.tutorial-mutation-gap').first()).toHaveCSS('background-image',/repeating-linear-gradient.*rgb\(217, 217, 210\)/);
    await expect(board.locator('.tutorial-mutation-rail-slot').first()).toHaveCSS('border-top-color','rgb(68, 68, 67)');
    await expect(board.locator('.tutorial-mutation-rail-slot').first()).toHaveCSS('background-image',/repeating-linear-gradient/);
    await expect(board.locator('.tutorial-cell')).toHaveCount(81);
    if(step<3)await page.getByTestId('tutorial-next').click();
  }
  await expect(tutorial).toContainText('vertical column on the right');
  await expect(board.getByTestId('tutorial-mutation-flight')).toHaveCSS('animation-name','tutorial-mutation-slide');
  await page.getByRole('button',{name:'Replay animation'}).click();
  await expect(board.getByTestId('tutorial-mutation-flight')).toHaveCount(1);
  await page.getByTestId('tutorial-next').click();
  await expect(tutorial).toHaveCount(0);
  await expect(page.getByTestId('mechanics-board').locator('.mutation-rail-button')).toHaveCount(4);
});

test('the right mutation rail stays outside all reference and repair cells', () => {
  const stages=CAMPAIGN_LEVELS.filter(def=>mechanicOf(def)==='mutation').map(def=>mixedStage(def)!.spec);
  stages.push(DEFAULT_LAB_SPEC);
  // The bonus campaign generates Mutation Correction for its 27-base ramp.
  stages.push(genomeStage('chrM',[9,36],'ACGT'.repeat(7).slice(0,27)).spec);
  expect(stages.length).toBeGreaterThan(2);
  for(const spec of stages){
    const occupied=new Set(spec.MUTATION_ROWS.flatMap(({top,bottom,seq})=>
      [...seq].flatMap((_,i)=>[top+i,bottom+i])));
    for(const cell of [26,35,44,53]) expect(occupied.has(cell)).toBe(false);
    for(const row of spec.MUTATION_ROWS) expect(row.seq.length).toBeLessThanOrEqual(7);
  }
});


test('MB 3/11 leaves an unsolved gap after any two Genome Assembly reads',async({page})=>{
  const def=CAMPAIGN_LEVELS.filter(l=>l.symbol==='MB')[2]!;
  const stage=mixedStage(def)!;
  expect(stage.mechanic).toBe('assembly');
  await openChapter(page,def.id);
  await expect(page.getByTestId('target-panel').locator('.target-title')).toHaveText('Genome Assembly');
  const actions=stage.certificate;
  for(const action of actions.slice(0,2)){
    if(action.type!=='place')throw Error('Expected assembly placement');
    await tap(page,stage.spec.READ_CELLS[action.read]![0]!);
    await tap(page,stage.spec.ASSEMBLY_CELLS[action.offset]!);
  }
  await expect(page.getByTestId('lab-progress')).toHaveText('2/3 reads');
  expect(await page.locator('.mechanics-board .assembly-slot[data-base="·"]').count()).toBeGreaterThan(0);
  await expect(page.getByTestId('win')).toHaveCount(0);
  const last=actions[2]!;
  if(last.type!=='place')throw Error('Expected final assembly placement');
  await tap(page,stage.spec.READ_CELLS[last.read]![0]!);
  await tap(page,stage.spec.ASSEMBLY_CELLS[last.offset]!);
  await expect(page.getByTestId('win')).toBeVisible();
});
