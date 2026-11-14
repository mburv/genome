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

test('every mixed INS stage can be solved through the real game controls and reaches 333 bp',async({page})=>{
  test.setTimeout(120_000);
  await fresh(page,true);await openMap(page);
  const skip=async()=>{const guide=page.getByTestId('mechanic-tutorial');if(await guide.isVisible())await page.getByTestId('tutorial-skip').click();};
  const stages=[
    {id:'ins-01',kind:'slide',end:9},
    {id:'ins-02',kind:'trace',end:18,cells:[10,11,12,21,30,31,40,49,50]},
    {id:'ins-03',kind:'connections',end:24},
    {id:'ins-04',kind:'assembly',end:33},
    {id:'ins-05',kind:'crush',end:42},
    {id:'ins-06',kind:'mutation',end:51},
    {id:'ins-c01',kind:'trace',end:78,cells:Array.from({length:27},(_,i)=>{const r=Math.floor(i/9)+1;return r*9+(r%2?8-i%9:i%9);})},
    {id:'ins-c02',kind:'slide',end:114},
    {id:'ins-c03',kind:'mutation',end:132},
    {id:'ins-c04',kind:'slide',end:186},
    {id:'ins-c05',kind:'slide',end:240},
    {id:'ins-c06',kind:'trace',end:294,cells:Array.from({length:54},(_,i)=>{const r=Math.floor(i/9);return r*9+(r%2?8-i%9:i%9);})},
    {id:'ins-c07',kind:'restriction',end:333},
  ];
  await page.getByTestId('cnode-ins-01').click();
  for(const s of stages){
    await skip();
    if(s.kind==='slide')await solveWithHints(page);
    else if(s.kind==='trace')for(const c of s.cells!)await tile(page,c).tap();
    else if(s.kind==='connections')for(const path of [[1,2,3,4,5,6,7,16,25],[27,28,29,38,39,40,41,42,43,44,53],[55,64,73,74,75,76,77]])for(const c of path)await tile(page,c).tap();
    else if(s.kind==='assembly')for(const [a,b] of [[1,67],[19,63],[37,65]]){await tile(page,a!).tap();await tile(page,b!).tap();}
    else if(s.kind==='crush')for(const [a,b] of [[12,13],[39,40],[66,67]]){await tile(page,a!).tap();await tile(page,b!).tap();await expect(page.getByTestId('mechanics-board')).toHaveAttribute('data-crush-phase','idle');}
    else if(s.kind==='mutation'){
      const cells=await page.locator('.lab-cell.mutation-mismatch').evaluateAll(nodes=>nodes.map(n=>Number(n.getAttribute('data-lab-cell'))));
      for(const c of cells){const want=await page.getByTestId('mutation-target-'+c).textContent();await tile(page,c).tap();await page.getByTestId('lab-base-'+want).tap();}
    }else if(s.kind==='restriction'){await tile(page,6).tap();await tile(page,44).tap();}
    if(s.kind!=='slide')await expect(page.getByTestId('mixed-coverage')).toHaveText(s.end+'/333 bp assembled');
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('genome-save')!));
    expect(saved.completed).toContain(s.id);
    if(s.end===333){await expect(page.getByTestId('mixed-assembled')).toBeVisible();expect(saved.assembled).toContain('INS');}
    else await page.getByRole('button',{name:'Next level →'}).click();
  }
});
