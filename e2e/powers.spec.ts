import { expect, test } from '@playwright/test';
import { dragBy, fresh, openChapter, openLab, openMap, readHint, solveWithHints, touchDrag, cellPitch } from './helpers';

const boardText = (page: import('@playwright/test').Page) => page.locator('.board').innerText();
const baseAt = (page: import('@playwright/test').Page, c: number) => page.locator(`[data-cell="${c}"]`).getAttribute('data-base');

test('opening puzzle hides powers; later puzzles show ⚡2 and unaffordable powers spend nothing', async ({ page }) => {
  await openChapter(page, 'ins-01');
  await expect(page.getByTestId('energy')).toHaveCount(0);
  await expect(page.getByTestId('power-crispr')).toHaveCount(0);
  await expect(page.getByTestId('icon-row').locator('button')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hint' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restart' })).toBeVisible();
  await openChapter(page, 'ins-02');
  await expect(page.getByTestId('power-tray')).toBeVisible();
  await expect(page.getByTestId('energy')).toContainText('2');
  await expect(page.getByTestId('icon-row').locator('button')).toHaveCount(6);
  await page.getByTestId('power-crispr').click();
  await expect(page.getByTestId('tray-note')).toHaveCount(0);
  await expect(page.getByTestId('power-error')).toHaveCount(0);
  await expect(page.getByTestId('power-panel')).toHaveCount(0);
  await expect(page.getByTestId('energy')).toContainText('2');
});

function underBoardMetrics() {
  const app = document.querySelector('.app') as HTMLElement;
  const under = document.querySelector('[data-testid="under-board"]') as HTMLElement;
  const energy = document.querySelector('[data-testid="energy"]') as HTMLElement;
  const pips = energy.querySelector('.pips') as HTMLElement;
  const row = document.querySelector('[data-testid="icon-row"]') as HTMLElement;
  const buttons = [...row.querySelectorAll('button')];
  const a = app.getBoundingClientRect();
  const u = under.getBoundingClientRect();
  const e = energy.getBoundingClientRect();
  const p = pips.getBoundingClientRect();
  const r = row.getBoundingClientRect();
  return {
    appLeft: a.left,
    appRight: a.right,
    underLeft: u.left,
    underRight: u.right,
    energyLeft: e.left,
    energyRight: e.right,
    energyW: e.width,
    pipsW: p.width,
    rowLeft: r.left,
    rowRight: r.right,
    rowW: r.width,
    ids: buttons.map((b) => b.getAttribute('data-testid')),
    buttons: buttons.map((b) => {
      const box = b.getBoundingClientRect();
      return { w: box.width, h: box.height };
    }),
  };
}

test('energy bar and six icon buttons fit inside the under-board section at 320, 375, 390 and 430', async ({ page }) => {
  for (const width of [320, 375, 390, 430] as const) {
    await page.setViewportSize({ width, height: 844 });
    await openChapter(page, 'ins-02');
    const metrics = await page.evaluate(underBoardMetrics);
    expect(metrics.rowRight, `row overflows at ${width}`).toBeLessThanOrEqual(metrics.underRight + 0.5);
    expect(metrics.energyRight, `energy overflows at ${width}`).toBeLessThanOrEqual(metrics.underRight + 0.5);
    expect(Math.abs(metrics.rowLeft - metrics.underLeft), `row left inset at ${width}`).toBeLessThanOrEqual(1);
    expect(Math.abs(metrics.underRight - metrics.rowRight), `row right inset at ${width}`).toBeLessThanOrEqual(1);
    expect(Math.abs((metrics.rowLeft - metrics.appLeft) - (metrics.appRight - metrics.rowRight)), `row left/right insets differ at ${width}`).toBeLessThanOrEqual(1);
    expect(Math.abs(metrics.energyLeft - metrics.rowLeft), `energy/row left edges differ at ${width}`).toBeLessThanOrEqual(1);
    expect(Math.abs(metrics.energyRight - metrics.rowRight), `energy/row right edges differ at ${width}`).toBeLessThanOrEqual(1);
    expect(Math.abs(metrics.energyLeft - metrics.underLeft), `energy left inset at ${width}`).toBeLessThanOrEqual(1);
    expect(Math.abs(metrics.underRight - metrics.energyRight), `energy right inset at ${width}`).toBeLessThanOrEqual(1);
    expect(Math.abs((metrics.energyLeft - metrics.appLeft) - (metrics.appRight - metrics.energyRight)), `energy left/right insets differ at ${width}`).toBeLessThanOrEqual(1);
    expect(metrics.pipsW).toBeGreaterThan(metrics.energyW * 0.6);
    expect(metrics.ids).toEqual(['power-crispr', 'power-ligase', 'power-scaffold', 'action-undo', 'action-hint', 'action-restart']);
    expect(metrics.buttons).toHaveLength(6);
    const widths = metrics.buttons.map((b) => b.w);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(2);
    for (const b of metrics.buttons) expect(b.h).toBeGreaterThanOrEqual(44);
    if (width === 390) {
      await page.screenshot({ path: '/workspace/game/screenshots/genome-icon-row-fit-390x844.png' });
    }
  }
});

test('arming a power replaces under-board content, collapses the header, and restores both on exit', async ({ page }) => {
  for (const vp of [{ width: 390, height: 844 }, { width: 320, height: 568 }] as const) {
    await page.setViewportSize(vp);
    await openLab(page, 1);
    const headerH = await page.getByTestId('play-top').evaluate((el) => el.getBoundingClientRect().height);
    expect(headerH).toBeGreaterThan(20);
    await expect(page.getByTestId('play-title')).toBeVisible();
    const boardY = await page.getByTestId('board').evaluate((el) => el.getBoundingClientRect().y);
    const clueY = await page.getByTestId('target-panel').evaluate((el) => el.getBoundingClientRect().y);
    await expect(page.getByTestId('icon-row')).toBeVisible();
    await expect(page.getByTestId('energy')).toBeVisible();
    await expect(page.getByTestId('moves')).toBeVisible();
    await page.getByTestId('power-crispr').click();
    await expect(page.getByTestId('power-panel')).toBeVisible();
    await expect(page.getByTestId('icon-row')).toHaveCount(0);
    await expect(page.getByTestId('energy')).toHaveCount(0);
    await expect(page.getByTestId('moves')).toHaveCount(0);
    await expect(page.getByTestId('power-tray')).toHaveCount(0);
    await expect.poll(async () => page.getByTestId('play-top').evaluate((el) => el.getBoundingClientRect().height)).toBeLessThanOrEqual(2);
    const afterArmBoardY = await page.getByTestId('board').evaluate((el) => el.getBoundingClientRect().y);
    const afterArmClueY = await page.getByTestId('target-panel').evaluate((el) => el.getBoundingClientRect().y);
    const boardShift = boardY - afterArmBoardY;
    const clueShift = clueY - afterArmClueY;
    expect(boardShift).toBeGreaterThan(headerH - 2);
    expect(boardShift).toBeLessThan(headerH + 20);
    expect(Math.abs(boardShift - clueShift)).toBeLessThanOrEqual(2);
    if (vp.width === 390) {
      await page.screenshot({ path: '/workspace/game/screenshots/genome-power-panel-390x844.png' });
      await page.screenshot({ path: '/workspace/game/screenshots/genome-power-collapsed-390x844.png' });
    }
    await page.getByTestId('power-cancel').click();
    await expect(page.getByTestId('power-panel')).toHaveCount(0);
    await expect(page.getByTestId('icon-row')).toBeVisible();
    await expect(page.getByTestId('energy')).toBeVisible();
    await expect(page.getByTestId('moves')).toBeVisible();
    await expect.poll(async () => page.getByTestId('play-top').evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(headerH - 2);
    await expect(page.getByTestId('play-title')).toBeVisible();
    await expect.poll(async () => {
      const y = await page.getByTestId('board').evaluate((el) => el.getBoundingClientRect().y);
      return Math.abs(y - boardY);
    }).toBeLessThanOrEqual(2);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await openLab(page, 1);

  const target = Number(await page.locator('.tile.goal.off').first().getAttribute('data-cell'));
  await page.getByTestId('power-crispr').click();
  await page.locator(`[data-cell="${target}"]`).click();
  await expect(page.getByTestId('power-panel')).toBeVisible();
  await expect(page.getByTestId('icon-row')).toHaveCount(0);
  await page.getByTestId('power-cancel').click();
  await expect(page.getByTestId('icon-row')).toBeVisible();

  const before = await baseAt(page, target);
  const other = ['A', 'C', 'G', 'T'].find((b) => b !== before)!;
  await page.getByTestId('power-crispr').click();
  await page.locator(`[data-cell="${target}"]`).click();
  await page.getByTestId(`base-${other}`).click();
  await page.getByTestId('power-confirm').click();
  await expect(page.getByTestId('power-panel')).toHaveCount(0);
  await expect(page.getByTestId('icon-row')).toBeVisible();
  await expect(page.getByTestId('energy')).toBeVisible();
  await expect(page.getByTestId('moves')).toBeVisible();
  await expect(page.getByTestId('play-title')).toBeVisible();
  await expect.poll(async () => page.getByTestId('play-top').evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(20);
});

test('map has an optional Enzyme lab with three powers', async ({ page }) => {
  await fresh(page);
  await openMap(page);
  await expect(page.getByTestId('lab-panel')).toContainText('no coverage');
  for (const n of [1, 2, 3]) await expect(page.getByRole('button', { name: new RegExp(`^Enzyme lab ${n}: `) })).toBeVisible();
});

test('CRISPR: preview before spending, cancel is free, same base is a no-op, confirm edits, undo restores and refunds', async ({ page }) => {
  await openLab(page, 1);
  await expect(page.getByTestId('power-crispr')).toContainText('FREE');
  const target = Number(await page.locator('.tile.goal.off').first().getAttribute('data-cell'));
  const before = await baseAt(page, target);
  // Cancel: nothing spent.
  await page.getByTestId('power-crispr').click();
  await expect(page.locator('.board')).toHaveClass(/target-crispr/);
  await page.locator(`[data-cell="${target}"]`).click();
  await expect(page.getByTestId('power-panel')).toBeVisible();
  await page.getByTestId('power-cancel').click();
  await expect(page.getByTestId('power-crispr')).toContainText('FREE');
  expect(await baseAt(page, target)).toBe(before);
  // Same base: rejected, still free.
  await page.getByTestId('power-crispr').click();
  await page.locator(`[data-cell="${target}"]`).click();
  await page.getByTestId(`base-${before}`).click();
  await expect(page.getByTestId('power-confirm')).toBeDisabled();
  // Pick a different base: live preview, then confirm.
  const other = ['A', 'C', 'G', 'T'].find((b) => b !== before)!;
  await page.getByTestId(`base-${other}`).click();
  await expect(page.getByTestId('edit-ghost')).toBeVisible();
  await expect(page.getByTestId('power-preview')).toContainText(`${before} → ${other}`);
  expect(await baseAt(page, target)).toBe(before);
  await page.getByTestId('power-confirm').click();
  await expect(page.getByTestId('power-panel')).toHaveCount(0);
  expect(await baseAt(page, target)).toBe(other);
  await expect(page.getByTestId('moves')).toHaveText('1 move');
  await expect(page.getByTestId('power-crispr')).toContainText('⚡4');
  // Hints stay valid after an edit (search, undo-to-certified or restart — never a stale drag).
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(page.getByTestId('hint-cue').or(page.getByTestId('rewind')).or(page.getByTestId('restart-hint'))).toBeVisible();
  // Undo: base restored, free use back.
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await baseAt(page, target)).toBe(before);
  await expect(page.getByTestId('moves')).toHaveText('0 moves');
  await expect(page.getByTestId('power-crispr')).toContainText('FREE');
});

test('CRISPR recovery: after a bad edit, hint guidance still reaches the win', async ({ page }) => {
  test.setTimeout(60_000);
  await openLab(page, 1);
  const target = Number(await page.locator('.tile.goal.off').first().getAttribute('data-cell'));
  const before = await baseAt(page, target);
  // Deliberately wrong: pick a base that is neither the current one nor (likely) the wanted one.
  await page.getByTestId('power-crispr').click();
  await page.locator(`[data-cell="${target}"]`).click();
  const wrong = ['A', 'C', 'G', 'T'].filter((b) => b !== before);
  await page.getByTestId(`base-${wrong[wrong.length - 1]}`).click();
  await page.getByTestId('power-confirm').click();
  for (let i = 0; i < 20 && !(await page.getByTestId('win').isVisible()); i++) {
    await page.getByRole('button', { name: 'Hint' }).click();
    await page.waitForFunction(() => !!(
      document.querySelector('[data-testid="hint-cue"]')
      || document.querySelector('[data-testid="rewind"]')
      || document.querySelector('[data-testid="restart-hint"]')
    ));
    if (await page.getByTestId('rewind').isVisible()) { await page.getByTestId('rewind').click(); continue; }
    if (await page.getByTestId('restart-hint').isVisible()) { await page.getByTestId('restart-hint').click(); continue; }
    const cue = page.getByTestId('hint-cue');
    const cell = Number(await cue.getAttribute('data-hint-cell'));
    const dir = (await cue.getAttribute('data-hint-dir')) as 'left' | 'right' | 'up' | 'down';
    const k = Number(await cue.getAttribute('data-hint-k'));
    await dragBy(page, cell, dir, k);
  }
  await expect(page.getByTestId('win')).toBeVisible();
});

test('Ligase: bonding a finished codon blocks drags on both axes; release is free and restores movement', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openLab(page, 2);
  // Invalid taps stay silent: no instructional/error line in the panel.
  await page.getByTestId('power-ligase').click();
  await expect(page.getByTestId('power-panel')).toBeVisible();
  await expect(page.getByTestId('power-preview')).toHaveCount(0);
  await expect(page.getByTestId('power-error')).toHaveCount(0);
  await expect(page.getByTestId('tray-note')).toHaveCount(0);
  await expect(page.getByTestId('power-panel')).not.toContainText('Bond a codon');
  await expect(page.getByTestId('power-panel')).not.toContainText('complete yet');
  await page.locator('.tile').first().click();
  await expect(page.getByTestId('power-error')).toHaveCount(0);
  await expect(page.getByTestId('power-preview')).toHaveCount(0);
  await expect(page.getByTestId('power-confirm')).toBeDisabled();
  await page.getByTestId('power-cancel').click();
  // Complete the first piece with a hinted drag (+1 energy).
  const { cell, dir, k } = await readHint(page);
  await dragBy(page, cell, dir, k);
  await expect(page.getByTestId('moves')).toHaveText('1 move');
  await page.getByTestId('power-ligase').click();
  const cand = page.locator('.tile.candidate');
  expect(await cand.count()).toBeGreaterThanOrEqual(3);
  const locked = Number(await cand.first().getAttribute('data-cell'));
  await cand.first().click();
  await expect(page.getByTestId('power-preview')).toContainText('will stop every row and column');
  await expect(page.getByTestId('power-error')).toHaveCount(0);
  await expect(page.getByTestId('tray-note')).toHaveCount(0);
  await page.screenshot({ path: '/workspace/game/screenshots/genome-no-errors-390x844.png' });
  await page.getByTestId('power-confirm').click();
  await expect(page.locator('.tile.locked')).toHaveCount(3);
  await expect(page.getByTestId('release')).toBeVisible();
  const movesAfterBond = await page.getByTestId('moves').innerText();
  const snap = await boardText(page);
  const p = await cellPitch(page);
  for (const d of [{ dx: p, dy: 1 }, { dx: 1, dy: p }]) {
    await touchDrag(page, locked, [d], { holdMs: 100 });
    expect(await boardText(page)).toBe(snap);
    await expect(page.getByTestId('moves')).toHaveText(movesAfterBond);
  }
  await page.getByTestId('release').click();
  await expect(page.locator('.tile.locked')).toHaveCount(0);
  await expect(page.getByTestId('moves')).toHaveText(movesAfterBond);
  // Movement restored: the rest of the level solves by hints.
  await solveWithHints(page);
  await expect(page.getByTestId('win-meta')).toContainText('1 power used');
});

test('Scaffold: bridge across a gap, rotations tick it, it expires after exactly 3 and undo brings it back', async ({ page }) => {
  await openLab(page, 3);
  await page.getByTestId('power-scaffold').click();
  const gaps = page.getByTestId('gap-target');
  expect(await gaps.count()).toBeGreaterThan(0);
  await gaps.first().click();
  await expect(page.getByTestId('scaffold-preview')).toBeVisible();
  await expect(page.getByTestId('power-panel')).toContainText('Scaffold: Join cells across the gap');
  await expect(page.getByTestId('power-preview')).toHaveText('The two segments skip the gap for the next 3 rotations');
  await page.getByTestId('power-confirm').click();
  await expect(page.getByTestId('scaffold-bridge')).toBeVisible();
  await expect(page.getByTestId('scaffold-remaining')).toContainText('3 rotations');
  await expect(page.getByTestId('moves')).toHaveText('1 move');
  // Rotate the bridged track three times by dragging (the on-screen pad is gone).
  const cell = Number(await page.locator('.tile.scaffolded').first().getAttribute('data-cell'));
  const pitch = await cellPitch(page);
  for (const left of [2, 1]) {
    await touchDrag(page, cell, [{ dx: 1, dy: pitch }], { holdMs: 100 });
    await expect(page.getByTestId('scaffold-remaining')).toContainText(`${left} rotation`);
  }
  await touchDrag(page, cell, [{ dx: 1, dy: pitch }], { holdMs: 100 });
  await expect(page.getByTestId('scaffold-bridge')).toHaveCount(0);
  await expect(page.getByTestId('scaffold-remaining')).toHaveCount(0);
  await expect(page.getByTestId('moves')).toHaveText('4 moves');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('scaffold-remaining')).toContainText('1 rotation');
});

test('settings: sound, haptics and reduced motion toggles persist across reloads', async ({ page }) => {
  await fresh(page);
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('toggle-sound')).not.toBeChecked();
  await expect(page.getByTestId('toggle-haptics')).toBeChecked();
  await page.getByTestId('toggle-sound').click({ force: true });
  await page.getByTestId('toggle-haptics').click({ force: true });
  await page.getByTestId('toggle-motion').click({ force: true });
  await page.reload();
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('toggle-sound')).toBeChecked();
  await expect(page.getByTestId('toggle-haptics')).not.toBeChecked();
  await expect(page.getByTestId('toggle-motion')).toBeChecked();
  const s = JSON.parse((await page.evaluate(() => localStorage.getItem('genome-save')))!).settings;
  expect(s).toEqual({ reducedMotion: true, sound: true, haptics: false });
});

test('an M2 save upgrades to v7, keeps intro completions, with a notice and a backup', async ({ page }) => {
  await page.goto('/');
  const ids = ['ins-01', 'ins-02', 'ins-03', 'ins-04', 'ins-05', 'ins-06', 'hbb-01'];
  const m2 = { schemaVersion: 2, campaignId: 'genome-m2-ins-hbb', generatorVersion: 'm2-gen-1', datasets: { INS: 'refseq-NM_000207.3-2026-11-13', HBB: 'refseq-NM_000518.5-2026-11-13' }, currentLevelId: 'hbb-02', completed: ids, discovered: ['INS'], attempts: {}, legacy: { m1Completed: [] }, settings: { reducedMotion: false } };
  await page.evaluate((raw) => { localStorage.clear(); localStorage.setItem('genome-save', raw); }, JSON.stringify(m2));
  await page.reload();
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await expect(page.getByTestId('notice')).toContainText('full gene assembly');
  expect(await page.evaluate(() => localStorage.getItem('genome-save-backup-m2'))).toContain('"schemaVersion":2');
  const saved = JSON.parse((await page.evaluate(() => localStorage.getItem('genome-save')))!);
  expect(saved.schemaVersion).toBe(7);
  expect(saved.completed).toEqual(ids);
  expect(saved.discovered).toEqual(['INS', 'HBB']);
  await openMap(page);
  await expect(page.getByTestId('cat-progress-INS')).toContainText('51 / 333');
});
