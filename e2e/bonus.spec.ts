import {test,expect} from '@playwright/test';
import {GENES} from '../src/genomics/genes.ts';
import {CAMPAIGN_LEVELS,LEVEL_PACK} from '../src/campaign/campaign.ts';
import {newSave,serializeSave} from '../src/persistence/save.ts';
import {openCompleted,openChapter} from './helpers.ts';
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


test('unlocked Human Genome replaces the top Replay action without duplicating the progress button',async({page})=>{
  const completed=CAMPAIGN_LEVELS.map(l=>l.id);
  await openCompleted(page,serializeSave({...newSave(LEVEL_PACK),completed}));
  const map=page.getByTestId('level-map');
  await expect(page.getByTestId('continue')).toHaveCount(0);
  await expect(page.getByTestId('open-bonus')).toHaveCount(1);
  await expect(map.locator(':scope > [data-testid]').first()).toHaveAttribute('data-testid','open-bonus');
  await expect(page.getByTestId('open-bonus-percent')).toHaveText('<0.01%');
  await page.getByTestId('open-bonus').click();
  await expect(page.getByTestId('bonus-map')).toBeVisible();
});

test('named CDS genes are searchable above chromosome coordinates without installing chromosome DNA',async({page})=>{
  test.setTimeout(90_000);
  await page.setViewportSize({width:320,height:568});
  const completed=CAMPAIGN_LEVELS.map(l=>l.id);
  await openCompleted(page,serializeSave({...newSave(LEVEL_PACK),completed}));
  await page.getByTestId('open-bonus').click();
  const names=page.getByTestId('bonus-cds-catalogue');
  await expect(names).toBeVisible();
  await expect(page.getByTestId('bonus-coordinate-map')).toBeVisible();
  await expect(names).toContainText('Named coding genes');
  const query=names.getByRole('searchbox',{name:'Search CDS genes'});
  await query.fill('GPX1');
  await expect(names.getByTestId('bonus-cds-gene-'+ 'gene-not-real')).toHaveCount(0);
  await expect(names.getByText('GPX1',{exact:true}).first()).toBeVisible({timeout:30_000});
  await expect(names).toContainText('Glutathione');
  await expect(names.getByRole('button',{name:'Download & play →'}).first()).toBeVisible();
  await expect(page.getByTestId('bonus-cds-nodes-'+ 'gene-not-real')).toHaveCount(0);
  expect(await names.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
  const rect=await names.boundingBox();
  expect(rect!.width).toBeLessThanOrEqual(320);
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
  await expect(page.getByRole('heading',{name:'CDS genes',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Chromosome coordinates',exact:true})).toBeVisible();
  const sections=await page.getByTestId('bonus-map').locator(':scope > [data-testid]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-testid')));
  expect(sections.indexOf('bonus-cds-catalogue')).toBeLessThan(sections.indexOf('bonus-coordinate-map'));
  await expect(page.getByTestId('bonus-continue')).toContainText('Continue · chr1');
  await expect(page.getByTestId('bonus-cds-catalogue')).toBeVisible();
  await expect(page.getByTestId('bonus-nodes-chr1').locator('.cnode')).toHaveCount(121);
  await expect(page.getByTestId('bonus-node-chr1-1')).toBeDisabled();
  await expect(page.getByTestId('bonus-nodes-chr1')).toHaveClass(/\bunavailable\b/);
  await expect(page.getByTestId('bonus-node-chr1-1')).toHaveCSS('background-color','rgb(239, 239, 234)');
});

import {createHash} from 'node:crypto';
import {CHROMOSOMES,CHUNK_BASES,REFERENCE,GENOME_BASES,genomeLevelInterval,genomeStage} from '../src/campaign/bonus.ts';
test('automatically loads a chromosome, assembles an exact interval and restores coverage',async({page})=>{
  await page.setViewportSize({width:375,height:667});
  await installFeedbackProbe(page);
  await openChapter(page,'ins-01');
  const sharedGeometry=async()=>page.evaluate(()=>{
    const panel=document.querySelector('[data-testid="target-panel"]')!.getBoundingClientRect();
    const board=document.querySelector('.board-stage')!.getBoundingClientRect();
    const actions=document.querySelector('[data-testid="icon-row"]')!.getBoundingClientRect();
    return {height:panel.height,boardY:board.y+window.scrollY,boardWidth:board.width,boardHeight:board.height,boardX:board.x,actionY:actions.y+window.scrollY};
  });
  const mainGeometry=await sharedGeometry();
  // Synthetic fixture exercises packing/UI; never part of the shipped reference.
  const length=CHROMOSOMES.chrM!,payload=Buffer.alloc(Math.ceil(length/4),0x1b);
  const header=Buffer.from(JSON.stringify({format:'GENOME-T2T-1',reference:REFERENCE,chromosome:'chrM',length,annotation:'test fixture',annotationSha256:'test',sourceMd5:'06caded0055ec647a69acb708e13beff',chunkBases:CHUNK_BASES,genes:[['test','TESTGENE','test',0,9,'+']],chunkSha256:[createHash('sha256').update(payload).digest('hex')]}));
  const prefix=Buffer.alloc(4);prefix.writeUInt32LE(header.length);
  const save=newSave(LEVEL_PACK);
  await openCompleted(page,serializeSave({...save,settings:{...save.settings,sound:true,haptics:true},completed:CAMPAIGN_LEVELS.map(l=>l.id)}));
  await page.getByTestId('open-bonus').click();
  const row=page.getByTestId('chromosome-chrM');
  await expect(row.getByTestId('bonus-node-chrM-1')).toBeDisabled();
  let requests=0;
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/reference-data/chrM.genome',async route=>{requests++;await gate;await route.fulfill({status:200,contentType:'application/octet-stream',body:Buffer.concat([prefix,header,payload])});});
  await row.getByRole('button',{name:'Assemble',exact:true}).click();
  try{
    await expect(page.getByTestId('reference-loading')).toHaveText('Reading reference data… 0%');
    await expect(row.getByRole('button',{name:'Loading 0%'})).toBeDisabled();
    await expect(row.getByTestId('bonus-node-chrM-1')).toBeDisabled();
  }finally{release();}
  await expect(page.getByTestId('bonus-play')).toBeVisible();
  await expect(page.getByTestId('play-title')).toHaveText('chrM');
  await expect(page.getByTestId('play-top')).toHaveCount(1);
  await expect(page.getByTestId('app-top')).toHaveCount(0);
  await expect(page.getByTestId('play-progress')).toHaveText('1/23');
  const bonusGeometry=await sharedGeometry();
  expect(bonusGeometry.boardWidth).toBe(375);
  expect(bonusGeometry.boardHeight).toBe(375);
  expect(bonusGeometry.boardX).toBe(0);
  for(const key of ['height','boardY','boardWidth','boardHeight','boardX','actionY'] as const)expect(Math.abs(bonusGeometry[key]-mainGeometry[key])).toBeLessThanOrEqual(1);
  await page.getByTestId('icon-row').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('action-hint')).toBeInViewport();
  await expect(page.getByTestId('action-undo')).toBeInViewport();
  await page.evaluate(()=>window.scrollTo(0,0));
  await expect(page.getByTestId('reference-loading')).toHaveCount(0);
  expect(requests).toBe(1);
  for(const cell of genomeStage('chrM',[0,9],'A'.repeat(9)).spec.TRACE_PATH.slice(2))await page.getByTestId('lab-cell-'+cell).click();
  const win=page.getByTestId('bonus-win');
  await expect(win).toBeVisible();
  await expect(win.getByTestId('win-card')).toBeVisible();
  await expect(win.getByTestId('win-meta')).toHaveText('chrM 1/23 COMPLETE · 7 moves');
  await expect(win.getByTestId('win-bases')).toContainText('+9 chrM reference bases');
  await expect(win.getByTestId('win-assembly')).toContainText('9 / 16,569 chrM reference bases assembled');
  await expect(win.getByTestId('mixed-extracted').locator('.strip-cell')).toHaveCount(9);
  await expect(win.locator('.win-strand')).not.toHaveClass(/\bskip\b/);
  await expect(win.getByTestId('mixed-extracted').locator('.strip-cell').nth(1)).toHaveCSS('animation-delay','0.04s');
  const rect=await win.getByTestId('win-card').boundingBox();
  expect(rect).not.toBeNull();expect(Math.abs(rect!.x-(375-rect!.x-rect!.width))).toBeLessThanOrEqual(1);
  await win.locator('.win-strand').click();
  await expect(win.locator('.win-strand')).toHaveClass(/\bskip\b/);
  await expect(win.getByRole('button',{name:'Next level →'})).toBeVisible();
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
  await expect(page.getByTestId('bonus-node-chrM-1')).toBeEnabled();
  await expect(page.getByTestId('bonus-node-chrM-1')).toHaveCSS('background-color','rgb(205, 235, 216)');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.reload();await page.getByTestId('title-play').click();await page.getByTestId('open-bonus').click();
  await expect(page.getByRole('progressbar',{name:'Genome bases assembled'})).toHaveAttribute('aria-valuenow',String(FAMOUS_BASES+9));
  await expect(page.getByTestId('chromosome-chrM')).toContainText('9 / '+length.toLocaleString()+' bp');
  await expect(page.getByTestId('bonus-nodes-chrM').locator('.cnode').first()).toHaveText('2');
  await page.getByRole('button',{name:'Previous chrM levels'}).click();
  await expect(page.getByTestId('bonus-node-chrM-1')).toHaveClass(/\bdone\b/);
  await expect(page.getByTestId('bonus-node-chrM-1')).toContainText('✓');
  await expect(page.getByTestId('bonus-node-chrM-1')).toBeEnabled();
  await expect(page.getByTestId('bonus-node-chrM-1')).toHaveCSS('background-color','rgb(205, 235, 216)');
  await page.getByTestId('bonus-node-chrM-1').click();
  await expect(page.getByTestId('play-progress')).toHaveText('1/23');
  for(const cell of genomeStage('chrM',[0,9],'A'.repeat(9)).spec.TRACE_PATH.slice(2))await page.getByTestId('lab-cell-'+cell).click();
  await expect(page.getByTestId('bonus-win')).toBeVisible();
  await expect(page.getByTestId('bonus-win').getByTestId('win-bases')).toContainText('Replay · no new bases');
  await expect(page.getByTestId('bonus-win').locator('.win-strand')).toHaveClass(/\bskip\b/);
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
  await expect(page.getByTestId('bonus-node-chr1-1')).toBeDisabled();
  await expect(page.getByTestId('bonus-nodes-chr1')).toHaveClass(/\bunavailable\b/);
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
  expect(Math.abs(boxes[0]!.w-boxes[0]!.h)).toBeLessThanOrEqual(1);
  const rect=await grid.boundingBox();expect(rect).not.toBeNull();
  expect(Math.abs(rect!.width-rect!.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(boxes[120]!.y-boxes[0]!.y-rect!.height*10/11)).toBeLessThan(2);
  await page.getByRole('button',{name:'Previous chr1 levels'}).click();
  await expect(grid.locator('.cnode').first()).toHaveText('9✓');
  await expect(grid.locator('.cnode').first()).toBeDisabled();
  await expect(grid.locator('.cnode').first()).toHaveCSS('background-color','rgb(239, 239, 234)');
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
  expect(await fill.evaluate(el=>parseFloat((el as HTMLElement).style.width))).toBeCloseTo(100*FAMOUS_BASES/GENOME_BASES,7);
  await expect(fill).toHaveCSS('background-color','rgb(205, 235, 216)');
  const all=Object.fromEntries(Object.entries(CHROMOSOMES).map(([c,len])=>[c,[[0,len] as const]]));
  await openCompleted(page,serializeSave({...newSave(LEVEL_PACK),completed,genomeProgress:all}));
  await expect(page.getByTestId('open-bonus-percent')).toHaveText('100%');
  expect(await fill.evaluate(el=>(el as HTMLElement).style.width)).toBe('100%');
});


test('bonus CDS completion shows the matching gene card and marks the chromosome map', async ({ page }) => {
  test.setTimeout(90_000);
  const chrom='chrM', length=CHROMOSOMES.chrM!;
  const payload=Buffer.alloc(Math.ceil(length/4),0x1b);
  const sha=createHash('sha256').update(payload).digest('hex');
  const headerObj={format:'GENOME-T2T-1',reference:REFERENCE,chromosome:chrom,length,
    annotation:'test fixture',annotationSha256:'test-annotation-sha',sourceMd5:'06caded0055ec647a69acb708e13beff',
    chunkBases:CHUNK_BASES,genes:[['test-gene','TESTGENE','protein_coding',0,9,'+']],chunkSha256:[sha]};
  const raw=Buffer.from(JSON.stringify(headerObj));
  const prefix=Buffer.alloc(4);prefix.writeUInt32LE(raw.length);
  await page.route('**/reference-data/chrM.genome',route=>route.fulfill({
    status:200,contentType:'application/octet-stream',body:Buffer.concat([prefix,raw,payload]),
  }));
  await page.route('**/cds-annotations/chrM.json',route=>route.fulfill({
    status:200,contentType:'application/json',body:JSON.stringify({
      format:'GENOME-CDS-1',reference:REFERENCE,chromosome:chrom,
      annotationSha256:'test-annotation-sha',
      genes:[['test-gene','TESTGENE','protein_coding',0,9,'+','NM_TEST.1',[[0,9]],'Example DNA repair gene']],
    }),
  }));
  await openCompleted(page,serializeSave({...newSave(LEVEL_PACK),completed:CAMPAIGN_LEVELS.map(l=>l.id)}));
  await page.getByTestId('open-bonus').click();
  await page.getByTestId('chromosome-chrM').getByRole('button',{name:'Assemble',exact:true}).click();
  await expect(page.locator('.target .clue-range')).toHaveText('TESTGENE CDS 1–9 · 9 bp');
  for(const cell of genomeStage('chrM',[0,9],'ACGTACGTA').spec.TRACE_PATH.slice(2))
    await page.getByTestId('lab-cell-'+cell).click();
  await expect(page.getByTestId('bonus-win')).toBeVisible();
  await page.getByTestId('bonus-win').getByRole('button',{name:'View gene card'}).click();
  const card=page.getByTestId('bonus-gene-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('TESTGENE');
  await expect(card).toContainText('9 coding bases covered');
  await expect(card).toContainText('NM_TEST.1');
  await card.getByRole('button',{name:'Genome map',exact:true}).click();
  const row=page.getByTestId('chromosome-chrM');
  await row.getByRole('button',{name:'Previous chrM levels'}).click();
  await expect(page.getByTestId('bonus-node-chrM-1')).toHaveClass(/bonus-cds-node/);
  await expect(row.getByTestId('bonus-gene-landmarks-chrM')).toContainText('TESTGENE ✓');
  await row.getByRole('button',{name:'View TESTGENE gene card'}).click();
  await expect(page.getByTestId('bonus-gene-card')).toBeVisible();
  await page.getByTestId('bonus-gene-card').getByRole('button',{name:'Continue →'}).click();
  await expect(page.getByTestId('bonus-gene-card')).toHaveCount(0);
});
