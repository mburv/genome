import { expect, test, type Page } from '@playwright/test';
import pack from '../src/campaign/chapters.generated.json' with { type: 'json' };
import type { LevelDefinition } from '../src/engine/types.ts';
import { completedLevelSave, expectOpeningHeading, openCompleted } from './helpers';

const LEVELS = pack.levels as LevelDefinition[];

function seededSave(): { raw: string; completed: string[] } {
  const a = completedLevelSave(LEVELS[0]!, { bestMoves: 1 });
  const b = completedLevelSave(LEVELS[1]!, { bestMoves: 2 });
  const save = {
    ...a.save,
    currentLevelId: LEVELS[1]!.id,
    completed: [LEVELS[0]!.id, LEVELS[1]!.id],
    attempts: { ...(a.save.attempts as Record<string, unknown>), ...(b.save.attempts as Record<string, unknown>) },
    best: { ...(a.save.best as Record<string, unknown>), ...(b.save.best as Record<string, unknown>) },
    settings: { reducedMotion: false, sound: true, haptics: false },
    legacy: { m1Completed: ['m1-ins-02'] },
  };
  return { raw: JSON.stringify(save), completed: save.completed };
}

async function plantBackups(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.setItem('genome-save-backup', 'old-progress');
    localStorage.setItem('genome-save-backup-m1', 'm1-progress');
  });
}

async function storageKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => Object.keys(localStorage).sort());
}

async function storedSave(page: Page): Promise<{ completed: string[]; best: Record<string, unknown>; settings: { sound: boolean; haptics: boolean; reducedMotion: boolean }; currentLevelId: string; discovered: string[]; assembled: string[]; attempts: Record<string, unknown>; legacy: { m1Completed: string[] } }> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('genome-save')!));
}

for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }] as const) {
  test(`Reset progress: cancel keeps it, confirm wipes it at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    const seed = seededSave();
    await openCompleted(page, seed.raw);
    await plantBackups(page);
    await expect(page.getByTestId('cat-progress-INS')).toContainText('63 / 333');
    await expect(page.locator('.cnode.done')).toHaveCount(2);
    await expect(page.getByTestId('legacy-m1')).toBeVisible();

    await page.getByTestId('open-settings').click();
    await expect(page.getByTestId('toggle-sound')).toBeChecked();
    await expect(page.getByTestId('toggle-haptics')).not.toBeChecked();
    await page.getByTestId('reset-progress').click();
    const confirm = page.getByTestId('reset-confirm');
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText('all level progress, stars, best scores and unlocks');
    await expect(confirm).toContainText('cannot be undone');
    await expect(page.getByTestId('reset-cancel')).toBeFocused();
    if (size.width === 390) {
      await confirm.scrollIntoViewIfNeeded();
      await page.screenshot({ path: '/workspace/game/screenshots/genome-reset-390x844.png' });
    }

    await page.getByTestId('reset-cancel').click();
    await expect(confirm).toHaveCount(0);
    await expect(page.getByTestId('reset-progress')).toBeVisible();
    await page.getByTestId('open-map').click();
    await expect(page.getByTestId('cat-progress-INS')).toContainText('63 / 333');
    await expect(page.locator('.cnode.done')).toHaveCount(2);
    expect(await storageKeys(page)).toEqual(expect.arrayContaining(['genome-save', 'genome-save-backup', 'genome-save-backup-m1']));
    expect((await storedSave(page)).completed).toEqual(seed.completed);

    await page.getByTestId('open-settings').click();
    await page.getByTestId('reset-progress').click();
    await page.getByTestId('reset-confirm-btn').click();

    await expect(page.getByTestId('level-map')).toBeVisible();
    await expect(page.getByTestId('board')).toHaveCount(0);
    await expect(page.getByTestId('settings')).toHaveCount(0);
    await expect(page.getByTestId('reset-confirm')).toHaveCount(0);
    await expect(page.getByTestId('continue')).toHaveText(/Start · INS 1\/13/);
    if (size.width === 390) {
      await page.screenshot({ path: '/workspace/game/screenshots/genome-basics-map-390x844.png', animations: 'disabled' });
    }

    await page.getByTestId('open-settings').click();
    await expect(page.getByTestId('toggle-sound')).toBeChecked();
    await expect(page.getByTestId('toggle-haptics')).not.toBeChecked();
    await expect(page.getByTestId('toggle-motion')).not.toBeChecked();
    await page.getByTestId('open-map').click();
    await expect(page.getByTestId('continue')).toHaveText(/Start · INS 1\/13/);
    await expect(page.getByTestId('cat-progress-INS')).toContainText('0 / 333');
    await expect(page.getByTestId('cat-progress-HBB')).toContainText('0 / 444');
    await expect(page.locator('.cnode.done')).toHaveCount(0);
    await expect(page.getByTestId('cat-INS')).toContainText('New');
    await expect(page.getByTestId('cat-HBB')).toContainText('New');
    await expect(page.getByTestId('legacy-m1')).toHaveCount(0);

    const keys = await storageKeys(page);
    expect(keys).toEqual(['genome-save']);
    const saved = await storedSave(page);
    expect(saved.completed).toEqual([]);
    expect(saved.best).toEqual({});
    expect(saved.discovered).toEqual([]);
    expect(saved.assembled).toEqual([]);
    expect(saved.attempts).toEqual({});
    expect(saved.legacy.m1Completed).toEqual([]);
    expect(saved.currentLevelId).toBe('ins-01');
    expect(saved.settings).toEqual({ reducedMotion: false, sound: true, haptics: false });

    await page.reload();
    await expect(page.getByTestId('board')).toBeVisible();
    await expectOpeningHeading(page);
    await expect(page.getByTestId('hint-cue')).toBeVisible();
    await page.getByTestId('open-settings').click();
    await expect(page.getByTestId('toggle-sound')).toBeChecked();
    await expect(page.getByTestId('toggle-haptics')).not.toBeChecked();
    await page.getByTestId('open-map').click();
    await expect(page.getByTestId('cat-progress-INS')).toContainText('0 / 333');
    await expect(page.locator('.cnode.done')).toHaveCount(0);
    expect(await storageKeys(page)).toEqual(['genome-save']);
  });
}
