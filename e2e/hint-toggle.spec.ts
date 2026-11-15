import { expect, test } from '@playwright/test';
import { dragBy, fresh, goToChapter, openChapter, openMap, readHint } from './helpers';

test('Hint stays on across consecutive moves, undo and restart, then turns off', async ({ page }) => {
  await openChapter(page, 'hbb-c07');
  const toggle = page.getByRole('button', { name: 'Hint' });
  const cue = page.getByTestId('hint-cue');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(cue).toHaveCount(0);
  const first = await readHint(page);
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await dragBy(page, first.cell, first.dir, first.k);
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(cue).toBeVisible();
  const second = await readHint(page);
  expect(second).not.toEqual(first);
  await dragBy(page, second.cell, second.dir, second.k);
  await expect(cue).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(cue).toBeVisible();
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(cue).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(cue).toHaveCount(0);
  await dragBy(page, first.cell, first.dir, first.k);
  await expect(cue).toHaveCount(0);
});

test('Hint mode carries across campaign puzzles and remains off after toggling', async ({ page }) => {
  await openChapter(page, 'hbb-c07');
  await readHint(page);
  await goToChapter(page, 'hbb-c08');
  const toggle = page.getByRole('button', { name: 'Hint' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('hint-cue')).toBeVisible();
  await toggle.click();
  await expect(page.getByTestId('hint-cue')).toHaveCount(0);
  await openMap(page);
  await goToChapter(page, 'hbb-c07');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('hint-cue')).toHaveCount(0);
});


test('dashed hints have four inset border edges on sliding and mixed boards', async ({page})=>{
  for(const id of ['hbb-c08','ins-02','ins-03','ins-04','ins-05']){
    await fresh(page);
    await openMap(page);
    await page.getByTestId('cnode-'+id).click();
    await page.getByTestId('action-hint').click();
    const marked=page.locator('.board .hinted, .board .assembly-hint-source');
    expect(await marked.count()).toBeGreaterThan(0);
    for(const vp of [{width:320,height:568},{width:390,height:844}]){
      await page.setViewportSize(vp);
      const edges=await marked.evaluateAll(nodes=>nodes.map(el=>{
        const css=getComputedStyle(el,'::after');
        const tile=el.getBoundingClientRect();
        return {rails:(css.backgroundImage.match(/repeating-linear-gradient/g)??[]).length,
          sizes:css.backgroundSize, positions:css.backgroundPosition,
          insets:[css.top,css.right,css.bottom,css.left].map(parseFloat),size:[tile.width,tile.height],pointer:css.pointerEvents};
      }));
      for(const edge of edges){
        expect(edge.rails).toBe(4);
        expect(edge.sizes).toBe('100% 2px, 2px 100%, 100% 2px, 2px 100%');
        expect(edge.positions).toBe('0% 0%, 100% 0%, 0% 100%, 0% 0%');
        expect(edge.insets.every(n=>n>=2)).toBe(true);
        expect(edge.insets[1]!+edge.insets[3]!).toBeLessThan(edge.size[0]!);
        expect(edge.insets[0]!+edge.insets[2]!).toBeLessThan(edge.size[1]!);
        expect(edge.pointer).toBe('none');
      }
    }
    await page.getByTestId('action-hint').click();
    await expect(marked).toHaveCount(0);
  }
});
