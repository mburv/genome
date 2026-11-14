import { expect, test } from '@playwright/test';
import pack from '../src/campaign/levels.generated.json' with { type: 'json' };
import type { LevelDefinition } from '../src/engine/types.ts';
import { fresh, openLevel, openMap, sampleTitle, solveWithHints, touchSwipe, type Dir } from './helpers';

const LEVELS = pack.levels as LevelDefinition[];

for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
  test(`fits a small portrait viewport ${size.width}x${size.height} without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize(size);
    for (const n of [1, 12]) {
      await openLevel(page, n);
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

test('tutorial: first-time players start in level 1; one swipe on the cued tile completes it', async ({ page }) => {
  await fresh(page);
  await expect(page.getByTestId('play-title')).toHaveText('INS · 1/6');
  await expect(page.getByTestId('hint-cue')).toBeVisible();
  await expect(page.getByTestId('status')).toContainText('Drag the glowing tile');
  const cell = Number(await page.locator('.tile.selected').getAttribute('data-cell'));
  const dir = /dir-(\w+)/.exec((await page.getByTestId('hint-cue').getAttribute('class'))!)![1] as Dir;
  await touchSwipe(page, cell, dir);
  await expect(page.getByTestId('win')).toBeVisible();
  await expect(page.getByTestId('win')).toContainText('Fragment sequenced');
  await expect(page.getByTestId('win-bases')).toContainText('+9 INS coding bases');
  await expect(page.getByTestId('win-bases')).toContainText('CDS 1–9');
  await expect(page.getByTestId('moves')).toHaveText('1 move');
});

test('level map lists 12 levels across INS and HBB with modes; cards are locked', async ({ page }) => {
  await fresh(page);
  await openMap(page);
  await expect(page.getByTestId('level-map')).toBeVisible();
  await expect(page.locator('.node:not(.lab)')).toHaveCount(12);
  await expect(page.locator('.node.lab')).toHaveCount(3);
  for (const m of ['Sequencing', 'Splicing', 'Replication', 'Repair']) await expect(page.getByTestId('gene-INS')).toContainText(m);
  for (const m of ['Sequencing', 'Splicing', 'Replication', 'Repair']) await expect(page.getByTestId('gene-HBB')).toContainText(m);
  await expect(page.getByTestId('progress-HBB')).toHaveText('0 / 51 sample bases');
  await expect(page.getByTestId('card-INS')).toContainText('🔒');
  await page.getByTestId('card-HBB').click();
  await expect(page.getByTestId('gene-card')).toContainText('Complete all six HBB challenges');
  await expect(page.getByTestId('gene-card')).toContainText('NM_000518.5');
  await expect(page.getByTestId('gene-card')).not.toContainText('Not yet assembled');
});

test('splicing level: three numbered pieces; replication: dashed complement strand; repair: gap cell', async ({ page }) => {
  await openLevel(page, 2);
  await expect(page.getByTestId('play-title')).toHaveText('INS · 2/6');
  await expect(page.locator('.track-outline')).toHaveCount(LEVELS[1]!.tracks.length);
  await expect(page.getByTestId('target-panel')).toContainText('illustrative');
  await openMap(page);
  await page.getByRole('button', { name: /^Level 3: / }).click();
  await expect(page.getByTestId('play-title')).toHaveText('INS · 3/6');
  await expect(page.locator('.track-outline.strand-complement')).toHaveCount(1);
  await expect(page.getByTestId('target-panel')).toContainText('complement');
  await openMap(page);
  await page.getByRole('button', { name: /^Level 4: / }).click();
  await expect(page.getByTestId('play-title')).toHaveText('INS · 4/6');
  await expect(page.getByTestId('repair-cell')).toHaveText('?');
  await expect(page.getByTestId('repair-slot')).toHaveText('?');
});

test('swiping a hole does nothing; tap + arrow buttons and undo work', async ({ page }) => {
  await openLevel(page, 2);
  await expect(page.getByTestId('play-title')).toHaveText('INS · 2/6');
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
  await page.getByRole('button', { name: 'Slide row right' }).click();
  await expect(page.getByTestId('moves')).toHaveText('1 move');
  await page.waitForTimeout(250);
  expect(await page.locator('.board').innerText()).not.toBe(before);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('moves')).toHaveText('0 moves');
  expect(await page.locator('.board').innerText()).toBe(before);
});

test('keyboard: arrow keys slide the selected tile, Shift+arrow moves the selection', async ({ page }) => {
  await openLevel(page, 2);
  await page.locator('.tile.selected').focus();
  const sel0 = await page.locator('.tile.selected').getAttribute('data-cell');
  await page.keyboard.press('Shift+ArrowRight');
  expect(await page.locator('.tile.selected').getAttribute('data-cell')).not.toBe(sel0);
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('moves')).toHaveText('1 move');
});

test('hint describes a whole drag and following it with touch reaches the win in par', async ({ page }) => {
  await openLevel(page, 5);
  const drags = await solveWithHints(page);
  expect(drags).toBe(LEVELS[4]!.certificateSlides.length);
  await expect(page.getByTestId('win-bases')).toContainText('+9 INS coding bases');
});

test('full campaign: all 12 levels solvable by touch drags + hints; genes discovered, never "assembled"', async ({ page }) => {
  test.setTimeout(240_000);
  await fresh(page);
  for (let level = 1; level <= 12; level++) {
    await expect(page.getByTestId('play-title')).toHaveText(sampleTitle(level));
    await solveWithHints(page);
    const def = LEVELS[level - 1]!;
    const iv = def.sourceIntervals[0]!;
    await expect(page.getByTestId('win-bases')).toContainText(`+${iv.end - iv.start} ${def.symbol} coding bases`);
    if (def.mode === 'repair') await expect(page.getByTestId('win-restored')).toHaveText(def.repair!.expected);
    if (level === 6 || level === 12) {
      await expect(page.getByTestId('discovered')).toContainText(`${def.symbol} discovered`);
      await expect(page.getByTestId('discovered')).toContainText('Not yet fully assembled');
      await page.getByRole('button', { name: 'View card' }).click();
      const card = page.getByTestId('gene-card');
      await expect(card).toContainText(def.symbol);
      await expect(page.getByTestId('card-coverage')).toContainText(`51 of ${def.symbol === 'INS' ? 333 : 444}`);
      await expect(page.getByTestId('card-coverage')).toContainText('Not yet assembled');
      await expect(card).toContainText('RefSeq');
      await expect(card).toContainText(def.transcript);
      if (level === 6) {
        await card.getByRole('button', { name: '← Map' }).click();
        await page.getByRole('button', { name: /^Level 7: / }).click();
      }
    } else {
      await page.getByRole('button', { name: 'Next level →' }).click();
    }
  }
  await page.getByRole('button', { name: '← Map' }).click();
  await expect(page.getByTestId('progress-INS')).toHaveText('51 / 51 sample bases');
  await expect(page.getByTestId('progress-HBB')).toHaveText('51 / 51 sample bases');
  await expect(page.getByTestId('card-HBB')).toContainText('gene card');
  // replay never adds duplicate credit
  await page.getByRole('button', { name: /^Level 1: / }).click();
  await page.getByRole('button', { name: 'Replay' }).click();
  await solveWithHints(page);
  await expect(page.getByTestId('win-bases')).toContainText('Already counted');
});

test('progress and the board in play survive a reload; returning players see the map', async ({ page }) => {
  await fresh(page);
  const cell = Number(await page.locator('.tile.selected').getAttribute('data-cell'));
  const dir = /dir-(\w+)/.exec((await page.getByTestId('hint-cue').getAttribute('class'))!)![1] as Dir;
  await touchSwipe(page, cell, dir);
  await page.getByRole('button', { name: 'Next level →' }).click();
  await page.locator('.tile.goal').nth(1).tap();
  await page.getByRole('button', { name: 'Slide column down' }).click();
  await expect(page.getByTestId('moves')).toHaveText('1 move');
  await page.waitForTimeout(250);
  const board = await page.locator('.board').innerText();
  await page.reload();
  await expect(page.getByTestId('level-map')).toBeVisible();
  await expect(page.getByTestId('progress-INS')).toHaveText('9 / 51 sample bases');
  await expect(page.getByRole('button', { name: /^Level 1: First drag, .*complete/ })).toBeVisible();
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('play-title')).toHaveText('INS · 2/6');
  await expect(page.getByTestId('moves')).toHaveText('1 move');
  expect(await page.locator('.board').innerText()).toBe(board);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
});

test('an M1 save migrates: level 1 credit carries over, M1 levels 2–3 kept as history, with a notice', async ({ page }) => {
  await page.goto('/');
  const m1 = { schemaVersion: 1, campaignId: 'genome-m1-ins-sample', generatorVersion: 'm1-gen-1', datasetId: 'refseq-NM_000207.3', currentLevelId: 'm1-ins-03', completed: ['m1-ins-01', 'm1-ins-02', 'm1-ins-03'], attempts: {}, settings: { reducedMotion: false } };
  await page.evaluate((raw) => { localStorage.clear(); localStorage.setItem('genome-save', raw); }, JSON.stringify(m1));
  await page.reload();
  await expect(page.getByTestId('notice')).toContainText('12-level');
  await expect(page.getByTestId('notice')).toContainText('carries over');
  await expect(page.getByTestId('level-map')).toBeVisible();
  await expect(page.getByTestId('progress-INS')).toHaveText('9 / 51 sample bases');
  await expect(page.getByTestId('legacy-m1')).toContainText('1, 2, 3');
  expect(await page.evaluate(() => localStorage.getItem('genome-save-backup-m1'))).toContain('"schemaVersion":1');
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('genome-save')))!).schemaVersion).toBe(4);
  await page.getByRole('button', { name: 'OK' }).click();
  await page.reload();
  await expect(page.getByTestId('notice')).toHaveCount(0);
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
