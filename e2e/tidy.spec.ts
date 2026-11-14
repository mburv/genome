import { expect, test, type Page } from '@playwright/test';
import pack from '../src/campaign/chapters.generated.json' with { type: 'json' };
import type { LevelDefinition } from '../src/engine/types.ts';
import { completedLevelSave, expectChapterHeading, expectOpeningHeading, fresh, goToChapter, openChapter, openCompleted } from './helpers';

const def = (pack.levels as LevelDefinition[])[0]!;

function assertCentred(banner: { x: number; y: number; width: number; height: number }, board: { x: number; y: number; width: number; height: number }) {
  const bcx = board.x + board.width / 2;
  const bcy = board.y + board.height / 2;
  const x = banner.x + banner.width / 2;
  const y = banner.y + banner.height / 2;
  expect(Math.abs(x - bcx)).toBeLessThanOrEqual(4);
  expect(Math.abs(y - bcy)).toBeLessThanOrEqual(4);
  expect(banner.x).toBeGreaterThanOrEqual(board.x - 0.5);
  expect(banner.x + banner.width).toBeLessThanOrEqual(board.x + board.width + 0.5);
  expect(banner.y).toBeGreaterThanOrEqual(board.y - 0.5);
  expect(banner.y + banner.height).toBeLessThanOrEqual(board.y + board.height + 0.5);
}

test('play header shows the current gene and locus; the info card is gone; Map lives in Settings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fresh(page);
  await expectOpeningHeading(page);
  await expect(page.getByTestId('play-locus')).toHaveText('CHROMOSOME 11 · NM_000207.3');
  const typography = await page.evaluate(() => {
    const style = (id: string) => {
      const cs = getComputedStyle(document.querySelector(`[data-testid="${id}"]`)!);
      return { fontSize: cs.fontSize, fontWeight: cs.fontWeight, letterSpacing: cs.letterSpacing, textTransform: cs.textTransform, fontFamily: cs.fontFamily };
    };
    return { progress: style('play-progress'), fullName: style('play-fullname'), detail: style('play-detail'), locus: style('play-locus') };
  });
  expect(typography.progress).toEqual(typography.locus);
  expect(typography.fullName).toEqual(typography.locus);
  expect(typography.detail.fontSize).toBe(typography.locus.fontSize);
  await page.screenshot({ path: '/workspace/game/screenshots/genome-header-390x844.png' });
  await expect(page.getByRole('heading', { name: 'GENOME' })).toHaveCount(0);
  await expect(page.getByText('Build what makes you human')).toHaveCount(0);
  await expect(page.locator('.panel.info')).toHaveCount(0);
  await expect(page.getByTestId('level-label')).toHaveCount(0);
  await expect(page.getByTestId('mode-label')).toHaveCount(0);
  await expect(page.getByTestId('progress-text')).toHaveCount(0);
  await expect(page.getByTestId('open-map')).toHaveCount(0);
  const mark = await page.locator('h1').evaluate((el) => getComputedStyle(el, '::before').content);
  expect(mark === 'none' || mark === 'normal').toBe(true);
  // Heading and locus must fit the 320px-wide header area too; check after a resize later.
  await page.screenshot({ path: '/workspace/game/screenshots/genome-tidy-board-390x844.png' });

  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'GENOME' })).toBeVisible();
  await page.getByTestId('open-map').click();
  await expect(page.getByTestId('level-map')).toBeVisible();
});

test('heading stays compact at 320px and updates on the next gene', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openChapter(page, 'hbb-c01');
  await expectChapterHeading(page, 'HBB', 7, 15, 'HEMOGLOBIN SUBUNIT BETA');
  await expect(page.getByTestId('play-locus')).toHaveText('CHROMOSOME 11 · NM_000518.5');
  const typography = await page.evaluate(() => {
    const sizeOf = (id: string) => getComputedStyle(document.querySelector(`[data-testid="${id}"]`)!).fontSize;
    return { progress: sizeOf('play-progress'), fullName: sizeOf('play-fullname'), locus: sizeOf('play-locus') };
  });
  expect(typography.progress).toBe(typography.locus);
  expect(typography.fullName).toBe(typography.locus);
  const heading = (await page.getByTestId('play-heading').boundingBox())!;
  expect(heading.x).toBeGreaterThanOrEqual(0);
  expect(heading.x + heading.width).toBeLessThanOrEqual(320);
  const overflow = await page.evaluate(() => {
    const heading = document.querySelector('[data-testid="play-heading"]') as HTMLElement;
    const detail = document.querySelector('[data-testid="play-detail"]') as HTMLElement;
    const locus = document.querySelector('[data-testid="play-locus"]') as HTMLElement;
    const row = heading.querySelector('.play-title-row') as HTMLElement;
    const measure = (el: HTMLElement) => ({ scroll: el.scrollWidth, client: el.clientWidth, overflow: el.scrollWidth - el.clientWidth });
    return { heading: measure(heading), row: measure(row), detail: measure(detail), locus: measure(locus) };
  });
  expect(overflow.heading.overflow).toBeLessThanOrEqual(0);
  expect(overflow.row.overflow).toBeLessThanOrEqual(0);
  expect(overflow.detail.overflow).toBeLessThanOrEqual(0);
  expect(overflow.locus.overflow).toBeLessThanOrEqual(0);
});

for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }] as const) {
  test(`Solved banner is centred over the board at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    const { raw } = completedLevelSave(def, { lastMoves: 5, bestMoves: 2 });
    await openCompleted(page, raw);
    await page.getByTestId('cnode-ins-c01').click();
    await page.getByTestId('board').waitFor();
    const banner = page.getByTestId('solved-banner');
    await expect(banner).toBeVisible();
    await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next level →' })).toBeVisible();
    const b = (await banner.boundingBox())!;
    const board = (await page.getByTestId('board').boundingBox())!;
    assertCentred(b, board);
    if (size.width === 390) {
      await page.screenshot({ path: '/workspace/game/screenshots/genome-tidy-solved-390x844.png' });
    }
  });
}

const NOTE_FRAGMENTS = [
  'illustrative',
  'exon boundaries',
  'Pieces join in order',
  'Tiles match by sequence',
  'Aligned complement',
  'reference assembly gap',
  'Only strand 1 counts',
  'Read left',
  'Read top',
];

async function assertCluePanelClean(page: Page, width: number) {
  const panel = page.getByTestId('target-panel');
  await expect(panel).toBeVisible();
  for (const text of NOTE_FRAGMENTS) await expect(panel).not.toContainText(text);
  const metrics = await page.evaluate(() => {
    const target = document.querySelector('[data-testid="target-panel"]') as HTMLElement;
    const header = document.querySelector('.top') as HTMLElement;
    const board = document.querySelector('[data-testid="board"]') as HTMLElement;
    const cs = getComputedStyle(target);
    const t = target.getBoundingClientRect();
    const h = header.getBoundingClientRect();
    const b = board.getBoundingClientRect();
    return {
      borderTopWidth: cs.borderTopWidth,
      overflow: target.scrollWidth - target.clientWidth,
      target: { x: t.x, y: t.y, width: t.width, bottom: t.bottom },
      headerBottom: h.bottom,
      boardTop: b.y,
      boardWidth: b.width,
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  expect(metrics.borderTopWidth).toBe('0px');
  expect(metrics.overflow).toBeLessThanOrEqual(0);
  expect(metrics.pageOverflow).toBeLessThanOrEqual(0);
  expect(metrics.target.x).toBeGreaterThanOrEqual(0);
  expect(metrics.target.x + metrics.target.width).toBeLessThanOrEqual(width);
  const gap = metrics.target.y - metrics.headerBottom;
  expect(gap).toBeGreaterThanOrEqual(6);
  expect(gap).toBeLessThanOrEqual(16);
  expect(metrics.boardTop).toBeGreaterThan(metrics.target.y + 8);
  expect(metrics.boardWidth).toBeGreaterThanOrEqual(width - 1);
}

for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }] as const) {
  test(`clue panel has no footer note or top divider at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    // Chapter modes: sequence, splice, replicate, repair.
    test.setTimeout(60_000);
    await fresh(page);
    for (const id of ['ins-c01', 'ins-c02', 'ins-c03', 'ins-c04'] as const) {
      await goToChapter(page, id);
      await assertCluePanelClean(page, size.width);
      if (size.width === 390 && id === 'ins-c02') {
        await page.screenshot({ path: '/workspace/game/screenshots/genome-clue-390x844.png' });
      }
    }
    await assertCluePanelClean(page, size.width);
  });
}

async function assertPlayScreenDecluttered(page: Page, width: number) {
  await expect(page.locator('.dpad')).toHaveCount(0);
  await expect(page.getByTestId('status')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Slide (row|column)/ })).toHaveCount(0);
  await expect(page.getByTestId('help-how-to-play')).toHaveCount(0);
  await expect(page.getByTestId('help-about-dna')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hint' })).toBeVisible();
  const metrics = await page.evaluate(() => {
    const board = document.querySelector('[data-testid="board"]') as HTMLElement;
    const b = board.getBoundingClientRect();
    return {
      boardWidth: b.width,
      boardHeight: b.height,
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
      x: b.x,
    };
  });
  expect(metrics.x).toBeGreaterThanOrEqual(0);
  expect(metrics.x + metrics.boardWidth).toBeLessThanOrEqual(width);
  expect(Math.abs(metrics.boardWidth - metrics.boardHeight)).toBeLessThan(2);
  expect(metrics.boardWidth).toBeGreaterThanOrEqual(width - 1);
  expect(metrics.pageOverflow).toBeLessThanOrEqual(0);
}

for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }] as const) {
  test(`puzzle screen has no pad, status or help links at ${size.width}x${size.height}; help lives in Settings`, async ({ page }) => {
    await page.setViewportSize(size);
    await fresh(page);
    await assertPlayScreenDecluttered(page, size.width);
    if (size.width === 390) {
      await page.screenshot({ path: '/workspace/game/screenshots/genome-declutter-390x844.png' });
    }
    await page.getByTestId('open-settings').click();
    await expect(page.getByTestId('settings')).toBeVisible();
    await expect(page.getByTestId('help-how-to-play')).toBeVisible();
    await expect(page.getByTestId('help-about-dna')).toBeVisible();
    if (size.width === 390) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: '/workspace/game/screenshots/genome-settings-390x844.png' });
    }
    await page.getByTestId('help-how-to-play').locator('summary').click();
    await expect(page.getByTestId('help-how-to-play')).toContainText('Drag a tile left/right');
    await expect(page.getByTestId('help-how-to-play')).not.toContainText('arrow buttons');
    await page.getByTestId('help-about-dna').locator('summary').click();
    await expect(page.getByTestId('help-about-dna')).toContainText('NM_000207.3');
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByTestId('board')).toBeVisible();
    await expect(page.getByTestId('settings')).toHaveCount(0);
    await assertPlayScreenDecluttered(page, size.width);
  });
}
