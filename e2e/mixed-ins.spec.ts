import { expect, test } from '@playwright/test';
import { fresh, openMap, solveWithHints } from './helpers';
const tile=(page:import('@playwright/test').Page,c:number)=>page.getByTestId('lab-cell-'+c);
test('first-use tutorials animate all seven mechanics, replay, and remember acknowledgement',async({page})=>{
  await fresh(page,true);await openMap(page);
  const stages=[['ins-01','slide'],['ins-02','trace'],['ins-03','connections'],['ins-04','assembly'],['ins-05','crush'],['ins-06','mutation'],['ins-c07','restriction']];
  for(const [id,kind] of stages){
    await page.getByTestId('cnode-'+id).click();
    const tutorial=page.getByTestId('mechanic-tutorial');
    await expect(tutorial).toHaveAttribute('data-mechanic',kind!);
    await expect(page.getByTestId('tutorial-board').locator('.tutorial-cell')).toHaveCount(81);
    await page.getByTestId('tutorial-next').click();
    await expect(page.getByTestId('tutorial-board')).toHaveAttribute('data-step','2');
    await page.getByRole('button',{name:'Replay animation'}).click();
    await page.getByTestId('tutorial-next').click();
    await expect(page.getByTestId('tutorial-board')).toHaveAttribute('data-step','3');
    await page.getByTestId('tutorial-next').click();
    await expect(tutorial).toHaveCount(0);
    await openMap(page);
  }
  await page.getByTestId('cnode-ins-02').click();
  await expect(page.getByTestId('mechanic-tutorial')).toHaveCount(0);
  await page.getByTestId('show-tutorial').click();
  await expect(page.getByTestId('mechanic-tutorial')).toBeVisible();
  await page.getByTestId('tutorial-skip').click();
  await page.reload();await openMap(page);await page.getByTestId('cnode-ins-02').click();
  await expect(page.getByTestId('mechanic-tutorial')).toHaveCount(0);
});
test('INS mixed trace resumes mid-stage, adds exact coverage once, and advances to Connections',async({page})=>{
  await fresh(page,true);await openMap(page);await page.getByTestId('cnode-ins-01').click();
  await page.getByTestId('tutorial-skip').click();await solveWithHints(page);
  await page.getByRole('button',{name:'Next level →'}).click();
  await page.getByTestId('tutorial-skip').click();
  await expect(page.getByTestId('mixed-range')).toHaveText('INS CDS 10–18 · 9 bp');
  await expect(page.getByTestId('mixed-coverage')).toHaveText('9/333 bp assembled');
  for(const c of [10,11,12])await tile(page,c).tap();
  await page.reload();await openMap(page);await page.getByTestId('cnode-ins-02').click();
  await expect(page.getByTestId('lab-progress')).toHaveText('3/9 bases');
  for(const c of [21,30,31,40,49,50])await tile(page,c).tap();
  await expect(page.getByTestId('mixed-extracted')).toHaveText('TGGATGCGC');
  await expect(page.getByTestId('mixed-coverage')).toHaveText('18/333 bp assembled');
  await page.getByRole('button',{name:'Next level →'}).click();
  await expect(page.getByTestId('mechanic-tutorial')).toHaveAttribute('data-mechanic','connections');
  await page.getByTestId('tutorial-skip').click();
  await expect(page.getByTestId('mixed-range')).toHaveText('INS CDS 19–24 · 6 bp');
});
