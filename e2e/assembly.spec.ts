import { expect, test, type Page } from '@playwright/test';
import chapterPack from '../src/campaign/chapters.generated.json' with { type: 'json' };
import manifest from '../src/genomics/manifest.generated.json' with { type: 'json' };
import type { LevelDefinition } from '../src/engine/types.ts';
import { createInitialState } from '../src/engine/engine.ts';
import { fresh, solveWithHints } from './helpers';

const CHAPTERS = chapterPack.levels as unknown as LevelDefinition[];
const chapterOf = (s: string) => CHAPTERS.filter((l) => l.symbol === s);

/** Patch the stored save (created by the app on first load) and reload to the map. */
async function patchSave(page: Page, patch: (s: Record<string, unknown>) => Record<string, unknown>): Promise<void> {
  await fresh(page);
  const raw = (await page.evaluate(() => localStorage.getItem('genome-save')))!;
  const next = JSON.stringify(patch(JSON.parse(raw) as Record<string, unknown>));
  await page.evaluate((v) => localStorage.setItem('genome-save', v), next);
  await page.reload();
}

test('map shows the gene catalogue with its count from the manifest, chapter nodes and exclusions', async ({ page }) => {
  await fresh(page);
  await page.getByTestId('open-map').click();
  await expect(page.getByTestId('catalogue-count')).toHaveText(`${manifest.included.length} verified genes`);
  for (const g of manifest.included) await expect(page.getByTestId(`cat-${g.symbol}`)).toBeVisible();
  await expect(page.locator('.cnode:not(.play)')).toHaveCount(CHAPTERS.length);
  await expect(page.getByTestId('catalogue-excluded')).toContainText(manifest.excluded[0]!.symbol);
  // Sample campaign nodes are unchanged.
  await expect(page.locator('.node:not(.lab)')).toHaveCount(12);
});

test('long-token level: readable tiles, tap-to-inspect, drag-solve with hints; finishing the chapter assembles INS', async ({ page }) => {
  const ins = chapterOf('INS');
  const last = ins.at(-1)!;
  expect(last.tier).toBe(12);
  await patchSave(page, (s) => ({ ...s, completed: ins.slice(0, -1).map((l) => l.id) }));
  await page.getByTestId(`cnode-${last.id}`).click();
  await expect(page.getByTestId('level-label')).toHaveText(`INS assembly ${ins.length} / ${ins.length}`);
  await expect(page.getByTestId('progress-text')).toContainText(`/ 333 INS CDS bases assembled`);
  const tile = page.locator('.tile.tok').first();
  const seq = (await tile.getAttribute('data-seq'))!;
  expect(seq).toMatch(/^[ACGT]+$/);
  await tile.click();
  await expect(page.getByTestId('token-inspector')).toContainText(`${seq.length} bases`);
  await expect(page.getByTestId('target-sequence')).toBeVisible();
  await solveWithHints(page);
  await expect(page.getByTestId('win-meta')).toContainText(`INS ASSEMBLY ${ins.length}/${ins.length}`);
  await expect(page.getByTestId('assembled')).toContainText('INS assembled');
  await expect(page.getByTestId('assembled')).toContainText('SHA-256 verified');
  await page.getByRole('button', { name: 'View card' }).click();
  await expect(page.getByTestId('card-state')).toContainText('Assembled');
  await expect(page.getByTestId('card-coverage')).toContainText('333 of 333');
  await expect(page.getByTestId('card-checksum')).toContainText('matches your assembly');
  const saved = JSON.parse((await page.evaluate(() => localStorage.getItem('genome-save')))!);
  expect(saved.assembled).toEqual(['INS']);
  // Reload keeps the verified assembly.
  await page.reload();
  await expect(page.getByTestId('cat-INS')).toContainText('Assembled');
  await expect(page.getByTestId('cat-progress-INS')).toContainText('333 / 333');
});

test('HBB chapter opener (codon tiles) discovers HBB but does not assemble it', async ({ page }) => {
  const hbb = chapterOf('HBB');
  await fresh(page);
  await page.getByTestId('open-map').click();
  await page.getByTestId(`cnode-${hbb[0]!.id}`).click();
  await expect(page.locator('.tile.tok.tier-3').first()).toBeVisible();
  await solveWithHints(page);
  await expect(page.getByTestId('discovered')).toContainText('HBB discovered');
  await expect(page.getByTestId('assembled')).toHaveCount(0);
  await page.getByRole('button', { name: 'View card' }).click();
  await expect(page.getByTestId('card-state')).toContainText('Discovered');
  await expect(page.getByTestId('card-coverage')).toContainText('Not yet assembled');
});

test('CRISPR on a multi-base tile: pick a base position, preview by sequence, confirm, undo', async ({ page }) => {
  const def = CHAPTERS.find((l) => l.tier === 12 && l.mode === 'sequence')!;
  const st = { ...createInitialState(def), ledger: { earned: 7, credited: [] as string[] } };
  await patchSave(page, (s) => ({ ...s, currentLevelId: def.id, attempts: { [def.id]: st } }));
  await page.getByTestId('continue').waitFor();
  await page.getByTestId(`cnode-${def.id}`).click();
  const t = def.tracks[0]!;
  const cell = t.cells.find((c, i) => st.board[c] !== t.expected[i])!;
  const before = await page.locator(`[data-cell="${cell}"]`).getAttribute('data-seq');
  await page.getByTestId('power-crispr').click();
  await page.locator(`[data-cell="${cell}"]`).click();
  await expect(page.getByTestId('power-panel')).toBeVisible();
  await page.getByTestId('pos-5').click();
  const other = ['A', 'C', 'G', 'T'].find((b) => b !== before![5])!;
  await page.getByTestId(`base-${other}`).click();
  await expect(page.getByTestId('edit-ghost')).toContainText(`6:${other}`);
  await expect(page.getByTestId('power-preview')).toContainText(`Base 6: ${before![5]} → ${other}`);
  await page.getByTestId('power-confirm').click();
  const after = before!.slice(0, 5) + other + before!.slice(6);
  await expect(page.locator(`[data-cell="${cell}"]`)).toHaveAttribute('data-seq', after);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator(`[data-cell="${cell}"]`)).toHaveAttribute('data-seq', before!);
});

test('an M3 (v3) save upgrades to v4 with every completion kept, a notice and an m3 backup', async ({ page }) => {
  await page.goto('/');
  const ids = ['ins-01', 'ins-02', 'ins-03', 'ins-04', 'lab-crispr'];
  const m3 = { schemaVersion: 3, campaignId: 'genome-m3-lab', generatorVersion: 'm2-gen-1', datasets: { INS: 'refseq-NM_000207.3-2026-11-13', HBB: 'refseq-NM_000518.5-2026-11-13' }, currentLevelId: 'ins-05', completed: ids, discovered: [], attempts: {}, legacy: { m1Completed: [] }, settings: { reducedMotion: false, sound: false, haptics: true } };
  await page.evaluate((raw) => { localStorage.clear(); localStorage.setItem('genome-save', raw); }, JSON.stringify(m3));
  await page.reload();
  await expect(page.getByTestId('notice')).toContainText('full gene assembly');
  await expect(page.getByTestId('notice')).toContainText('All your progress was kept');
  expect(await page.evaluate(() => localStorage.getItem('genome-save-backup-m3'))).toContain('"schemaVersion":3');
  const saved = JSON.parse((await page.evaluate(() => localStorage.getItem('genome-save')))!);
  expect(saved.schemaVersion).toBe(4);
  expect(saved.completed).toEqual(ids.filter((id) => saved.completed.includes(id)));
  expect(saved.completed).toHaveLength(ids.length);
  await expect(page.getByTestId('progress-INS')).toHaveText('33 / 51 sample bases');
});

test('each multi-base combo has its own colour, identical on the board, in the target strip and in the inspector', async ({ page }) => {
  const def = CHAPTERS.find((l) => l.tier === 6 && l.mode === 'sequence')!;
  await fresh(page);
  await page.getByTestId('open-map').click();
  await page.getByTestId(`cnode-${def.id}`).click();
  await page.getByTestId('board').waitFor();
  const tiles = await page.locator('.tile.tok').evaluateAll((els) => els.map((e) => ({ seq: e.getAttribute('data-seq')!, bg: getComputedStyle(e).backgroundColor })));
  const bySeq = new Map<string, string>();
  for (const t of tiles) {
    expect(t.bg).not.toBe('rgb(232, 232, 226)');
    if (bySeq.has(t.seq)) expect(t.bg).toBe(bySeq.get(t.seq));
    bySeq.set(t.seq, t.bg);
  }
  expect(new Set(bySeq.values()).size).toBe(bySeq.size);
  const chips = await page.locator('[data-testid="target-panel"] .tok-chip').evaluateAll((els) => els.map((e) => ({ seq: e.getAttribute('data-seq')!, bg: getComputedStyle(e).backgroundColor })));
  for (const c of chips) if (bySeq.has(c.seq)) expect(c.bg).toBe(bySeq.get(c.seq));
  const tile = page.locator('.tile.tok').first();
  const seq = (await tile.getAttribute('data-seq'))!;
  await tile.click();
  const chip = page.getByTestId('inspector-chip');
  await expect(chip).toHaveAttribute('data-seq', seq);
  expect(await chip.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(bySeq.get(seq));
});
