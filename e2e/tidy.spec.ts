import { expect, test, type Page } from '@playwright/test';
import pack from '../src/campaign/chapters.generated.json' with { type: 'json' };
import type { LevelDefinition } from '../src/engine/types.ts';
import { completedLevelSave, expectChapterHeading, expectOpeningHeading, fresh, goToChapter, openChapter, openCompleted, openMap } from './helpers';

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


/** Badges share a left x; corresponding chips share a column x and width (within 1px). */
async function expectClueAlignment(page: Page): Promise<void> {
  const badges = page.locator('[data-testid^="clue-badge-"]');
  const xs = await badges.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().x));
  expect(xs.length).toBeGreaterThanOrEqual(1);
  for (const x of xs) expect(Math.abs(x - xs[0]!)).toBeLessThanOrEqual(1);
  const parts = await page.locator('[data-testid^="clue-part-"]').evaluateAll((els) => els
    .filter((p) => !p.classList.contains('pair-bonds'))
    .map((p) => [...p.querySelectorAll('.tok-chip:not(.gap), .strip-cell:not(.gap)')].map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width };
    })));
  if (parts.length < 2) return;
  const n = Math.min(parts[0]!.length, parts[1]!.length);
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    expect(Math.abs(parts[0]![i]!.x - parts[1]![i]!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(parts[0]![i]!.w - parts[1]![i]!.w)).toBeLessThanOrEqual(1);
  }
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

test('INS 7/13 has no full-sequence box or tile inspector under the board', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openChapter(page, 'ins-c01');
  await expect(page.getByTestId('play-progress')).toHaveText('7/13');
  await expect(page.getByTestId('target-panel')).toBeVisible();
  await expect(page.getByTestId('target-sequence')).toHaveCount(0);
  await expect(page.getByTestId('token-inspector')).toHaveCount(0);
  await page.locator('.tile.tok').first().click();
  await expect(page.getByTestId('token-inspector')).toHaveCount(0);
  await expect(page.getByTestId('energy')).toBeVisible();
  await page.screenshot({ path: '/workspace/game/screenshots/genome-ins7-tidy-390x844.png' });
});

test('splice clue keeps + on piece 1’s line and aligns piece numbers at 320 and 390', async ({ page }) => {
  for (const width of [320, 390] as const) {
    await page.setViewportSize({ width, height: 844 });
    await openChapter(page, 'ins-c02');
    await expect(page.getByTestId('target-panel')).toBeVisible();
    await expect(page.getByTestId('clue-part-1').locator('.plus')).toHaveCount(1);
    await expect(page.getByTestId('clue-part-2').locator('.plus')).toHaveCount(0);
    await expectClueAlignment(page);
    if (width === 390) {
      await page.screenshot({ path: '/workspace/game/screenshots/genome-clue-align-390x844.png' });
    }
  }
});

test('level map lists the re-planned INS run without overlapping chapters', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fresh(page);
  await openMap(page);
  await expect(page.getByTestId('cat-progress-INS')).toContainText('13 puzzles');
  await expect(page.getByTestId('cat-progress-INS')).toContainText('6 intro + 7 assembly');
  await page.screenshot({ path: '/workspace/game/screenshots/genome-progression-map-390x844.png' });
});

test('map run squares form one fixed-column grid, including the play square, at 320, 390 and 430', async ({ page }) => {
  for (const width of [320, 390, 430] as const) {
    await page.setViewportSize({ width, height: 844 });
    await fresh(page);
    await openMap(page);
    await expect(page.getByTestId('run-nodes-INS')).toBeVisible();
    await expect(page.getByTestId('catalogue-count')).toHaveCount(0);
    await expect(page.getByText('Intro · 1-base tiles')).toHaveCount(0);
    await expect(page.getByText('Assembly · multi-base tiles')).toHaveCount(0);
    const boxes = await page.getByTestId('run-nodes-INS').locator('.cnode').evaluateAll((els) => els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, play: e.classList.contains('play') };
    }));
    expect(boxes.length).toBe(14); // 13 INS puzzles + play square
    const w0 = boxes[0]!.w;
    const h0 = boxes[0]!.h;
    expect(Math.abs(w0 - h0)).toBeLessThanOrEqual(1);
    for (const b of boxes) {
      expect(Math.abs(b.w - w0)).toBeLessThanOrEqual(1);
      expect(Math.abs(b.h - h0)).toBeLessThanOrEqual(1);
    }
    const play = boxes.find((b) => b.play);
    expect(play).toBeDefined();
    const rows: typeof boxes[] = [];
    for (const b of boxes) {
      const row = rows.find((r) => Math.abs(r[0]!.y - b.y) <= 1);
      if (row) row.push(b);
      else rows.push([b]);
    }
    expect(rows.length).toBeGreaterThan(1); // INS run wraps at these widths
    const colX = rows[0]!.map((b) => b.x);
    const colRight = rows[0]!.map((b) => b.right);
    if (colX.length >= 3) {
      const gaps = colX.slice(1).map((x, i) => x - colX[i]!);
      for (const g of gaps) expect(Math.abs(g - gaps[0]!)).toBeLessThanOrEqual(1);
    }
    for (const b of boxes) {
      expect(colX.some((x) => Math.abs(b.x - x) <= 1)).toBe(true);
      expect(colRight.some((r) => Math.abs(b.right - r) <= 1)).toBe(true);
    }
    // Adjacent squares (including wrap and the play square) share a single 1px line, not a doubled 2px seam.
    const first = rows[0]!;
    if (first.length >= 2) {
      expect(Math.abs(first[0]!.right - first[1]!.x - 1)).toBeLessThanOrEqual(1);
    }
    expect(Math.abs(rows[1]![0]!.y - (rows[0]![0]!.y + rows[0]![0]!.h) + 1)).toBeLessThanOrEqual(1);
    if (width === 390) {
      await page.screenshot({ path: '/workspace/game/screenshots/genome-map-tidy-390x844.png' });
      await page.screenshot({ path: '/workspace/game/screenshots/genome-map-single-lines-390x844.png' });
    }
  }
});

test('repair clue keeps labels in one column, chips lined up, and the gap at the end of piece 1 at 320 and 390', async ({ page }) => {
  for (const width of [320, 390] as const) {
    await page.setViewportSize({ width, height: 844 });
    await openChapter(page, 'ins-c04');
    await expect(page.getByTestId('target-panel')).toBeVisible();
    await expect(page.getByTestId('clue-part-1').getByTestId('repair-slot')).toBeVisible();
    await expect(page.getByTestId('clue-part-2').getByTestId('repair-slot')).toHaveCount(0);
    await expect(page.getByTestId('repair-slot')).toContainText('?×');
    await expect(page.getByTestId('target-panel').getByText(/^0$/)).toHaveCount(0);
    await expectClueAlignment(page);
    const slot = page.getByTestId('repair-slot');
    const chip = page.getByTestId('clue-part-1').locator('.tok-chip:not(.gap), .strip-cell:not(.gap)').first();
    const slotBox = (await slot.boundingBox())!;
    const chipBox = (await chip.boundingBox())!;
    expect(Math.abs(slotBox.y - chipBox.y)).toBeLessThanOrEqual(8);
    expect(slotBox.x).toBeGreaterThan(chipBox.x);
    if (width === 390) {
      await page.screenshot({ path: '/workspace/game/screenshots/genome-repair-clue-390x844.png' });
    }
  }
});

test('replication and sequencing clues use the same left-aligned piece labels at 320 and 390', async ({ page }) => {
  for (const width of [320, 390] as const) {
    await page.setViewportSize({ width, height: 844 });
    await openChapter(page, 'ins-c03');
    await expect(page.getByTestId('target-panel')).toBeVisible();
    await expectClueAlignment(page);
    await openChapter(page, 'ins-c05');
    await expect(page.getByTestId('clue-badge-1')).toBeVisible();
    await expectClueAlignment(page);
  }
});
