import { expect, test } from '@playwright/test';
import pack from '../src/campaign/chapters.generated.json' with { type: 'json' };
import type { LevelDefinition } from '../src/engine/types.ts';
import { expectChapterHeading, expectOpeningHeading, fresh, openChapter, openMap, solveWithHints } from './helpers';

const CHAPTERS = pack.levels as LevelDefinition[];
const ins = CHAPTERS.filter((l) => l.symbol === 'INS');
const hbb = CHAPTERS.filter((l) => l.symbol === 'HBB');

for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
  test(`fits a small portrait viewport ${size.width}x${size.height} without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize(size);
    for (const id of [ins[0]!.id, hbb[0]!.id]) {
      await openChapter(page, id);
      const board = page.getByTestId('board');
      await expect(page.locator('.board > .cell')).toHaveCount(81);
      const box = (await board.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(size.width);
      expect(Math.abs(box.width - box.height)).toBeLessThan(2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      const tile = (await page.locator('.tile').first().boundingBox())!;
      expect(tile.width).toBeGreaterThanOrEqual(26);
      expect(await board.evaluate((el) => getComputedStyle(el).touchAction)).toBe('none');
    }
    await openMap(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
}

test('first-run: players start on the 1-base INS intro 1/13; hinted drags complete it and discover the gene', async ({ page }) => {
  await fresh(page);
  await expectOpeningHeading(page);
  await expect(page.getByTestId('hint-cue')).toBeVisible();
  // Opening board is single-letter tiles, not 3-base codon pieces.
  await expect(page.locator('.tile.tok')).toHaveCount(0);
  await expect(page.locator('.board .tile .letter').first()).toHaveText(/^[ACGT]$/);
  await page.screenshot({ path: '/workspace/game/screenshots/genome-basics-level1-390x844.png', animations: 'disabled' });
  const drags = await solveWithHints(page);
  expect(drags).toBe(1);
  await expect(page.getByTestId('win')).toBeVisible();
  await expect(page.getByTestId('win')).toContainText('Fragment sequenced');
  await expect(page.getByTestId('win')).toContainText('INS 1/13');
  await expect(page.getByTestId('win')).not.toContainText('sample bases');
  await expect(page.getByTestId('win')).not.toContainText('illustrative split');
  await expect(page.getByTestId('win-bases')).toContainText('+9 INS coding bases');
  await expect(page.getByTestId('win-bases')).toContainText('CDS 1–9');
  await expect(page.getByTestId('win-assembly')).toContainText('9 / 333 INS coding bases assembled');
  await expect(page.getByTestId('discovered')).toHaveCount(0);
  await expect(page.getByTestId('win')).not.toContainText('discovered');
  await expect(page.getByRole('button', { name: 'Level map' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next level →' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View card' })).toHaveCount(0);
  await page.screenshot({ path: '/workspace/game/screenshots/genome-discovery-win-390x844.png', animations: 'disabled' });
});

test('level map lists the gene catalogue and labs; cards stay locked until the first puzzle', async ({ page }) => {
  await fresh(page);
  await openMap(page);
  await expect(page.getByTestId('level-map')).toBeVisible();
  await expect(page.getByTestId('continue')).toHaveText(/Start · INS 1\/13/);
  await expect(page.locator('.node:not(.lab)')).toHaveCount(0);
  await expect(page.locator('.node.lab')).toHaveCount(3);
  await expect(page.getByTestId('catalogue')).toBeVisible();
  await expect(page.getByTestId('intro-nodes-INS')).toBeVisible();
  await expect(page.getByTestId('cnode-ins-01')).toBeVisible();
  await expect(page.getByTestId('cat-progress-INS')).toContainText('0 / 333');
  await expect(page.getByTestId('cat-progress-INS')).toContainText('6 intro + 7 assembly');
  await expect(page.getByTestId('cat-INS')).toContainText('New');
  await expect(page.getByText('Intro · 1-base tiles').first()).toBeVisible();
  await page.getByTestId('cat-card-HBB').click();
  await expect(page.getByTestId('gene-card')).toContainText('Solve the first HBB puzzle');
  await expect(page.getByTestId('gene-card')).toContainText('NM_000518.5');
  await expect(page.getByTestId('gene-card')).not.toContainText('Not yet assembled');
  await expect(page.getByTestId('gene-card')).not.toContainText('sample bases');
});

test('splicing, replication and repair chapter puzzles show their mode cues', async ({ page }) => {
  await openChapter(page, 'ins-c02');
  await expectChapterHeading(page, 'INS', 8, 13, 'INSULIN');
  await expect(page.locator('.track-outline')).toHaveCount(ins[1]!.tracks.length);
  await expect(page.getByTestId('target-panel')).not.toContainText('illustrative');
  await openMap(page);
  await page.getByTestId('cnode-ins-c03').click();
  await expectChapterHeading(page, 'INS', 9, 13, 'INSULIN');
  await expect(page.locator('.track-outline.strand-complement')).toHaveCount(1);
  await expect(page.getByTestId('target-panel')).toContainText('complement');
  await openMap(page);
  await page.getByTestId('cnode-ins-c04').click();
  await expectChapterHeading(page, 'INS', 10, 13, 'INSULIN');
  await expect(page.getByTestId('repair-cell')).toContainText('?');
  await expect(page.getByTestId('repair-slot')).toContainText('?');
});

test('swiping a hole does nothing; tap + keyboard arrow and undo work', async ({ page }) => {
  await openChapter(page, 'ins-c02');
  const hb = (await page.locator('.board > .hole').first().boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 40, hb.y + hb.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId('moves')).toHaveText('0 moves');

  const before = await page.locator('.board').innerText();
  const track = page.locator('.tile.goal').nth(2);
  await track.tap();
  await expect(track).toHaveClass(/selected/);
  await track.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('moves')).toHaveText('1 move');
  await page.waitForTimeout(250);
  expect(await page.locator('.board').innerText()).not.toBe(before);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('moves')).toHaveText('0 moves');
  expect(await page.locator('.board').innerText()).toBe(before);
});

test('keyboard: arrow keys slide the selected tile, Shift+arrow moves the selection', async ({ page }) => {
  await openChapter(page, 'ins-c02');
  await page.locator('.tile.selected').focus();
  const sel0 = await page.locator('.tile.selected').getAttribute('data-cell');
  await page.keyboard.press('Shift+ArrowRight');
  expect(await page.locator('.tile.selected').getAttribute('data-cell')).not.toBe(sel0);
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('moves')).toHaveText('1 move');
});

test('hint describes a whole drag and following it with touch reaches the win in par', async ({ page }) => {
  await openChapter(page, 'ins-c05');
  const drags = await solveWithHints(page);
  expect(drags).toBe(ins[4]!.certificateSlides.length);
  const iv = ins[4]!.sourceIntervals[0]!;
  await expect(page.getByTestId('win-bases')).toContainText(`+${iv.end - iv.start} INS coding bases`);
  await expect(page.getByTestId('win')).not.toContainText('sample bases');
});

test('opening puzzles discover a gene; a replay never adds duplicate bases and does not assemble it', async ({ page }) => {
  test.setTimeout(60_000);
  await fresh(page);
  await solveWithHints(page);
  await expect(page.getByTestId('discovered')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Next level →' })).toBeVisible();
  await page.getByTestId('win-map').click();
  await expect(page.getByTestId('cat-INS')).toContainText('Discovered');
  await page.getByTestId('cat-card-INS').click();
  const card = page.getByTestId('gene-card');
  await expect(card).toContainText('INS');
  await expect(page.getByTestId('card-coverage')).toContainText('9 of 333');
  await expect(page.getByTestId('card-coverage')).toContainText('Not yet assembled');
  await expect(card).toContainText('RefSeq');
  await expect(card).toContainText('NM_000207.3');
  await card.getByRole('button', { name: '← Map' }).click();
  await expect(page.getByTestId('cat-INS')).toContainText('Discovered');
  await expect(page.getByTestId('cat-progress-INS')).toContainText('9 / 333');
  await page.getByTestId('cnode-ins-01').click();
  await page.getByRole('button', { name: 'Replay' }).click();
  await solveWithHints(page);
  await expect(page.getByTestId('win-bases')).toContainText('Replay · no new bases');
  await expect(page.getByTestId('assembled')).toHaveCount(0);
});

test('progress and the board in play survive a reload; returning players see the map', async ({ page }) => {
  await fresh(page);
  await solveWithHints(page);
  await page.getByTestId('win-map').click();
  await expect(page.getByTestId('level-map')).toBeVisible();
  await page.getByTestId('cnode-ins-02').click();
  await expectChapterHeading(page, 'INS', 2, 13, 'INSULIN');
  const tile = page.locator('.tile.goal').nth(1);
  await tile.tap();
  await tile.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('moves')).toHaveText('1 move');
  await page.waitForTimeout(250);
  const board = await page.locator('.board').innerText();
  await page.reload();
  await expect(page.getByTestId('level-map')).toBeVisible();
  await expect(page.getByTestId('cat-progress-INS')).toContainText('9 / 333');
  await expect(page.getByTestId('cnode-ins-01')).toHaveClass(/done/);
  await page.getByTestId('continue').click();
  await expectChapterHeading(page, 'INS', 2, 13, 'INSULIN');
  await expect(page.getByTestId('moves')).toHaveText('1 move');
  expect(await page.locator('.board').innerText()).toBe(board);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
});

test('an M1 save migrates: prototype history kept, no campaign credit, with a notice', async ({ page }) => {
  await page.goto('/');
  const m1 = { schemaVersion: 1, campaignId: 'genome-m1-ins-sample', generatorVersion: 'm1-gen-1', datasetId: 'refseq-NM_000207.3', currentLevelId: 'm1-ins-03', completed: ['m1-ins-01', 'm1-ins-02', 'm1-ins-03'], attempts: {}, settings: { reducedMotion: false } };
  await page.evaluate((raw) => { localStorage.clear(); localStorage.setItem('genome-save', raw); }, JSON.stringify(m1));
  await page.reload();
  await expect(page.getByTestId('notice')).toContainText('retired');
  await expect(page.getByTestId('level-map')).toBeVisible();
  await expect(page.getByTestId('cat-progress-INS')).toContainText('0 / 333');
  await expect(page.getByTestId('legacy-m1')).toContainText('1, 2, 3');
  expect(await page.evaluate(() => localStorage.getItem('genome-save-backup-m1'))).toContain('"schemaVersion":1');
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('genome-save')))!).schemaVersion).toBe(7);
  await page.getByRole('button', { name: 'OK' }).click();
  await page.reload();
  await expect(page.getByTestId('notice')).toHaveCount(0);
  await openMap(page);
  await expect(page.getByTestId('legacy-m1')).toBeVisible();
});

test('no runtime network requests beyond the local bundle', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => { if (!r.url().startsWith('http://127.0.0.1:4173') && !r.url().startsWith('data:')) external.push(r.url()); });
  await fresh(page);
  await openMap(page);
  await page.waitForTimeout(300);
  expect(external).toEqual([]);
});
