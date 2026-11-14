import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { touchSwipe, type Dir } from './helpers';

const file = resolve('dist-single/GENOME-M4.html');

test('self-contained single HTML loads and plays from file://', async ({ page }) => {
  test.skip(!existsSync(file), 'run npm run build:single first');
  const requests: string[] = [];
  page.on('request', (r) => { if (!r.url().startsWith('file://') && !r.url().startsWith('data:')) requests.push(r.url()); });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await expect(page.getByTestId('board')).toBeVisible();
  await expect(page.locator('.board > .cell')).toHaveCount(81);
  const cell = Number(await page.locator('.tile.selected').getAttribute('data-cell'));
  const dir = /dir-(\w+)/.exec((await page.getByTestId('hint-cue').getAttribute('class'))!)![1] as Dir;
  await touchSwipe(page, cell, dir);
  await expect(page.getByTestId('win')).toBeVisible();
  await page.getByRole('button', { name: 'Next level →' }).click();
  await expect(page.getByTestId('play-title')).toHaveText('INS · 2/6');
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});
