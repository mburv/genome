import { expect, test, type Page } from '@playwright/test';
import pack from '../src/campaign/chapters.generated.json' with { type: 'json' };
import {CAMPAIGN_LEVELS} from '../src/campaign/campaign.ts';
import {mechanicOf} from '../src/campaign/mixed.ts';
import type { LevelDefinition } from '../src/engine/types.ts';
import { completedLevelSave, expectChapterHeading, expectOpeningHeading, fresh, goToChapter, openChapter, openCompleted, openMap } from './helpers';

const ALL_LEVEL_IDS = CAMPAIGN_LEVELS.filter(l=>mechanicOf(l)==='slide').map(l=>l.id);

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


type ClueBox = { x: number; y: number; width: number; height: number; right: number; bottom: number };
type CluePartBox = {
  x: number; y: number; width: number; right: number; bottom: number;
  badge: ClueBox | null; chips: ClueBox[]; dir: ClueBox | null; plus: ClueBox | null;
};

/** Labels and arrows stay with their piece; pieces sit inline and left-align when they wrap. */
async function expectClueAlignment(page: Page): Promise<void> {
  const { parts, replicate } = await page.locator('[data-testid="target-panel"]').evaluate((panel) => {
    const box = (e: Element): ClueBox => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    const parts = [...panel.querySelectorAll('[data-testid^="clue-part-"]')]
      .filter((p) => !p.classList.contains('pair-bonds') && p.getClientRects().length > 0)
      .map((p) => {
        const r = p.getBoundingClientRect();
        return {
          x: r.x, y: r.y, width: r.width, right: r.right, bottom: r.bottom,
          badge: p.querySelector('[data-testid^="clue-badge-"]') ? box(p.querySelector('[data-testid^="clue-badge-"]')!) : null,
          chips: [...p.querySelectorAll('.tok-chip:not(.gap), .strip-cell:not(.gap)')].filter(e => e.getClientRects().length > 0).map(box),
          dir: p.querySelector('.clue-dir') ? box(p.querySelector('.clue-dir')!) : null,
          plus: p.querySelector('.plus') ? box(p.querySelector('.plus')!) : null,
        };
      });
    return { parts, replicate: !!panel.querySelector('.clue-stack.mode-replicate') };
  });
  expect(parts.length).toBeGreaterThanOrEqual(1);

  for (const p of parts) {
    if (p.badge && p.chips[0]) {
      const first = p.chips[0];
      expect(p.badge.x).toBeLessThan(first.x);
      expect(Math.abs(p.badge.y - first.y)).toBeLessThanOrEqual(8);
      // Replication keeps a 5′ mark between the badge and the first chip.
      if (!replicate) expect(first.x - p.badge.right).toBeLessThanOrEqual(8);
    }
    const last = p.chips[p.chips.length - 1];
    if (p.dir && last) {
      if (Math.abs(p.dir.y - last.y) <= 8) expect(p.dir.x).toBeGreaterThan(last.right - 1);
      else expect(p.dir.y).toBeGreaterThan(last.y);
    }
    if (p.plus) {
      const after = p.dir ?? last;
      if (after && Math.abs(p.plus.y - after.y) <= 8) expect(p.plus.x).toBeGreaterThan(after.x);
      else if (after) expect(p.plus.y).toBeGreaterThan(after.y);
    }
  }

  const rows: CluePartBox[][] = [];
  for (const p of parts) {
    const row = rows.find((r) => Math.abs(r[0]!.y - p.y) <= 8);
    if (row) row.push(p);
    else rows.push([p]);
  }
  for (const row of rows) {
    for (let i = 1; i < row.length; i++) {
      expect(row[i]!.x).toBeGreaterThan(row[i - 1]!.right - 2);
      if (row[i - 1]!.plus) expect(row[i]!.x).toBeGreaterThan(row[i - 1]!.plus!.x);
    }
  }
  if (rows.length >= 2) {
    const firstX = rows[0]![0]!.x;
    for (const row of rows.slice(1)) {
      expect(Math.abs(row[0]!.x - firstX)).toBeLessThanOrEqual(2);
    }
    for (let r = 0; r < rows.length - 1; r++) {
      const prevLast = rows[r]![rows[r]!.length - 1]!;
      if (prevLast.plus) expect(prevLast.plus.y).toBeLessThan(rows[r + 1]![0]!.y + 2);
    }
  }

  if (replicate) await expectReplicatePairs(page);
}

/** Template / complement chips share a column; wrapped pair-chunks left-align with the first chip column. */
async function expectReplicatePairs(page: Page): Promise<void> {
  const data = await page.locator('[data-testid="target-panel"]').evaluate((panel) => {
    const box = (e: Element) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    const pairs = [...panel.querySelectorAll('.rep-pair')].filter(p => p.getClientRects().length > 0).map((p) => {
      const chips = [...p.querySelectorAll('.tok-chip, .strip-cell')].map(box);
      const bond = p.querySelector('.rep-bond');
      const r = p.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, template: chips[0] ?? null, complement: chips[1] ?? null, bond: bond ? box(bond) : null };
    });
    const badge1 = panel.querySelector('[data-testid="clue-badge-1"]');
    const badge2 = panel.querySelector('[data-testid="clue-badge-2"]');
    const ends = [...panel.querySelectorAll('.rep-start .end, .rep-end .end')].map((e) => ({ text: (e.textContent ?? '').trim(), ...box(e) }));
    const repEnd = panel.querySelector('.rep-end')!;
    const endGap = parseFloat(getComputedStyle(repEnd).marginInlineStart);
    return {
      pairs,
      badge1: badge1 ? box(badge1) : null,
      badge2: badge2 ? box(badge2) : null,
      ends,
      endGap,
    };
  });
  expect(data.pairs.length).toBeGreaterThan(0);
  expect(data.endGap).toBeGreaterThanOrEqual(5);
  for (const p of data.pairs) {
    expect(p.template).toBeTruthy();
    expect(p.complement).toBeTruthy();
    expect(Math.abs(p.template!.x - p.complement!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(p.template!.width - p.complement!.width)).toBeLessThanOrEqual(1);
    expect(p.complement!.y).toBeGreaterThan(p.template!.bottom - 1);
    if (p.bond) {
      expect(p.bond.y).toBeGreaterThanOrEqual(p.template!.bottom - 2);
      expect(p.bond.bottom).toBeLessThanOrEqual(p.complement!.y + 2);
      expect(p.bond.x).toBeGreaterThanOrEqual(p.template!.x - 1);
      expect(p.bond.right).toBeLessThanOrEqual(p.template!.right + 1);
    }
  }
  if (data.badge1 && data.pairs[0]!.template) {
    expect(data.badge1.x).toBeLessThan(data.pairs[0]!.template.x);
    expect(Math.abs(data.badge1.y - data.pairs[0]!.template.y)).toBeLessThanOrEqual(8);
  }
  if (data.badge2 && data.pairs[0]!.complement) {
    expect(data.badge2.x).toBeLessThan(data.pairs[0]!.complement.x);
    expect(Math.abs(data.badge2.y - data.pairs[0]!.complement.y)).toBeLessThanOrEqual(8);
  }
  const rows: typeof data.pairs[] = [];
  for (const p of data.pairs) {
    const row = rows.find((r) => Math.abs(r[0]!.y - p.y) <= 8);
    if (row) row.push(p);
    else rows.push([p]);
  }
  if (rows.length >= 2) {
    const firstX = rows[0]![0]!.x;
    for (const row of rows.slice(1)) {
      expect(Math.abs(row[0]!.x - firstX)).toBeLessThanOrEqual(2);
    }
  }
}


test('play header shows the current gene and locus; the info card is gone; Map lives in Settings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openChapter(page, 'ins-01');
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
  await page.screenshot({ path: 'test-results/screenshots/genome-header-390x844.png' });
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
  await page.screenshot({ path: 'test-results/screenshots/genome-tidy-board-390x844.png' });

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
      await page.screenshot({ path: 'test-results/screenshots/genome-tidy-solved-390x844.png' });
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

async function assertCluePanelClean(page: Page, width: number, height: number) {
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
  if (height >= 700) expect(metrics.boardWidth).toBeGreaterThanOrEqual(width - 1);
  else expect(metrics.boardWidth).toBeGreaterThan(27.5 * 9);
}

for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }] as const) {
  test(`clue panel has no footer note or top divider at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    // Chapter modes: sequence, splice, replicate, repair.
    test.setTimeout(60_000);
    await fresh(page);
    for (const id of ['ins-c01', 'ins-c02', 'ins-c03', 'ins-c04'] as const) {
      await goToChapter(page, id);
      await assertCluePanelClean(page, size.width, size.height);
      if (size.width === 390 && id === 'ins-c02') {
        await page.screenshot({ path: 'test-results/screenshots/genome-clue-390x844.png' });
      }
    }
    await assertCluePanelClean(page, size.width, size.height);
  });
}

async function assertPlayScreenDecluttered(page: Page, width: number, height: number) {
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
  if (height >= 700) expect(metrics.boardWidth).toBeGreaterThanOrEqual(width - 1);
  else {
    expect(Math.abs(metrics.x - (width - (metrics.x + metrics.boardWidth)))).toBeLessThanOrEqual(1);
    expect(metrics.boardWidth).toBeGreaterThan(27.5 * 9);
  }
  expect(metrics.pageOverflow).toBeLessThanOrEqual(0);
}

for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }] as const) {
  test(`puzzle screen has no pad, status or help links at ${size.width}x${size.height}; help lives in Settings`, async ({ page }) => {
    await page.setViewportSize(size);
    await openChapter(page, 'ins-01');
    await assertPlayScreenDecluttered(page, size.width, size.height);
    if (size.width === 390) {
      await page.screenshot({ path: 'test-results/screenshots/genome-declutter-390x844.png' });
    }
    await page.getByTestId('open-settings').click();
    await expect(page.getByTestId('settings')).toBeVisible();
    await expect(page.getByTestId('help-how-to-play')).toBeVisible();
    await expect(page.getByTestId('help-about-dna')).toBeVisible();
    if (size.width === 390) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: 'test-results/screenshots/genome-settings-390x844.png' });
    }
    await page.getByTestId('help-how-to-play').locator('summary').click();
    await expect(page.getByTestId('help-how-to-play')).toContainText('Drag a tile left/right');
    await expect(page.getByTestId('help-how-to-play')).not.toContainText('arrow buttons');
    await page.getByTestId('help-about-dna').locator('summary').click();
    await expect(page.getByTestId('help-about-dna')).toContainText('NM_000207.3');
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByTestId('board')).toBeVisible();
    await expect(page.getByTestId('settings')).toHaveCount(0);
    await assertPlayScreenDecluttered(page, size.width, size.height);
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
  await expect(page.getByTestId('energy')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/screenshots/genome-ins7-tidy-390x844.png' });
});

test('splice clue lays pieces inline, keeps + on the previous piece, and wraps cleanly at 320–430', async ({ page }) => {
  test.setTimeout(60_000);
  for (const width of [320, 375, 390, 430] as const) {
    await page.setViewportSize({ width, height: 844 });
    for (const id of ['hbb-06', 'ins-c02'] as const) {
      await openChapter(page, id);
      await expect(page.getByTestId('target-panel')).toBeVisible();
      await expect(page.getByTestId('clue-part-1').locator('.plus')).toHaveCount(1);
      await expect(page.locator('[data-testid^="clue-part-"]').last().locator('.plus')).toHaveCount(0);
      await expectClueAlignment(page);
      await expectClueChipsFit(page);
      if (width === 390 && id === 'hbb-06') {
        await expect(page.locator('.target-title')).toHaveText(/grand splice/i);
        await page.screenshot({ path: 'test-results/screenshots/genome-grand-splice-390x844.png', animations: 'disabled' });
      }
    }
  }
});

test('level map lists the re-planned INS run without overlapping chapters', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fresh(page);
  await openMap(page);
  await expect(page.getByTestId('cat-progress-INS')).toContainText('13 stages');
  await expect(page.getByTestId('cat-progress-INS')).toContainText('7 mechanics');
  await page.screenshot({ path: 'test-results/screenshots/genome-progression-map-390x844.png' });
});

test('map run squares form one fixed-column grid, at 320, 390 and 430', async ({ page }) => {
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
    expect(boxes.length).toBe(13); // numbered campaign levels only
    const w0 = boxes[0]!.w;
    const h0 = boxes[0]!.h;
    expect(Math.abs(w0 - h0)).toBeLessThanOrEqual(1);
    for (const b of boxes) {
      expect(Math.abs(b.w - w0)).toBeLessThanOrEqual(1);
      expect(Math.abs(b.h - h0)).toBeLessThanOrEqual(1);
    }
    const play = boxes.find((b) => b.play);
    expect(play).toBeUndefined();
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
      await page.screenshot({ path: 'test-results/screenshots/genome-map-tidy-390x844.png' });
      await page.screenshot({ path: 'test-results/screenshots/genome-map-single-lines-390x844.png' });
    }
  }
});

test('repair clue keeps the gap at the end of piece 1 and lays pieces inline at 320–430', async ({ page }) => {
  for (const width of [320, 375, 390, 430] as const) {
    await page.setViewportSize({ width, height: 844 });
    await openChapter(page, 'ins-c04');
    await expect(page.getByTestId('target-panel')).toBeVisible();
    await expect(page.getByTestId('clue-part-1').getByTestId('repair-slot')).toBeVisible();
    await expect(page.getByTestId('clue-part-2').getByTestId('repair-slot')).toHaveCount(0);
    await expect(page.getByTestId('repair-slot')).toContainText('?×');
    await expect(page.getByTestId('target-panel').getByText(/^0$/)).toHaveCount(0);
    await expectClueAlignment(page);
    await expectClueChipsFit(page);
    const slot = page.getByTestId('repair-slot');
    const chips = page.getByTestId('clue-part-1').locator('.tok-chip:not(.gap), .strip-cell:not(.gap)');
    const slotBox = (await slot.boundingBox())!;
    const firstBox = (await chips.first().boundingBox())!;
    const lastBox = (await chips.last().boundingBox())!;
    expect(slotBox.x).toBeGreaterThan(firstBox.x - 0.5);
    // Gap stays with piece 1, after its last real chip (same wrap row to the right, or the next row).
    if (Math.abs(slotBox.y - lastBox.y) <= 8) expect(slotBox.x).toBeGreaterThan(lastBox.x);
    else expect(slotBox.y).toBeGreaterThan(lastBox.y);
    if (width === 390) {
      await page.screenshot({ path: 'test-results/screenshots/genome-repair-clue-390x844.png' });
    }
  }
});

test('replication clues pair template over complement and wrap in matched chunks at 320–430', async ({ page }) => {
  test.setTimeout(90_000);
  const levels = ['hbb-c03', 'hbb-c07', 'rho-c07'] as const; // 3-, 6- and 12-base
  for (const width of [320, 375, 390, 430] as const) {
    await page.setViewportSize({ width, height: 844 });
    for (const id of levels) {
      await openChapter(page, id);
      await expect(page.getByTestId('target-panel')).toBeVisible();
      await expect(page.getByTestId('clue-badge-1')).toBeVisible();
      await expect(page.getByTestId('clue-badge-2')).toBeVisible();
      await expectClueAlignment(page);
      await expectClueChipsFit(page);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await openChapter(page, 'hbb-c07');
  await expect(page.locator('.target-title')).toHaveText(/hexamers · replication/i);
  await expect(page.getByTestId('play-progress')).toHaveText('13/15');
  await page.screenshot({ path: 'test-results/screenshots/genome-hbb13-replication-390x844.png', animations: 'disabled' });
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(page.getByTestId('target-panel')).toBeVisible();
  await expectClueAlignment(page);
  await expectClueChipsFit(page);
  expect(await page.getByTestId('target-panel').evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  await expectActionRowInView(page);
  await page.screenshot({ path: 'test-results/screenshots/genome-hbb13-replication-320x568.png', animations: 'disabled' });
});

test('sequencing clues keep labels with their pieces at 320–430', async ({ page }) => {
  for (const width of [320, 375, 390, 430] as const) {
    await page.setViewportSize({ width, height: 844 });
    await openChapter(page, 'ins-c05');
    await expect(page.getByTestId('clue-badge-1')).toBeVisible();
    await expectClueAlignment(page);
    await expectClueChipsFit(page);
  }
});

async function expectClueChipsFit(page: Page): Promise<void> {
  const report = await page.locator('[data-testid="target-panel"]').evaluate((panel) => {
    const overflows: string[] = [];
    const check = (el: Element, name: string) => {
      const h = el as HTMLElement;
      if (h.scrollWidth > h.clientWidth + 1 || h.scrollHeight > h.clientHeight + 1) {
        overflows.push(`${name} scroll=${h.scrollWidth}x${h.scrollHeight} client=${h.clientWidth}x${h.clientHeight} text=${(h.textContent ?? '').trim()}`);
      }
      const cs = getComputedStyle(h);
      if (cs.textOverflow === 'ellipsis' && (cs.overflowX === 'hidden' || cs.overflow === 'hidden') && h.scrollWidth > h.clientWidth + 1) {
        overflows.push(`${name} ellipsis`);
      }
    };
    for (const chip of panel.querySelectorAll('.tok-chip, .strip-cell')) {
      if (!chip.getClientRects().length) continue;
      check(chip, chip.className);
      const label = chip.querySelector('.chip-label');
      if (label) check(label, 'chip-label');
    }
    const pageOverflow = document.documentElement.scrollWidth - window.innerWidth;
    const target = panel as HTMLElement;
    return { overflows, pageOverflow, panelOverflow: target.scrollWidth - target.clientWidth };
  });
  expect(report.overflows, report.overflows.join('; ')).toEqual([]);
  expect(report.pageOverflow).toBeLessThanOrEqual(0);
  expect(report.panelOverflow).toBeLessThanOrEqual(0);
}

/** Wrapped chips share x with the chip/column above. */
async function expectClueWrapColumns(page: Page): Promise<void> {
  const parts = await page.locator('[data-testid^="clue-part-"]').evaluateAll((els) => els
    .filter((p) => !p.classList.contains('pair-bonds') && p.getClientRects().length > 0)
    .map((p) => [...p.querySelectorAll('.tok-chip:not(.gap), .strip-cell:not(.gap)')].filter(e => e.getClientRects().length > 0).map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y };
    })));
  for (const chips of parts) {
    const rows: { x: number; y: number }[][] = [];
    for (const c of chips) {
      const row = rows.find((r) => Math.abs(r[0]!.y - c.y) <= 2);
      if (row) row.push(c);
      else rows.push([c]);
    }
    if (rows.length < 2) continue;
    const colX = rows[0]!.map((c) => c.x);
    expect(Math.abs(rows[1]![0]!.x - colX[0]!)).toBeLessThanOrEqual(2);
    for (const c of rows.slice(1).flat()) {
      expect(colX.some((x) => Math.abs(c.x - x) <= 2)).toBe(true);
    }
  }
}

test('clue chips size to their letters and wrap in columns at 320, 375, 390 and 430', async ({ page }) => {
  test.setTimeout(60_000);
  const levels = [
    { id: 'hbb-c03', heading: 'HBB' },
    { id: 'ins-c05', heading: 'INS' },
    { id: 'hbb-c08', heading: 'HBB' },
  ] as const;
  for (const width of [320, 375, 390, 430] as const) {
    await page.setViewportSize({ width, height: 844 });
    for (const level of levels) {
      await openChapter(page, level.id);
      await expect(page.getByTestId('target-panel')).toBeVisible();
      await expect(page.getByTestId('play-title')).toHaveText(level.heading);
      if (level.id === 'ins-c05') await expect(page.getByTestId('play-progress')).toHaveText('11/13');
      await expectClueChipsFit(page);
      await expectClueAlignment(page);
      await expectClueWrapColumns(page);
      if (width === 390 && level.id === 'ins-c05') {
        await page.screenshot({ path: 'test-results/screenshots/genome-ins11-clue-390x844.png', animations: 'disabled' });
        await page.screenshot({ path: 'test-results/screenshots/genome-clue-inline-ins11-390x844.png', animations: 'disabled' });
      }
    }
  }
});

/** The action row is fully on screen at scroll 0, with no horizontal page overflow. */
async function expectActionRowInView(page: Page): Promise<void> {
  const row = page.getByTestId('icon-row');
  await expect(row).toBeVisible();
  const report = await page.evaluate(() => {
    const row = document.querySelector('[data-testid="icon-row"]') as HTMLElement;
    const r = row.getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      vw: window.innerWidth,
      vh: window.innerHeight,
      pageOverflowX: document.documentElement.scrollWidth - window.innerWidth,
      scrollY: window.scrollY,
    };
  });
  expect(report.scrollY, 'page should not need a vertical scroll to reach the action row').toBe(0);
  expect(report.top).toBeGreaterThanOrEqual(0);
  expect(report.bottom).toBeLessThanOrEqual(report.vh + 0.5);
  expect(report.left).toBeGreaterThanOrEqual(-0.5);
  expect(report.right).toBeLessThanOrEqual(report.vw + 0.5);
  expect(report.pageOverflowX).toBeLessThanOrEqual(0);
}

test('action row stays in the viewport on every level at 320×568 and 390×844', async ({ page }) => {
  test.setTimeout(240_000);
  expect(ALL_LEVEL_IDS.length).toBeGreaterThan(100);
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }] as const) {
    await page.setViewportSize(viewport);
    await fresh(page);
    for (const id of ALL_LEVEL_IDS) {
      await goToChapter(page, id);
      await expect(page.getByTestId('board')).toBeVisible();
      try {
        await expectActionRowInView(page);
      } catch (err) {
        throw new Error(`action row out of view on ${id} at ${viewport.width}×${viewport.height}`, { cause: err });
      }
    }
  }
});
