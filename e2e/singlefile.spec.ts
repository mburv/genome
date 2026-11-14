import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { solveWithHints } from './helpers';

const file = resolve('dist-single/GENOME-M4.html');

test('self-contained single HTML loads and plays from file://', async ({ page }) => {
  test.skip(!existsSync(file), 'run npm run build:single first');
  const requests: string[] = [];
  page.on('request', (r) => { if (!r.url().startsWith('file://') && !r.url().startsWith('data:')) requests.push(r.url()); });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await expect(page.getByTestId('title-screen')).toBeVisible();
  await page.getByTestId('title-play').click();
  await expect(page.getByTestId('level-map')).toBeVisible();
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('board')).toBeVisible();
  await expect(page.locator('.board > .cell')).toHaveCount(81);
  await solveWithHints(page);
  await expect(page.getByTestId('win')).toBeVisible();
  await page.getByTestId('win-map').click();
  await expect(page.getByTestId('level-map')).toBeVisible();
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('play-title')).toHaveText('INS');
  await expect(page.getByTestId('play-progress')).toHaveText('2/13');
  await expect(page.getByTestId('play-fullname')).toHaveText('INSULIN');
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});
