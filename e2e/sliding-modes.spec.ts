import { expect, test } from '@playwright/test';
import { fresh, openMap, readHint, dragBy, openChapter, solveWithHints } from './helpers';

test('four classic sliding modes have their own first-use guide, real target groups and persistent acknowledgement', async ({page}) => {
  await fresh(page,true);
  await openMap(page);
  const stages = [
    ['ins-01','slide','Sequencing',1],
    ['hbb-c08','slide-splice','Splicing',2],
    ['hbb-c03','slide-replicate','Replication',2],
    ['ins-c04','slide-repair','Repair',2],
  ] as const;
  for (const [id,kind,title,groups] of stages) {
    await page.getByTestId('cnode-'+id).click();
    const tutorial=page.getByTestId('mechanic-tutorial'), board=page.getByTestId('tutorial-board');
    await expect(tutorial).toHaveAttribute('data-mechanic',kind);
    await expect(tutorial.getByRole('heading',{name:title,exact:true})).toBeVisible();
    await expect(board.locator('.tutorial-cell')).toHaveCount(81);
    for(let g=1;g<=groups;g++) expect(await board.locator('[data-tutorial-group="'+g+'"]').count()).toBeGreaterThan(0);
    if(kind==='slide-replicate') {
      await expect(tutorial.getByLabel('Example targets')).toContainText('5′→3′');
      await expect(tutorial.getByLabel('Example targets')).toContainText('3′→5′');
    }
    if(kind==='slide-repair') await expect(board.locator('[data-repair-gap]')).toHaveAttribute('data-base','.');
    await page.getByTestId('tutorial-next').click();
    await expect(board.getByTestId('tutorial-slide-strip')).toBeVisible();
    await page.getByRole('button',{name:'Replay animation'}).click();
    await page.getByTestId('tutorial-next').click();
    if(kind==='slide-repair') await expect(board.locator('[data-repair-gap]')).not.toHaveAttribute('data-base','.');
    await page.getByTestId('tutorial-next').click();
    await expect(tutorial).toHaveCount(0);
    await expect(page.getByTestId('energy')).toHaveCount(0);
    await expect(page.getByTestId('icon-row').locator('button')).toHaveCount(3);
    await openMap(page);
  }
  await page.goto('/');
  await openMap(page);
  for(const [id,kind,title] of stages) {
    await page.getByTestId('cnode-'+id).click();
    await expect(page.getByTestId('mechanic-tutorial')).toHaveCount(0);
    await page.getByTestId('show-tutorial').click();
    await expect(page.getByTestId('mechanic-tutorial')).toHaveAttribute('data-mechanic',kind);
    await expect(page.getByTestId('mechanic-tutorial').getByRole('heading',{name:title,exact:true})).toBeVisible();
    await page.getByTestId('tutorial-skip').click();
    await openMap(page);
  }
});

test('a previous generic sliding acknowledgement does not skip the new mode guides', async ({page}) => {
  await fresh(page,true);
  await page.evaluate(()=>{const save=JSON.parse(localStorage.getItem('genome-save')!);save.tutorialsSeen=['slide'];localStorage.setItem('genome-save',JSON.stringify(save));});
  await page.goto('/'); await openMap(page);
  await page.getByTestId('cnode-ins-01').click();
  await expect(page.getByTestId('mechanic-tutorial')).toHaveCount(0);
  await openMap(page);
  await page.getByTestId('cnode-hbb-c08').click();
  await expect(page.getByTestId('mechanic-tutorial')).toHaveAttribute('data-mechanic','slide-splice');
  await page.getByTestId('tutorial-skip').click();
  const hint=await readHint(page);
  await dragBy(page,hint.cell,hint.dir,hint.k);
  await expect(page.getByTestId('action-undo')).toBeEnabled();
  await page.getByTestId('action-undo').click();
  await expect(page.getByTestId('action-undo')).toBeDisabled();
  await dragBy(page,hint.cell,hint.dir,hint.k);
  await page.getByTestId('action-restart').click();
  await expect(page.getByTestId('moves')).toHaveText('0 moves');
  await expect(page.getByTestId('icon-row').locator('button')).toHaveCount(3);
});


test('hexamers replication completion omits the explanatory base-pair caption', async ({ page }) => {
  test.setTimeout(90_000);
  await openChapter(page, 'hbb-c07');
  await expect(page.locator('.target-title')).toHaveText(/hexamers · replication/i);
  await solveWithHints(page);
  const win=page.getByTestId('win');
  await expect(win).toBeVisible();
  await expect(win.locator('.win-pair')).toBeVisible();
  await expect(win).not.toContainText('Complementary pairs A–T and C–G.');
  await expect(win).not.toContainText('Only the template strand counts.');
  await expect(win.getByTestId('win-bases')).toBeVisible();
});

