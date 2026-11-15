import {test,expect} from '@playwright/test';
import {GENES} from '../src/genomics/genes.ts';
import {CAMPAIGN_LEVELS,LEVEL_PACK} from '../src/campaign/campaign.ts';
import {newSave,serializeSave} from '../src/persistence/save.ts';
import {openCompleted} from './helpers.ts';
import {installFeedbackProbe,feedbackLog} from './feedbackProbe';
const FAMOUS_BASES=Object.values(GENES).reduce((n,g)=>n+g.cdsLength,0);
test('map puts Mechanics Lab after Human Genome and describes every gene',async({page})=>{
  await openCompleted(page,serializeSave(newSave(LEVEL_PACK)));
  await expect(page.getByText('Famous Genes · main campaign',{exact:true})).toHaveCount(0);
  const map=page.getByTestId('level-map');
  await expect(page.getByTestId('continue')).toHaveCSS('background-color','rgb(205, 235, 216)');
  const order=await map.locator(':scope > [data-testid]').evaluateAll(els=>els.map(el=>el.getAttribute('data-testid')));
  expect(order.indexOf('open-bonus')).toBeGreaterThan(order.indexOf('catalogue'));
  expect(order.indexOf('open-mechanics')).toBeGreaterThan(order.indexOf('catalogue'));
  expect(order.indexOf('open-mechanics')).toBeGreaterThan(order.indexOf('open-bonus'));
  await expect(page.getByTestId('lab-panel')).toHaveCount(0);
  await expect(page.getByRole('button',{name:/^Enzyme lab/})).toHaveCount(0);
  for(const gene of Object.values(GENES)){
    const label=page.getByTestId('cat-progress-'+gene.symbol);
    await expect(label).toContainText('0 / '+gene.cdsLength+' bp · ');
    const text=await label.textContent();
    expect(text).not.toMatch(/· chr |stages ·|mechanics ·|1-base tiles|Codons|Hexamers/);
    expect(text!.split(' bp · ')[1]!.length).toBeGreaterThan(25);
  }
  await expect(page.getByTestId('cat-progress-INS')).toContainText('helps regulate blood sugar');
  await page.getByTestId('open-mechanics').click();
  await expect(page.getByTestId('mechanics-menu')).toBeVisible();
  await expect(page.locator('.mechanic-entry')).toHaveCount(6);
});

test('whole genome is locked until the main campaign ends',async({page})=>{
  const save=newSave(LEVEL_PACK),completed=CAMPAIGN_LEVELS.map(l=>l.id);
  await openCompleted(page,serializeSave({...save,completed:completed.slice(0,-1)}));
  await expect(page.getByTestId('open-bonus')).toBeDisabled();
  await openCompleted(page,serializeSave({...save,completed}));
  await page.getByTestId('open-bonus').click();
  await expect(page.getByTestId('bonus-map')).toBeVisible();
  await expect(page.getByRole('progressbar',{name:'Genome bases assembled'})).toHaveAttribute('aria-valuenow',String(FAMOUS_BASES));
  await expect(page.getByRole('button',{name:'Assemble',exact:true})).toHaveCount(25);
  await expect(page.getByRole('button',{name:'Install pack',exact:true})).toHaveCount(0);
  await expect(page.getByTestId('chromosome-chr1').getByRole('button',{name:'Assemble'})).toBeEnabled();
  await expect(page.getByRole('heading',{name:'Reference data packs',exact:true})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Gene catalogue',exact:true})).toHaveCount(0);
  await expect(page.getByPlaceholder('Gene symbol or ID')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Chromosomes',exact:true})).toBeVisible();
  await expect(page.getByTestId('bonus-continue')).toContainText('Continue · chr1');
  await expect(page.getByTestId('bonus-nodes-chr1').locator('.cnode')).toHaveCount(121);
  await expect(page.getByTestId('bonus-node-chr1-1')).toBeEnabled();
});

import {createHash} from 'node:crypto';
import {CHROMOSOMES,CHUNK_BASES,REFERENCE,GENOME_BASES,genomeLevelInterval} from '../src/campaign/bonus.ts';
test('automatically loads a chromosome, assembles an exact interval and restores coverage',async({page})=>{
  await page.setViewportSize({width:375,height:667});
  await installFeedbackProbe(page);
  // Synthetic fixture exercises packing/UI; never part of the shipped reference.
  const length=CHROMOSOMES.chrM!,payload=Buffer.alloc(Math.ceil(length/4),0x1b);
  const header=Buffer.from(JSON.stringify({format:'GENOME-T2T-1',reference:REFERENCE,chromosome:'chrM',length,annotation:'test fixture',annotationSha256:'test',sourceMd5:'06caded0055ec647a69acb708e13beff',chunkBases:CHUNK_BASES,genes:[['test','TESTGENE','test',0,9,'+']],chunkSha256:[createHash('sha256').update(payload).digest('hex')]}));
  const prefix=Buffer.alloc(4);prefix.writeUInt32LE(header.length);
  const save=newSave(LEVEL_PACK);
  await openCompleted(page,serializeSave({...save,settings:{...save.settings,sound:true,haptics:true},completed:CAMPAIGN_LEVELS.map(l=>l.id)}));
  await page.getByTestId('open-bonus').click();
  const row=page.getByTestId('chromosome-chrM');
  let requests=0;
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/reference-data/chrM.genome',async route=>{requests++;await gate;await route.fulfill({status:200,contentType:'application/octet-stream',body:Buffer.concat([prefix,header,payload])});});
  await row.getByRole('button',{name:'Assemble',exact:true}).click();
  try{
    await expect(page.getByTestId('reference-loading')).toHaveText('Reading reference data… 0%');
    await expect(row.getByRole('button',{name:'Loading 0%'})).toBeDisabled();
  }finally{release();}
  await expect(page.getByTestId('bonus-play')).toBeVisible();
  await expect(page.getByTestId('play-title')).toHaveText('chrM');
  await expect(page.getByTestId('play-top')).toHaveCount(1);
  await expect(page.getByTestId('app-top')).toHaveCount(0);
  await expect(page.getByTestId('play-progress')).toHaveText('1/23');
  await expect(page.getByTestId('action-hint')).toBeInViewport();
  await expect(page.getByTestId('action-undo')).toBeInViewport();
  await expect(page.getByTestId('reference-loading')).toHaveCount(0);
  expect(requests).toBe(1);
  for(const cell of [15,14,13,12,11,10,9])await page.getByTestId('lab-cell-'+cell).click();
  await expect(page.getByTestId('bonus-win')).toBeVisible();
  const cues=await feedbackLog(page);
  expect(cues.notes).toEqual([520,520,520,520,520,520,523,659,784,1047]);
  expect(cues.vibration).toEqual([8,8,8,8,8,8,[30,50,30,50,60]]);
  await page.getByTestId('bonus-win').getByRole('button',{name:'Bonus map'}).click();
  await expect(page.getByRole('progressbar',{name:'Genome bases assembled'})).toHaveAttribute('aria-valuenow',String(FAMOUS_BASES+9));
  await expect(page.getByTestId('chromosome-chrM')).toContainText('9 / '+length.toLocaleString()+' bp');
  await expect(page.getByTestId('bonus-nodes-chrM').locator('.cnode').first()).toHaveText('2');
  await page.getByRole('button',{name:'Previous chrM levels'}).click();
  await expect(page.getByTestId('bonus-node-chrM-1')).toHaveClass(/\bdone\b/);
  await expect(page.getByTestId('bonus-node-chrM-1')).toContainText('✓');
  await page.reload();await page.getByTestId('title-play').click();await page.getByTestId('open-bonus').click();
  await expect(page.getByRole('progressbar',{name:'Genome bases assembled'})).toHaveAttribute('aria-valuenow',String(FAMOUS_BASES+9));
  await expect(page.getByTestId('chromosome-chrM')).toContainText('9 / '+length.toLocaleString()+' bp');
  await expect(page.getByTestId('bonus-nodes-chrM').locator('.cnode').first()).toHaveText('2');
  await page.getByRole('button',{name:'Previous chrM levels'}).click();
  await expect(page.getByTestId('bonus-node-chrM-1')).toHaveClass(/\bdone\b/);
  await expect(page.getByTestId('bonus-node-chrM-1')).toContainText('✓');
  await page.getByTestId('bonus-node-chrM-1').click();
  await expect(page.getByTestId('play-progress')).toHaveText('1/23');
  for(const cell of [15,14,13,12,11,10,9])await page.getByTestId('lab-cell-'+cell).click();
  await expect(page.getByTestId('bonus-win')).toBeVisible();
  await page.getByTestId('bonus-win').getByRole('button',{name:'Bonus map'}).click();
  await expect(page.getByRole('progressbar',{name:'Genome bases assembled'})).toHaveAttribute('aria-valuenow',String(FAMOUS_BASES+9));
});


test('a missing chromosome download reports an error and can be retried',async({page})=>{
  await openCompleted(page,serializeSave({...newSave(LEVEL_PACK),completed:CAMPAIGN_LEVELS.map(l=>l.id)}));
  await page.getByTestId('open-bonus').click();
  await page.route('**/reference-data/chr1.genome',route=>route.fulfill({status:503,body:'Unavailable'}));
  const button=page.getByTestId('chromosome-chr1').getByRole('button',{name:'Assemble'});
  await button.click();
  await expect(page.getByRole('alert')).toContainText('Reference data could not be loaded');
  await expect(button).toBeEnabled();
});


test('chromosome grids start at the exact next unfinished level with eleven square columns and reversible paging',async({page})=>{
  await page.setViewportSize({width:375,height:667});
  const end=genomeLevelInterval(CHROMOSOMES.chr1!,129)[1];
  await openCompleted(page,serializeSave({...newSave(LEVEL_PACK),completed:CAMPAIGN_LEVELS.map(l=>l.id),genomeProgress:{chr1:[[0,end]]}}));
  await page.getByTestId('open-bonus').click();
  const grid=page.getByTestId('bonus-nodes-chr1');
  await expect(grid.locator('.cnode')).toHaveCount(121);
  await expect(grid.locator('.cnode').first()).toHaveText('130');
  await expect(grid.locator('.cnode').last()).toHaveText('250');
  await expect(page.getByTestId('bonus-node-chr1-130')).toHaveClass(/\bcurrent\b/);
  const boxes=await grid.locator('li').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
  expect(boxes.filter(b=>Math.abs(b.y-boxes[0]!.y)<1)).toHaveLength(11);
  expect(Math.abs(boxes[0]!.w-boxes[0]!.h)).toBeLessThan(1);
  expect(Math.abs(boxes[120]!.y-boxes[0]!.y-10*boxes[0]!.h)).toBeLessThan(2);
  await page.getByRole('button',{name:'Previous chr1 levels'}).click();
  await expect(grid.locator('.cnode').first()).toHaveText('9✓');
  await expect(grid.locator('.cnode').last()).toHaveText('129✓');
  await page.getByRole('button',{name:'Previous chr1 levels'}).click();
  await expect(grid.locator('.cnode')).toHaveCount(8);
  await expect(grid.locator('.cnode').first()).toHaveText('1✓');
  await expect(grid.locator('li')).toHaveCount(121);
  await expect(page.getByRole('button',{name:'Previous chr1 levels'})).toBeDisabled();
  await page.getByRole('button',{name:'Next chr1 levels'}).click();
  await expect(grid.locator('.cnode').first()).toHaveText('9✓');
  await page.getByRole('button',{name:'Next chr1 levels'}).click();
  await expect(grid.locator('.cnode').first()).toHaveText('130');
  await page.getByRole('button',{name:'Next chr1 levels'}).click();
  await expect(grid.locator('.cnode').first()).toHaveText('251');
  await expect(page.getByRole('button',{name:'Next unfinished',exact:true})).toHaveCount(0);
  await page.reload();await page.getByTestId('title-play').click();await page.getByTestId('open-bonus').click();
  await expect(grid.locator('.cnode').first()).toHaveText('130');
});


test('Human Genome map button fills green according to shared reference coverage',async({page})=>{
  const completed=CAMPAIGN_LEVELS.map(l=>l.id);
  await openCompleted(page,serializeSave({...newSave(LEVEL_PACK),completed}));
  const button=page.getByTestId('open-bonus'),fill=page.getByTestId('open-bonus-fill');
  await expect(button).toBeEnabled();
  await expect(page.getByTestId('open-bonus-percent')).toHaveText('<0.01%');
  expect(await fill.evaluate(el=>parseFloat((el as HTMLElement).style.width))).toBeCloseTo(100*FAMOUS_BASES/GENOME_BASES,10);
  await expect(fill).toHaveCSS('background-color','rgb(205, 235, 216)');
  const all=Object.fromEntries(Object.entries(CHROMOSOMES).map(([c,len])=>[c,[[0,len]]]));
  await openCompleted(page,serializeSave({...newSave(LEVEL_PACK),completed,genomeProgress:all}));
  await expect(page.getByTestId('open-bonus-percent')).toHaveText('100%');
  expect(await fill.evaluate(el=>(el as HTMLElement).style.width)).toBe('100%');
});
