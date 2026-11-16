import { expect, test } from '@playwright/test';
import { openChapter, readHint, dragBy } from './helpers';

test('HBB 13/15: the full replication readout stays visible and anchored on a short phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openChapter(page, 'hbb-c07');
  const panel = page.getByTestId('target-panel');
  const pairs = panel.locator('.rep-pair');
  const pair5 = panel.locator('.rep-pair[data-clue-index="5"]');
  await expect(panel).not.toHaveClass(/clues-compact/);
  await expect(pairs).toHaveCount(6);
  await expect(panel.locator('.rep-pair:visible')).toHaveCount(6);
  const initial = await panel.boundingBox();
  const board = await page.getByTestId('board').boundingBox();
  const toolbar = await page.getByTestId('icon-row').boundingBox();
  await expect(pair5).toBeVisible();
  const hint = await readHint(page);
  await dragBy(page, hint.cell, hint.dir, hint.k);
  await expect(pair5).toHaveAttribute('data-clue-done', 'true');
  await expect(pair5).toBeVisible();
  expect(await panel.boundingBox()).toEqual(initial);
  expect(await page.getByTestId('board').boundingBox()).toEqual(board);
  expect(await page.getByTestId('icon-row').boundingBox()).toEqual(toolbar);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(pair5).toHaveAttribute('data-clue-done', 'false');
  await expect(pair5).toBeVisible();
  expect(await panel.boundingBox()).toEqual(initial);
  expect(await page.getByTestId('board').boundingBox()).toEqual(board);
  expect(await page.getByTestId('icon-row').boundingBox()).toEqual(toolbar);
  expect(await panel.evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
});

test('roomy clue panels retain their full replication readout', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await openChapter(page, 'hbb-c07');
  const panel = page.getByTestId('target-panel');
  await expect(panel.locator('.rep-pair:visible')).toHaveCount(6);
  await expect(panel).not.toHaveClass(/clues-compact/);
});
