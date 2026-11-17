import { expect, test } from '@playwright/test';
import { fresh, openChapter, openMap } from './helpers';


test('campaign sliding levels show only Undo, Hint and Restart', async ({ page }) => {
  for (const id of ['ins-01','ins-c04','ins-c05','hbb-c03','hbb-c07','hbb-c08']) {
    await openChapter(page,id);
    await expect(page.getByTestId('energy')).toHaveCount(0);
    await expect(page.getByTestId('power-crispr')).toHaveCount(0);
    await expect(page.getByTestId('icon-row').locator('button')).toHaveCount(3);
    for (const name of ['Undo','Hint','Restart']) await expect(page.getByRole('button',{name,exact:true})).toBeVisible();
  }
});
test('campaign control row fits at 320, 375, 390 and 430', async ({page}) => {
  for (const width of [320,375,390,430]) {
    await page.setViewportSize({width,height:568});
    await openChapter(page,'hbb-c08');
    const row=page.getByTestId('icon-row'), under=page.getByTestId('under-board');
    const r=(await row.boundingBox())!, u=(await under.boundingBox())!;
    expect(r.x).toBeGreaterThanOrEqual(u.x-1);
    expect(r.x+r.width).toBeLessThanOrEqual(u.x+u.width+1);
    await expect(row.locator('button')).toHaveCount(3);
  }
});

test('map replaces retired Enzyme Lab with Mechanics Lab', async ({ page }) => {
  await fresh(page);
  await openMap(page);
  await expect(page.getByTestId('lab-panel')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Enzyme lab/ })).toHaveCount(0);
  await page.getByTestId('open-mechanics').click();
  await expect(page.getByTestId('mechanics-menu')).toBeVisible();
  await expect(page.locator('.mechanic-entry')).toHaveCount(6);
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
