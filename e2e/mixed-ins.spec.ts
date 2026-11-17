import { expect, test } from '@playwright/test';
import { fresh, openMap, openCompleted, solveWithHints, documentBox } from './helpers';
import { CAMPAIGN_LEVELS, LEVEL_PACK } from '../src/campaign/campaign.ts';
import { newSave, serializeSave } from '../src/persistence/save.ts';
import { GENES } from '../src/genomics/genes.ts';
import { mechanicOf, mixedStage } from '../src/campaign/mixed.ts';
const tile=(page:import('@playwright/test').Page,c:number)=>page.getByTestId('lab-cell-'+c);
const oldInsIds=['ins-02','ins-03','ins-04','ins-05','ins-06','ins-c01','ins-c02','ins-c03','ins-c06','ins-c07'];
async function freshLegacyIns(page:import('@playwright/test').Page,mixed=false){
  await fresh(page,mixed);
  await page.evaluate(ids=>{
    const save=JSON.parse(localStorage.getItem('genome-save')!);
    save.legacyMixedLayouts=ids;
    localStorage.setItem('genome-save',JSON.stringify(save));
  },oldInsIds);
  await page.reload();
}

test('first-use tutorials animate all seven mechanics, replay, and remember acknowledgement',async({page})=>{
  await freshLegacyIns(page,true);await openMap(page);
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
    if(kind==='crush'){
      await expect(page.getByTestId('tutorial-board')).toHaveAttribute('data-step','4');
      await page.getByTestId('tutorial-next').click();
    }
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
  page.on('pageerror',error=>console.log('TRACE PAGE ERROR',error.message));
  await freshLegacyIns(page,true);await openMap(page);await page.getByTestId('cnode-ins-01').click();
  await page.getByTestId('tutorial-skip').click();await solveWithHints(page);
  await page.getByRole('button',{name:'Next level →'}).click();
  await page.getByTestId('tutorial-skip').click();
  await expect(page.getByTestId('mixed-range')).toHaveText('INS CDS 10–18 · 9 bp');
  await expect(page.getByTestId('mixed-coverage')).toHaveText('9/333 bp assembled');
  await expect(page.getByTestId('lab-progress')).toHaveText('2/9 bases');
  await expect(page.getByTestId('moves')).toHaveText('0 moves');
  await expect(page.getByTestId('trace-path')).toHaveAttribute('points','1.5,1.5 2.5,1.5');
  await tile(page,12).tap();
  await page.reload();await openMap(page);await page.getByTestId('cnode-ins-02').click();
  await expect(page.getByTestId('lab-progress')).toHaveText('3/9 bases');
  for(const [i,c] of [21,30,31,40,49,50].entries()){
    await tile(page,c).tap();
    await expect(page.getByTestId('lab-progress')).toHaveText((i+4)+'/9 bases');
  }
  await expect(page.getByTestId('mixed-extracted')).toHaveText('TGGATGCGC');
  await expect(page.getByTestId('play-progress')).toHaveText('2/13');
  await expect(page.getByTestId('mixed-coverage')).toHaveText('18/333 bp assembled');
  await page.getByRole('button',{name:'Next level →'}).click();
  await expect(page.getByTestId('mechanic-tutorial')).toHaveAttribute('data-mechanic','connections');
  await page.getByTestId('tutorial-skip').click();
  await expect(page.getByTestId('mixed-range')).toHaveText('INS CDS 19–24 · 6 bp');
});

test('every mixed INS stage can be solved through the real game controls and reaches 333 bp',async({page})=>{
  test.setTimeout(120_000);
  await freshLegacyIns(page,true);await openMap(page);
  const skip=async()=>{const guide=page.getByTestId('mechanic-tutorial');if(await guide.isVisible())await page.getByTestId('tutorial-skip').click();};
  const stages=[
    {id:'ins-01',kind:'slide',end:9},
    {id:'ins-02',kind:'trace',end:18,cells:[10,11,12,21,30,31,40,49,50]},
    {id:'ins-03',kind:'connections',end:24},
    {id:'ins-04',kind:'assembly',end:33},
    {id:'ins-05',kind:'crush',end:42},
    {id:'ins-06',kind:'mutation',end:51},
    {id:'ins-c01',kind:'trace',end:78,cells:[17,16,15,14,13,12,11,10,9]},
    {id:'ins-c02',kind:'crush',end:114},
    {id:'ins-c03',kind:'mutation',end:132},
    {id:'ins-c04',kind:'slide',end:186},
    {id:'ins-c05',kind:'slide',end:240},
    {id:'ins-c06',kind:'trace',end:294,cells:[17,16,15,14,13,12,11,10,9]},
    {id:'ins-c07',kind:'restriction',end:333},
  ];
  await page.getByTestId('cnode-ins-01').click();
  for(const s of stages){
    console.log('INS stage',s.id);
    await skip();
    if(s.kind==='slide')await solveWithHints(page);
    else if(s.kind==='trace')for(const c of s.cells!.slice(2))await tile(page,c).tap();
    else if(s.kind==='connections')for(const path of [[1,2,3,4,5,6,7,16,25],[27,28,29,38,39,40,41,42,43,44,53],[55,64,73,74,75,76,77]])for(const c of path)await tile(page,c).tap();
    else if(s.kind==='assembly')for(const [a,b] of (s.id==='ins-c04'?[[1,66],[19,63],[37,64]]:[[1,67],[19,63],[37,65]])){await tile(page,a!).tap();await tile(page,b!).tap();}
    else if(s.kind==='crush')for(const [a,b] of (s.id==='ins-c02'?[[12,13],[48,49],[66,67]]:[[12,13],[66,67]])){await tile(page,a!).tap();await tile(page,b!).tap();await expect(page.getByTestId('mechanics-board')).toHaveAttribute('data-crush-phase','idle');}
    else if(s.kind==='mutation'){
      const cells=await page.locator('.lab-cell.mutation-mismatch').evaluateAll(nodes=>nodes.map(n=>Number(n.getAttribute('data-lab-cell'))));
      for(const c of cells){const want=await page.getByTestId('mutation-target-'+c).getAttribute('data-symbol');await tile(page,c).tap();await page.getByTestId('lab-base-'+want).tap();}
    }else if(s.kind==='restriction'){await tile(page,17).tap();await tile(page,10).tap();}
    if(s.kind!=='slide'){
      await expect(page.getByTestId('mixed-coverage')).toHaveText(s.end+'/333 bp assembled');
      const win=page.getByTestId('win');
      await expect(win).toBeVisible();
      await expect(win.locator('.win-strand .strip-cell')).toHaveCount(s.end-(stages[stages.indexOf(s)-1]?.end??0));
      await expect(win.locator('.win-strand .strip-cell').first()).toHaveCSS('animation-name','pop');
      await expect(page.getByTestId('win-assembly')).toHaveText(s.end+' / 333 INS coding bases assembled.');
    }
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('genome-save')!));
    expect(saved.completed).toContain(s.id);
    if(s.end===333){await expect(page.getByTestId('assembled')).toBeVisible();expect(saved.assembled).toContain('INS');}
    else {const next=page.getByRole('button',{name:'Next level →'});await expect(next).toBeVisible();await next.click();}
  }
  // Completing a non-final gene now opens its full card, just as DMD did.
  await page.getByRole('button',{name:'View card',exact:true}).click();
  await expect(page.getByTestId('gene-card')).toBeVisible();
  await expect(page.locator('#card-title')).toHaveText('INS');
  await expect(page.getByTestId('card-state')).toContainText('Assembled');
  await expect(page.getByTestId('card-coverage')).toContainText('333 of 333');
  const sequence=page.getByTestId('assembled-sequence');
  await expect(sequence.getByRole('heading',{name:'Your assembled sequence (333 bases)'})).toBeVisible();
  await expect(sequence.locator('.seq-wrap')).toBeVisible();
  expect(await sequence.locator('.seq-wrap').textContent()).toBe(GENES.INS!.sequence);
  await expect(sequence.locator('summary')).toHaveCount(0);
  const next=CAMPAIGN_LEVELS[CAMPAIGN_LEVELS.findIndex(l=>l.id==='ins-c07')+1]!;
  await expect(page.getByTestId('card-continue')).toHaveText('Continue to '+next.symbol+' →');
  await page.getByTestId('card-continue').click();
  await expect(page.getByTestId('play-title')).toHaveText(next.symbol);
  // Replaying the final level must offer the same verified card without new credit.
  await openMap(page);
  await page.getByTestId('cnode-ins-c07').click();
  await page.getByTestId('replay').click();
  await tile(page,17).tap();await tile(page,10).tap();
  await expect(page.getByTestId('win-bases')).toContainText('Replay · no new bases');
  await expect(page.getByTestId('win-assembly')).toHaveText('333 / 333 INS coding bases assembled.');
  await expect(page.getByTestId('assembled')).toContainText('INS assembled');
  await page.getByRole('button',{name:'View card',exact:true}).click();
  await expect(page.getByTestId('card-state')).toContainText('Assembled');
  await expect(page.locator('#card-title')).toHaveText('INS');
  await expect(page.getByTestId('card-continue')).toHaveText('Continue to '+next.symbol+' →');
});

test('sliding tutorial keeps stationary cells opaque and rotates the entire column with wrap',async({page})=>{
  await freshLegacyIns(page,true);await openMap(page);await page.getByTestId('cnode-ins-01').click();
  const board=page.getByTestId('tutorial-board');
  await expect(board.locator('.tutorial-before,.tutorial-after')).toHaveCount(0);
  await expect(board.locator('.tutorial-slide-static').first()).toHaveCSS('animation-name','none');
  const initial=await board.locator('[data-demo-cell]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-base')).join(''));
  await page.getByTestId('tutorial-next').click();
  const clip=page.getByTestId('tutorial-slide-column'),strip=page.getByTestId('tutorial-slide-strip');
  await expect(clip).toHaveAttribute('data-segment','10,19,28,37,46,55,64,73');
  await expect(clip.locator('[data-wrap="false"]')).toHaveCount(8);
  await expect(clip.locator('[data-wrap="true"]')).toHaveCount(2);
  const first=clip.locator('[data-wrap="false"]').first();
  const wrap=clip.locator('[data-wrap="true"]').last();
  await expect(wrap).toHaveText(await first.textContent() ?? '');
  const sample=await strip.evaluate(el=>{
    const a=el.getAnimations()[0]!;
    a.pause();a.currentTime=0;
    const before=el.getBoundingClientRect();
    const tiles=Array.from(el.children);
    const y0=tiles.map(t=>t.getBoundingClientRect().y);
    const pitch=y0[2]!-y0[1]!;
    a.currentTime=1400;
    const after=el.getBoundingClientRect();
    const y1=tiles.map(t=>t.getBoundingClientRect().y);
    return {pitch,delta:after.y-before.y,deltas:y1.map((y,i)=>y-y0[i]!),wrapY:y1.at(-1),lastY:y0.at(-2),x:after.x-before.x};
  });
  expect(Math.abs(sample.delta+sample.pitch)).toBeLessThan(1);
  expect(Math.abs(sample.x)).toBeLessThan(1);
  expect(sample.deltas.every(d=>Math.abs(d+sample.pitch)<1)).toBe(true);
  expect(Math.abs(sample.wrapY!-sample.lastY!)).toBeLessThan(1);
  await expect(board.locator('[data-demo-cell]')).toHaveCount(81);
  expect(await board.locator('[data-demo-cell]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-base')).join(''))).toBe(initial);
  await expect(board.locator('.tutorial-slide-static').first()).toHaveCSS('opacity','1');
  await page.getByRole('button',{name:'Replay animation'}).click();
  await expect(strip).toHaveCSS('animation-iteration-count','1');
  await page.getByTestId('tutorial-next').click();
  await expect(clip).toHaveCount(0);
  await expect(board.locator('.tutorial-slide-static').first()).toHaveCSS('animation-name','none');
  const solved=await board.locator('[data-demo-cell]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-base')).join(''));
  expect(solved.slice(36,45)).toBe('ATGGCCCTG');
});

test('DNA tracing tutorial keeps all bases static while drawing its path once',async({page})=>{
  await freshLegacyIns(page,true);await openMap(page);await page.getByTestId('cnode-ins-02').click();
  const board=page.getByTestId('tutorial-board');
  for(let step=1;step<=3;step++){
    await expect(board.locator('.tutorial-cell')).toHaveCount(81);
    await expect(board.locator('.tutorial-before,.tutorial-after,.tutorial-change')).toHaveCount(0);
    const cells=await board.locator('.tutorial-base').evaluateAll(nodes=>nodes.map(n=>({opacity:getComputedStyle(n).opacity,animation:getComputedStyle(n).animationName})));
    expect(cells.every(c=>c.opacity==='1'&&c.animation==='none')).toBe(true);
    const starter=board.locator('.tutorial-starter-path');
    await expect(starter).toHaveCSS('animation-name','none');
    const path=board.locator('.tutorial-extension-path');
    if(step===1){await expect(path).toHaveCount(0);await expect(starter).toHaveAttribute('points','1.5,1.5 2.5,1.5');}
    else {
      await expect(path).toHaveCSS('animation-iteration-count','1');
      await path.evaluate(el=>{const a=el.getAnimations()[0]!;a.finish();});
      await expect(path).toHaveCSS('stroke-dashoffset','0px');
    }
    if(step<3)await page.getByTestId('tutorial-next').click();
  }
  await page.getByRole('button',{name:'Replay animation'}).click();
  await expect(board.locator('.tutorial-extension-path')).toHaveCSS('animation-iteration-count','1');
});

test('DNA tracing shares classic play chrome, board sizing, clues and action toolbar',async({page})=>{
  await freshLegacyIns(page,true);await openMap(page);
  await page.setViewportSize({width:320,height:568});
  await page.getByTestId('cnode-ins-01').click();await page.getByTestId('tutorial-skip').click();
  const classic=await page.getByTestId('board').boundingBox();
  await openMap(page);await page.getByTestId('cnode-ins-02').click();await page.getByTestId('tutorial-skip').click();
  await expect(page.getByTestId('play-title')).toHaveText('INS');
  await expect(page.getByTestId('play-progress')).toHaveText('2/13');
  await expect(page.locator('.mechanic-heading,.mechanic-instructions,.mechanic-target')).toHaveCount(0);
  const board=page.getByTestId('mechanics-board'), box=await board.boundingBox();
  expect(Math.abs(box!.width-classic!.width)).toBeLessThan(1);
  expect(Math.abs(box!.x-classic!.x)).toBeLessThan(1);
  await expect(page.getByTestId('target-panel').locator('.strip-cell')).toHaveCount(9);
  await expect(page.getByTestId('icon-row')).toBeVisible();
  await expect(page.getByTestId('action-hint')).toHaveAttribute('aria-pressed','false');
  await page.getByTestId('action-hint').click();
  await expect(tile(page,12)).toHaveClass(/hinted/);
  await tile(page,12).tap();
  await expect(page.getByTestId('action-hint')).toHaveAttribute('aria-pressed','true');
  await expect(tile(page,21)).toHaveClass(/hinted/);
  await expect(page.getByTestId('target-panel').locator('.strip-cell.ok')).toHaveCount(3);
  await page.getByTestId('action-undo').click();
  await expect(page.getByTestId('target-panel').locator('.strip-cell.ok')).toHaveCount(2);
  await openMap(page);await page.getByTestId('cnode-ins-c06').click();
  await expect(page.getByTestId('target-panel').locator('[data-clue-unit]')).toHaveCount(9);
  const cap=await page.getByTestId('target-panel').evaluate(el=>el.scrollHeight-el.clientHeight);
  expect(cap).toBeLessThanOrEqual(1);
  await expect(page.getByTestId('icon-row')).toBeVisible();
  const startY=(await documentBox(page.getByTestId('mechanics-board'))).y;
  for(const c of [15,14,13,12,11])await tile(page,c).tap();
  expect(Math.abs((await documentBox(page.getByTestId('mechanics-board'))).y-startY)).toBeLessThan(1);
  await expect(page.getByTestId('lab-progress')).toHaveText('7/9 blocks');
});

 test('mixed completion shares sliding win card, close/replay, and no duplicate gene credit',async({page})=>{
  await freshLegacyIns(page,true);await openMap(page);await page.getByTestId('cnode-ins-02').click();await page.getByTestId('tutorial-skip').click();
  for(const c of [12,21,30,31,40,49,50])await tile(page,c).tap();
  const win=page.getByTestId('win');
  await expect(win).toBeVisible();
  await expect(win.locator('.card .card-head')).toBeVisible();
  await expect(page.getByTestId('win-bases')).toContainText('+9 INS coding bases');
  await expect(page.getByTestId('win-assembly')).toHaveText('9 / 333 INS coding bases assembled.');
  await expect(page.getByTestId('mixed-extracted')).toHaveText('TGGATGCGC');
  await win.locator('.win-strand').click();
  await expect(win.locator('.win-strand')).toHaveClass(/skip/);
  await page.getByTestId('win-close').click();
  await expect(page.getByTestId('solved-banner')).toBeVisible();
  await expect(page.getByTestId('solved-stars')).toHaveCount(0);
  await page.getByTestId('replay').click();
  for(const c of [12,21,30,31,40,49,50])await tile(page,c).tap();
  await expect(page.getByTestId('win-bases')).toContainText('Replay · no new bases');
  await expect(page.getByTestId('win-assembly')).toHaveText('9 / 333 INS coding bases assembled.');
  await page.reload();await openMap(page);await page.getByTestId('cnode-ins-02').click();
  await expect(win).toHaveCount(0);
  await expect(page.getByTestId('solved-banner')).toBeVisible();
});


test('every new mechanic shares sliding layout, targets and toolbar on both phone sizes',async({page})=>{
  await freshLegacyIns(page,true);await openMap(page);
  const stages=[['ins-02','trace'],['ins-03','connections'],['ins-04','assembly'],['ins-05','crush'],['ins-06','mutation'],['ins-c07','restriction']];
  for(const size of [{width:390,height:844},{width:320,height:568}]){
    await page.setViewportSize(size);await page.getByTestId('cnode-ins-01').click();
    if(await page.getByTestId('mechanic-tutorial').isVisible())await page.getByTestId('tutorial-skip').click();
    const classic=(await page.getByTestId('board').boundingBox())!;
    await openMap(page);
    for(const [id,kind] of stages){
      await page.getByTestId('cnode-'+id).click();
      if(await page.getByTestId('mechanic-tutorial').isVisible())await page.getByTestId('tutorial-skip').click();
      await expect(page.getByTestId('play-title')).toHaveText('INS');
      await expect(page.locator('.mechanic-heading,.mechanic-instructions,.mechanic-target')).toHaveCount(0);
      const target=page.getByTestId('target-panel'), board=page.getByTestId('mechanics-board');
      await expect(target).toBeVisible();
      await expect(board.locator('[data-lab-cell]')).toHaveCount(81);
      const bounds=(await board.boundingBox())!;
      expect(Math.abs(bounds.width-classic.width)).toBeLessThan(1);
      expect(Math.abs(bounds.x-classic.x)).toBeLessThan(1);
      expect(Math.abs(bounds.width-bounds.height)).toBeLessThan(1);
      expect(await target.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);
      await expect(page.getByTestId('under-board').getByTestId('icon-row')).toBeVisible();
      await expect(page.getByTestId('action-undo')).toBeDisabled();
      await expect(page.getByTestId('action-restart')).toBeDisabled();
      await expect(page.getByTestId('power-crispr')).toHaveCount(0);
      if(kind==='connections'){
        await expect(page.getByTestId('connection-target').locator('.connection-clue')).toHaveCount(3);
        await tile(page,1).tap();await tile(page,2).tap();
        await expect(page.getByTestId('action-undo')).toBeEnabled();
        await page.getByTestId('action-undo').click();
        await page.getByTestId('action-restart').click();
        await expect(page.getByTestId('moves')).toHaveText('0 moves');
      }
      if(kind==='mutation')await expect(page.getByTestId('lab-base-A')).toBeVisible();
      await openMap(page);
    }
  }
});


test('INS Genome Assembly restores grey placed reads after a reload',async({page})=>{
  await freshLegacyIns(page,true);await openMap(page);await page.getByTestId('cnode-ins-04').click();await page.getByTestId('tutorial-skip').click();
  await tile(page,1).tap();await tile(page,67).tap();
  await expect(page.locator('.assembly-placed')).toHaveCount(5);
  await page.reload();await openMap(page);await page.getByTestId('cnode-ins-04').click();
  await expect(page.locator('.assembly-placed')).toHaveCount(5);
  await expect(page.getByTestId('lab-progress')).toHaveText('1/3 reads');
  await page.getByTestId('action-undo').click();
  await expect(page.locator('.assembly-placed')).toHaveCount(0);
});


test('Codon Crush guide swaps real neighbours then clears and refills the exact gameplay board',async({page})=>{
  await freshLegacyIns(page,true);await openMap(page);await page.getByTestId('cnode-ins-05').click();
  const guide=page.getByTestId('tutorial-board'), actual=page.getByTestId('mechanics-board');
  const initial=await actual.locator('[data-lab-cell]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-base')??'.').join(''));
  await expect(guide.locator('[data-demo-cell]')).toHaveCount(81);
  await expect(guide.locator('.tutorial-crush-swap,.tutorial-crush-fall,.tutorial-crush-clear')).toHaveCount(0);
  await page.getByTestId('tutorial-next').click();
  const swap=guide.getByTestId('tutorial-crush-swap');
  await expect(swap).toHaveCount(2);
  const motion=await swap.evaluateAll(nodes=>nodes.map(n=>{
    const a=n.getAnimations()[0]!;a.pause();a.currentTime=0;
    const start=n.getBoundingClientRect();a.currentTime=1800;const end=n.getBoundingClientRect();
    return {source:Number(n.getAttribute('data-source')),dest:Number(n.getAttribute('data-destination')),dx:end.x-start.x,dy:end.y-start.y,width:start.width};
  }));
  expect(motion.map(m=>[m.source,m.dest])).toEqual([[12,13],[13,12]]);
  expect(Math.abs(motion[0]!.dx-motion[0]!.width-1)).toBeLessThan(1);
  expect(Math.abs(motion[1]!.dx+motion[1]!.width+1)).toBeLessThan(1);
  expect(motion.every(m=>Math.abs(m.dy)<1)).toBe(true);
  await page.getByTestId('tutorial-next').click();
  const cleared=guide.getByTestId('tutorial-crush-clear'), falling=guide.getByTestId('tutorial-crush-fall');
  await expect(cleared).toHaveCount(3);
  const target=await page.locator('.tutorial-target').textContent();
  expect((await cleared.allTextContents()).join('')).toBe(target);
  await expect(guide.locator('.tutorial-crush-new')).toHaveCount(3);
  const fallData=await falling.evaluateAll(nodes=>nodes.map(n=>{
    const a=n.getAnimations()[0]!;a.pause();a.currentTime=0;
    const start=n.getBoundingClientRect();a.currentTime=1500;const end=n.getBoundingClientRect();
    return {source:n.getAttribute('data-source'),dest:Number(n.getAttribute('data-destination')),dy:end.y-start.y,height:start.height,delay:a.effect?.getTiming().delay};
  }));
  expect(fallData.every(f=>f.delay===650)).toBe(true);
  expect(fallData.some(f=>f.source!=='new')).toBe(true);
  for(const f of fallData.filter(f=>f.source!=='new')) expect(Math.abs(f.dy-((f.dest-Number(f.source))/9)*(f.height+1))).toBeLessThan(1);
  await cleared.evaluateAll(nodes=>nodes.forEach(n=>n.getAnimations()[0]!.finish()));
  await expect(cleared.first()).toHaveCSS('opacity','0');
  const final=await guide.locator('[data-demo-cell]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-base')).join(''));
  expect(final).not.toBe(initial);
  await page.getByRole('button',{name:'Replay animation'}).click();
  await expect(guide.getByTestId('tutorial-crush-clear')).toHaveCount(3);
  await page.getByTestId('tutorial-next').click();
  await expect(guide).toHaveAttribute('data-step','4');
  await expect(page.getByRole('heading',{name:'Chain reaction!'})).toBeVisible();
  await expect(guide.getByTestId('tutorial-crush-swap')).toHaveCount(0);
  expect((await guide.getByTestId('tutorial-crush-clear').allTextContents()).join('')).toBe('CTG');
  const chained=await guide.locator('[data-demo-cell]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-base')).join(''));
  await page.getByTestId('tutorial-next').click();
  await tile(page,12).tap();await tile(page,13).tap();
  await expect(actual).toHaveAttribute('data-crush-phase','idle');
  const live=await actual.locator('[data-lab-cell]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-base')??'.').join(''));
  expect(live).not.toBe(final);
  expect(live).toBe(chained); // both animated frames match the engine's actual cascade
  await expect(page.getByTestId('lab-progress')).toHaveText('2/3 codons');
  await expect(page.getByTestId('moves')).toHaveText('1 move');
});

test('DNA tracing hints remain graphical through wrong taps, alternate paths and backtracking',async({page})=>{
  await freshLegacyIns(page,true);await openMap(page);await page.getByTestId('cnode-ins-02').click();await page.getByTestId('tutorial-skip').click();
  const board=page.getByTestId('mechanics-board'), dashed=board.locator('.hinted');
  const hint=page.getByTestId('action-hint');
  await hint.click();
  const at=async(c:number)=>{
    await expect(dashed).toHaveCount(1);
    await expect(tile(page,c)).toHaveClass(/hinted/);
    expect(await tile(page,c).evaluate(el=>getComputedStyle(el,'::after').backgroundImage)).toContain('repeating-linear-gradient');
    await expect(page.locator('.lab-hint,[data-testid="lab-message"]')).toHaveCount(0);
  };
  await at(12);
  await board.locator('[data-lab-cell="80"]').tap();await at(12);
  await tile(page,1).tap();await at(12);
  await tile(page,10).tap();await at(12);
  await tile(page,11).tap();await at(12);
  for(const c of [12,13])await tile(page,c).tap();
  await at(12);
  await tile(page,12).tap();await at(21);
  await tile(page,11).tap();await at(12);
  await tile(page,20).tap();
  await expect(dashed).toHaveCount(1);
  const next=Number(await dashed.getAttribute('data-lab-cell'));
  expect([19,21]).toContain(next);
  expect(await dashed.evaluate(el=>getComputedStyle(el,'::after').backgroundImage)).toContain('repeating-linear-gradient');
  await tile(page,1).tap();await at(next);
  await hint.click();await expect(dashed).toHaveCount(0);
  await hint.click();await at(next);
  await page.getByTestId('action-restart').click();await at(12);
  await expect(page.getByTestId('lab-progress')).toHaveText('2/9 bases');
});


test('campaign Mutation Correction graphical hints retain toggle and repair the selected DNA base',async({page})=>{
  await freshLegacyIns(page,true);await openMap(page);await page.getByTestId('cnode-ins-06').click();await page.getByTestId('tutorial-skip').click();
  await page.getByTestId('action-hint').click();
  const square=page.locator('.mutation-hinted'), replacement=page.locator('.mutation-base-hinted');
  await expect(square).toHaveCount(1);await expect(replacement).toHaveCount(1);
  const first=Number(await square.getAttribute('data-lab-cell'));
  const want=await page.getByTestId('mutation-target-'+first).textContent();
  await expect(replacement).toHaveText(want!);await replacement.tap();
  await expect(tile(page,first)).toHaveAttribute('data-base',want!);
  await expect(square).toHaveCount(1);await expect(tile(page,first)).not.toHaveClass(/mutation-hinted/);
  await expect(page.locator('.lab-hint,[data-testid="lab-message"],[data-testid="mutation-selection"]')).toHaveCount(0);
  await expect(page.getByTestId('action-hint')).toHaveAttribute('aria-pressed','true');
});


test('old tracing attempts resume unchanged and restart with the free starter pair',async({page})=>{
  await freshLegacyIns(page,true);
  await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('genome-save')!);s.mixedAttempts={'ins-02':[{type:'trace',cell:9}]};s.tutorialsSeen=['trace'];localStorage.setItem('genome-save',JSON.stringify(s));});
  await page.reload();await openMap(page);await page.getByTestId('cnode-ins-02').click();
  await expect(page.getByTestId('lab-progress')).toHaveText('1/9 bases');
  await expect(page.getByTestId('moves')).toHaveText('1 move');
  await expect(tile(page,9)).toHaveClass(/traced/);
  await page.getByTestId('action-restart').click();
  await expect(page.getByTestId('lab-progress')).toHaveText('2/9 bases');
  await expect(page.getByTestId('moves')).toHaveText('0 moves');
  await expect(page.getByTestId('trace-path')).toHaveAttribute('points','1.5,1.5 2.5,1.5');
  await expect(page.getByTestId('action-undo')).toBeDisabled();
  await tile(page,12).tap();
  await page.reload();await openMap(page);await page.getByTestId('cnode-ins-02').click();
  await expect(page.getByTestId('lab-progress')).toHaveText('3/9 bases');
  await expect(page.getByTestId('moves')).toHaveText('1 move');
  await page.getByTestId('action-undo').click();
  await expect(page.getByTestId('lab-progress')).toHaveText('2/9 bases');
  await expect(page.getByTestId('action-undo')).toBeDisabled();
});


test('campaign Connections graphical hint remains actionable after resuming a partial route',async({page})=>{
  await freshLegacyIns(page,true);await openMap(page);await page.getByTestId('cnode-ins-03').click();await page.getByTestId('tutorial-skip').click();
  await tile(page,1).tap();await tile(page,2).tap();
  await page.reload();await openMap(page);await page.getByTestId('cnode-ins-03').click();
  await page.getByTestId('action-hint').click();
  const dashed=page.locator('.connection-hinted');
  await expect(dashed).toHaveAttribute('data-lab-cell','3');
  await dashed.tap();await expect(dashed).toHaveAttribute('data-lab-cell','4');
  await expect(page.locator('.lab-hint,[data-testid="lab-message"]')).toHaveCount(0);
  await expect(page.getByTestId('action-hint')).toHaveAttribute('aria-pressed','true');
});


test('campaign Codon Crush hints match the saved board and remain graphical',async({page})=>{
  await freshLegacyIns(page,true);await openMap(page);await page.getByTestId('cnode-ins-05').click();await page.getByTestId('tutorial-skip').click();
  await page.getByTestId('action-hint').click();
  const board=page.getByTestId('mechanics-board'), dashed=board.locator('.crush-hinted');
  await expect(dashed).toHaveCount(2);await expect(tile(page,12)).toHaveClass(/crush-hinted/);await expect(tile(page,13)).toHaveClass(/crush-hinted/);
  await tile(page,12).tap();await tile(page,13).tap();await expect(board).toHaveAttribute('data-crush-phase','idle');
  await expect(tile(page,66)).toHaveClass(/crush-hinted/);
  await page.reload();await openMap(page);await page.getByTestId('cnode-ins-05').click();
  const hint=page.getByTestId('action-hint');
  if(await hint.getAttribute('aria-pressed')!=='true')await hint.click();
  await expect(dashed).toHaveCount(2);await expect(tile(page,66)).toHaveClass(/crush-hinted/);await expect(tile(page,67)).toHaveClass(/crush-hinted/);
  await expect(page.locator('.lab-hint')).toHaveCount(0);
});


test('Mutation Correction is named consistently in map, practice menu, play and tutorial',async({page})=>{
  await freshLegacyIns(page,true);await openMap(page);
  await expect(page.getByTestId('cnode-ins-06')).toHaveAttribute('aria-label',/Mutation Correction/);
  await page.getByTestId('open-mechanics').click();
  await expect(page.getByTestId('mechanic-mutation')).toContainText('Mutation Correction');
  await page.getByTestId('mechanic-mutation').click();
  await expect(page.getByTestId('mechanic-tutorial').getByRole('heading',{name:'Mutation Correction',exact:true})).toBeVisible();
  await page.getByTestId('tutorial-skip').click();
  await expect(page.getByTestId('target-panel').locator('.target-title').first()).toHaveText('Mutation Correction');
  await openMap(page);await page.getByTestId('cnode-ins-06').click();
  await expect(page.getByTestId('target-panel').locator('.target-title').first()).toHaveText('Mutation Correction');
  await expect(page.getByTestId('mechanic-tutorial')).toHaveCount(0);
});


test('twelve-codon chapter keeps targets readable on a small phone and saves a whole chain as one move',async({page})=>{
  await freshLegacyIns(page,true);await page.setViewportSize({width:320,height:568});await openMap(page);
  await page.getByTestId('cnode-ins-c02').click();await page.getByTestId('tutorial-skip').click();
  const board=page.getByTestId('mechanics-board'),panel=page.getByTestId('target-panel');
  await expect(panel.locator('.mixed-codon-clues .clue-part')).toHaveCount(4);
  await expect(panel.locator('.mixed-codon-clues .clue-part:visible')).toHaveCount(2);
  const y=(await documentBox(board)).y;
  await page.getByTestId('action-hint').click();
  await expect(tile(page,12)).toHaveClass(/crush-hinted/);
  await tile(page,12).tap();await tile(page,13).tap();
  await expect(board).toHaveAttribute('data-crush-phase','idle');
  await expect(page.getByTestId('lab-progress')).toHaveText('2/4 block matches');
  await expect(panel.locator('.mixed-codon-clues .clue-part:visible .badge')).toHaveText(['3','4']);
  await expect(page.getByTestId('moves')).toHaveText('1 move');
  expect(Math.abs((await documentBox(board)).y-y)).toBeLessThan(1);
  const before=await board.locator('[data-lab-cell]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-base')??'.').join(''));
  await page.reload();await openMap(page);await page.getByTestId('cnode-ins-c02').click();
  await expect(page.getByTestId('lab-progress')).toHaveText('2/4 block matches');
  await expect(page.getByTestId('moves')).toHaveText('1 move');
  expect(await board.locator('[data-lab-cell]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-base')??'.').join(''))).toBe(before);
  await page.getByTestId('action-undo').click();
  await expect(page.getByTestId('lab-progress')).toHaveText('0/4 block matches');
  await expect(panel.locator('.mixed-codon-clues .clue-part:visible .badge')).toHaveText(['1','2']);
  await expect(page.getByTestId('moves')).toHaveText('0 moves');
  await tile(page,12).tap();await tile(page,13).tap();
  await expect(board).toHaveAttribute('data-crush-phase','idle');
  await expect(panel.locator('.mixed-codon-clues .clue-part:visible .badge')).toHaveText(['3','4']);
  await page.getByTestId('action-restart').click();
  await expect(panel.locator('.mixed-codon-clues .clue-part:visible .badge')).toHaveText(['1','2']);
});

test('new gene introductions and 96-base mixed mutation boards work in the browser',async({page})=>{
  await freshLegacyIns(page,true);await page.setViewportSize({width:390,height:844});await openMap(page);
  await page.getByTestId('cnode-gpx1-i02').click();await page.getByTestId('tutorial-skip').click();
  await expect(page.getByTestId('play-title')).toHaveText('GPX1');
  await expect(page.getByTestId('lab-progress')).toHaveText('2/9 bases');
  await expect(page.getByTestId('mechanics-board').locator('.lab-token')).toHaveCount(0);
  await openMap(page);await page.getByTestId('cnode-dmd-c11').click();await page.getByTestId('tutorial-skip').click();
  await expect(page.getByTestId('play-title')).toHaveText('DMD');
  await expect(page.getByTestId('mixed-range')).toContainText('96-base blocks');
  await expect(page.getByTestId('mechanics-board').locator('[data-seq]').first()).toHaveAttribute('data-seq',/^[ACGT]{96}$/);
  const dnaBoard=page.getByTestId('mechanics-board');
  await expect(dnaBoard.locator('.mutation-spacer')).toHaveCount(9);
  await expect(dnaBoard.locator('.mutation-spacer').first()).toHaveCSS('background-image','none');
  const occupiedGap=await dnaBoard.locator('.lab-cell[data-base]').evaluateAll(nodes=>
    nodes.filter(el=>Number(el.getAttribute('data-visual-cell'))%9===7).length);
  expect(occupiedGap).toBe(0);
  const blockRail=await page.getByTestId('mechanics-board').evaluate(root=>{
    const option=root.querySelector<HTMLElement>('.mutation-rail-button.lab-token')!;
    const tile=root.querySelector<HTMLElement>('.lab-cell.lab-token:not(.mutation-rail-button)')!;
    const replacement=getComputedStyle(option),board=getComputedStyle(tile);
    const colourBlock=document.createElement('span');
    colourBlock.style.backgroundColor=replacement.getPropertyValue('--tok-bg').trim();
    document.body.append(colourBlock);
    const expectedBackground=getComputedStyle(colourBlock).backgroundColor;
    colourBlock.remove();
    return {options:root.querySelectorAll('.mutation-rail-button.lab-cell.lab-token').length,
      colour:replacement.color,boardColour:board.color,font:replacement.fontFamily,boardFont:board.fontFamily,
      faceSize:getComputedStyle(option.querySelector('.tok-face')!).fontSize,
      boardFaceSize:getComputedStyle(tile.querySelector('.tok-face')!).fontSize,
      background:replacement.backgroundColor,expectedBackground,
      border:replacement.borderTopColor,opacity:replacement.opacity};
  });
  expect(blockRail.options).toBe(4);
  expect(blockRail.colour).toBe(blockRail.boardColour);
  expect(blockRail.font).toBe(blockRail.boardFont);
  expect(blockRail.faceSize).toBe(blockRail.boardFaceSize);
  expect(blockRail.background).toBe(blockRail.expectedBackground);
  expect(blockRail.border).toBe('rgb(68, 68, 67)');
  expect(blockRail.opacity).toBe('1');
  await page.getByTestId('action-hint').click();
  const suggested=page.locator('.mutation-base-hinted');
  await expect(suggested).toHaveCount(1);
  await suggested.tap();
  await expect(page.getByTestId('moves')).toHaveText('1 move');
  await page.reload();await openMap(page);await page.getByTestId('cnode-dmd-c11').click();
  await expect(page.getByTestId('moves')).toHaveText('1 move');
  await expect(page.getByTestId('mixed-coverage')).toHaveText('0/11058 bp assembled');
});


test('multi-base assembly clues read horizontally and share graphite and palette with the board',async({page})=>{
  await freshLegacyIns(page,true);
  await page.setViewportSize({width:320,height:568});
  await openMap(page);
  const stages=CAMPAIGN_LEVELS.filter(def=>def.tier && mechanicOf(def)==='assembly');
  expect(stages.length).toBeGreaterThan(0);
  const chosen=[...new Map(stages.map(def=>[def.tier,def])).values()];
  for(const def of chosen){
    const stage=mixedStage(def)!;
    await page.getByTestId('cnode-'+def.id).click();
    if(await page.getByTestId('mechanic-tutorial').isVisible())await page.getByTestId('tutorial-skip').click();
    const ref=page.getByTestId('assembly-reference'), board=page.getByTestId('mechanics-board');
    const chips=ref.locator(':scope > .lab-token');
    await expect(chips).toHaveCount(stage.spec.ASSEMBLY_TARGET.length);
    const geometry=await chips.evaluateAll(nodes=>nodes.filter(el=>!el.hasAttribute('data-clue-hidden')).map(el=>{
      const rect=el.getBoundingClientRect();
      const letters=Array.from(el.querySelectorAll('.chip-label i, .tok-row i'));
      const positions=letters.map(l=>({x:l.getBoundingClientRect().x,y:l.getBoundingClientRect().y,colour:getComputedStyle(l).color}));
      return {x:rect.x,y:rect.y,right:rect.right,bg:getComputedStyle(el).backgroundColor,positions,seq:el.getAttribute('aria-label')!.split(': ')[1]!,divider:el.querySelectorAll('.tok-divider').length,barcode:el.querySelectorAll('.barcode').length};
    }));
    expect(geometry[1]!.x).toBeGreaterThan(geometry[0]!.x);
    expect(geometry[1]!.y).toBe(geometry[0]!.y);
    for(const g of geometry){
      expect(g.right).toBeLessThanOrEqual(320);
      expect(g.positions.every(p=>p.colour==='rgb(68, 68, 67)')).toBe(true);
      if(g.seq.length>6){
        expect(g.divider).toBe(1);expect(g.barcode).toBe(0);
        expect(g.positions).toHaveLength(6);
        expect(g.positions[3]!.y).toBeGreaterThan(g.positions[0]!.y);
      }else{
        expect(g.positions.every(p=>p.y===g.positions[0]!.y)).toBe(true);
        expect(g.positions.every((p,i)=>i===0||p.x>g.positions[i-1]!.x)).toBe(true);
      }
    }
    const tiles=await board.locator('.lab-token').evaluateAll(nodes=>nodes.map(el=>({seq:el.getAttribute('data-seq'),bg:getComputedStyle(el).backgroundColor,letters:Array.from(el.querySelectorAll('.tok-row i')).map(l=>getComputedStyle(l).color)})));
    for(const t of tiles)expect(t.letters.every(c=>c==='rgb(68, 68, 67)')).toBe(true);
    for(const g of geometry)expect(tiles.some(t=>t.seq===g.seq&&t.bg===g.bg)).toBe(true);
    const panel=page.getByTestId('target-panel');
    expect(await panel.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);
    await openMap(page);
  }
});


test('multi-base Genome Assembly hints advance and recover saved progress after reload',async({page})=>{
  await freshLegacyIns(page,true);await openMap(page);
  const def=CAMPAIGN_LEVELS.find(def=>def.tier===6 && mechanicOf(def)==='assembly') ?? CAMPAIGN_LEVELS.find(def=>def.tier && mechanicOf(def)==='assembly')!;
  const stage=mixedStage(def)!;
  await page.getByTestId('cnode-'+def.id).click();
  await page.getByTestId('tutorial-skip').click();
  const hint=page.getByTestId('action-hint');
  await hint.click();
  const source=page.locator('.assembly-hint-source'), destination=page.locator('.assembly-hint-destination');
  const readOrder=stage.spec.READ_ORDER??stage.spec.READS.map((_,i)=>i);
  for(const read of readOrder){
    await expect(source).toHaveAttribute('data-lab-cell',String(stage.spec.READ_CELLS[read]![0]));
    await expect(destination).toHaveAttribute('data-lab-cell',String(stage.spec.ASSEMBLY_CELLS[stage.spec.READ_STARTS[read]!]));
    await expect(page.locator('.lab-hint')).toHaveCount(0);
    await source.tap();await destination.tap();
    if(read===readOrder[0]){
      await page.reload();await openMap(page);await page.getByTestId('cnode-'+def.id).click();
      await expect(page.getByTestId('lab-progress')).toHaveText('1/3 reads');
      // Hint mode is session-local across a full reload, as in the other mechanics.
      if(await hint.getAttribute('aria-pressed')!=='true')await hint.click();
      await expect(hint).toHaveAttribute('aria-pressed','true');
    }
  }
  await expect(page.getByTestId('win')).toBeVisible();
  await expect(source).toHaveCount(0);await expect(destination).toHaveCount(0);
});


test('MC1R Mutation Correction shows one target row, promoting the next after repair', async ({page}) => {
  const level=CAMPAIGN_LEVELS.filter(l=>l.symbol==='MC1R')[5]!;
  expect(mechanicOf(level)).toBe('mutation');
  await page.setViewportSize({width:390,height:844});
  await fresh(page);await openMap(page);
  await page.getByTestId('cnode-'+level.id).click();
  const panel=page.getByTestId('target-panel');
  const rows=page.getByTestId('mutation-reference').locator('.mutation-reference-row');
  const checkRows=async()=>{
    await expect(rows).toHaveCount(3);
    const states=await rows.evaluateAll(nodes=>nodes.map((el,index)=>({
      index,done:el.getAttribute('data-clue-done')==='true',
      visible:!el.hasAttribute('data-clue-hidden'),
    })));
    const remaining=states.filter(row=>!row.done);
    const visible=states.filter(row=>row.visible);
    expect(visible.length).toBe(remaining.length?1:0);
    if(remaining.length)expect(visible[0]!.index).toBe(remaining[0]!.index);
    expect(states.filter(row=>row.done).every(row=>!row.visible)).toBe(true);
    if(remaining.length>1)await expect(panel.locator('.clue-pagination')).toBeVisible();
    else await expect(panel.locator('.clue-pagination')).toBeHidden();
    expect(await panel.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);
  };
  await checkRows();
  await page.setViewportSize({width:320,height:568});
  await checkRows();
  const firstBottom=mixedStage(level)!.spec.MUTATION_ROWS[0]!.bottom;
  const cells=await page.locator('.lab-cell.mutation-mismatch').evaluateAll((nodes,start)=>
    nodes.map(n=>Number(n.getAttribute('data-lab-cell'))).filter(cell=>cell>=start&&cell<start+9),firstBottom);
  expect(cells.length).toBeGreaterThan(0);
  for(const cell of cells){
    const want=await page.getByTestId('mutation-target-'+cell).getAttribute('data-symbol');
    await tile(page,cell).tap();
    await page.getByTestId('lab-base-'+want).tap();
  }
  await expect(rows.first()).toHaveAttribute('data-clue-done','true');
  await expect(rows.first()).toBeHidden();
  await checkRows();
  await page.getByTestId('action-undo').click();
  await expect(rows.first()).toHaveAttribute('data-clue-done','false');
  await checkRows();
});

test('KRAS Genome Assembly promotes remaining clues and restores completed ones on Undo',async({page})=>{
  const def=CAMPAIGN_LEVELS.filter(l=>l.symbol==='KRAS')[6]!;
  expect(mechanicOf(def)).toBe('assembly');
  const stage=mixedStage(def)!;
  expect(stage.spec.ASSEMBLY_TARGET).toHaveLength(9);
  await page.setViewportSize({width:390,height:844});
  await fresh(page);await openMap(page);
  await page.getByTestId('cnode-'+def.id).click();
  const panel=page.getByTestId('target-panel');
  const chips=page.getByTestId('assembly-reference').locator(':scope > [data-clue-unit]');
  const allSlots=Array.from({length:9},(_,i)=>String(i+1));
  const positions=async()=>({panel:await documentBox(panel),board:await documentBox(page.getByTestId('mechanics-board')),toolbar:await documentBox(page.getByTestId('icon-row'))});
  const assertClues=async(expected:string[])=>{
    await expect(chips).toHaveCount(9);
    const states=await chips.evaluateAll(nodes=>nodes.map(el=>({
      id:el.querySelector('small')?.textContent??'',
      done:el.getAttribute('data-clue-done')==='true',
      hidden:el.hasAttribute('data-clue-hidden'),
      top:Math.round(el.getBoundingClientRect().top),
    })));
    expect(states.filter(s=>s.done).length).toBe(9-expected.length);
    expect(states.filter(s=>s.done).every(s=>s.hidden)).toBe(true);
    const visible=states.filter(s=>!s.hidden);
    expect(visible.every(s=>expected.includes(s.id))).toBe(true);
    if(expected.length)expect(visible.length).toBeGreaterThan(0);
    expect(new Set(visible.map(s=>s.top)).size).toBeLessThanOrEqual(1);
    if(states.some(s=>!s.done&&s.hidden))await expect(panel.locator('.clue-pagination')).toBeVisible();
    else await expect(panel.locator('.clue-pagination')).toBeHidden();
    expect(await panel.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);
  };
  await assertClues(allSlots);
  await page.setViewportSize({width:320,height:568});
  await assertClues(allSlots);
  const anchored=await positions();
  const read=0, offset=stage.spec.READ_STARTS[read]!;
  const place=async()=>{
    await tile(page,stage.spec.READ_CELLS[read]![0]!).tap();
    await tile(page,stage.spec.ASSEMBLY_CELLS[offset]!).tap();
  };
  await place();
  const remaining=allSlots.filter((_,i)=>i<offset||i>=offset+stage.spec.READS[read]!.length);
  expect(remaining.length).toBeGreaterThan(0);
  await assertClues(remaining);
  expect(await positions()).toEqual(anchored);
  await page.getByTestId('action-undo').click();
  await assertClues(allSlots);
  expect(await positions()).toEqual(anchored);
  await place();
  await page.reload();await openMap(page);await page.getByTestId('cnode-'+def.id).click();
  await assertClues(remaining);
  for(let read=1;read<stage.spec.READS.length;read++){
    await tile(page,stage.spec.READ_CELLS[read]![0]!).tap();
    await tile(page,stage.spec.ASSEMBLY_CELLS[stage.spec.READ_STARTS[read]!]!).tap();
  }
  await expect(page.getByTestId('win')).toBeVisible();
  await expect(chips.filter({visible:true})).toHaveCount(0);
  await expect(panel.locator('.clue-pagination')).toBeHidden();
});

test('a sliding solve that completes a gene offers its card, but replaying a non-final level does not',async({page})=>{
  // Complete the other INS levels first, then fill the last missing interval by sliding.
  const ins=CAMPAIGN_LEVELS.filter(l=>l.symbol==='INS');
  const opener=ins[0]!;
  expect(mechanicOf(opener)).toBe('slide');
  await openCompleted(page,serializeSave({...newSave(LEVEL_PACK),completed:ins.slice(1).map(l=>l.id)}));
  await page.getByTestId('cnode-'+opener.id).click();
  await solveWithHints(page);
  await expect(page.getByTestId('assembled')).toContainText('INS assembled');
  await page.getByRole('button',{name:'View card',exact:true}).click();
  await expect(page.getByTestId('card-state')).toContainText('Assembled');
  await expect(page.getByTestId('card-continue')).toHaveText('Continue to HBB →');
  await page.getByRole('button',{name:'← Map',exact:true}).click();
  await page.getByTestId('cnode-'+opener.id).click();
  await page.getByTestId('replay').click();
  await solveWithHints(page);
  await expect(page.getByTestId('assembled')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'View card',exact:true})).toHaveCount(0);
});


test('replaying a sliding final level shows the verified gene card without new bases',async({page})=>{
  const last=CAMPAIGN_LEVELS.find((level,i)=>CAMPAIGN_LEVELS[i+1]?.symbol!==level.symbol&&mechanicOf(level)==='slide')!;
  expect(last).toBeTruthy();
  const run=CAMPAIGN_LEVELS.filter(l=>l.symbol===last.symbol);
  await openCompleted(page,serializeSave({...newSave(LEVEL_PACK),completed:run.map(l=>l.id),assembled:[last.symbol],discovered:[last.symbol]}));
  await page.getByTestId('cnode-'+last.id).click();
  await page.getByTestId('replay').click();
  await solveWithHints(page);
  await expect(page.getByTestId('win-bases')).toContainText('Replay · no new bases');
  await expect(page.getByTestId('assembled')).toContainText(last.symbol+' assembled');
  await page.getByRole('button',{name:'View card',exact:true}).click();
  await expect(page.locator('#card-title')).toHaveText(last.symbol);
  await expect(page.getByTestId('card-state')).toContainText('Assembled');
});


test('the full DMD sequence is visible without expanding and wraps on a narrow card',async({page})=>{
  await page.setViewportSize({width:320,height:700});
  const run=CAMPAIGN_LEVELS.filter(l=>l.symbol==='DMD');
  await openCompleted(page,serializeSave({...newSave(LEVEL_PACK),completed:run.map(l=>l.id),assembled:['DMD'],discovered:['DMD']}));
  await page.getByTestId('cat-card-DMD').click();
  const sequence=page.getByTestId('assembled-sequence'),body=sequence.locator('.seq-wrap');
  await expect(sequence.getByRole('heading',{name:'Your assembled sequence ('+GENES.DMD!.cdsLength+' bases)'})).toBeVisible();
  await expect(body).toBeVisible();
  expect(await body.textContent()).toBe(GENES.DMD!.sequence);
  expect(await body.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
});


test('NPY final replay opens the card even when earlier reference intervals are historical',async({page})=>{
  const run=CAMPAIGN_LEVELS.filter(l=>l.symbol==='NPY'),last=run.at(-1)!;
  expect(last.id).toBe('npy-c08');
  expect(mechanicOf(last)).toBe('slide');
  const historical=run.filter(l=>l.id==='npy-c05'||l.id==='npy-c06').map(l=>l.id);
  expect(historical).toHaveLength(2);
  await openCompleted(page,serializeSave({...newSave(LEVEL_PACK),completed:run.filter(l=>!historical.includes(l.id)).map(l=>l.id),legacyReferenceLevels:historical}));
  await page.getByTestId('cnode-'+last.id).click();
  await page.getByTestId('replay').click();await solveWithHints(page);
  await expect(page.getByTestId('win-bases')).toContainText('Replay · no new bases');
  await expect(page.getByTestId('assembled')).toHaveCount(0);
  await page.getByRole('button',{name:'View card',exact:true}).click();
  await expect(page.locator('#card-title')).toHaveText('NPY');
  await expect(page.getByTestId('card-state')).toHaveText('Final level complete');
  await expect(page.getByTestId('card-coverage')).toContainText('Not yet assembled');
  const partialSequence=page.getByTestId('assembled-sequence').locator('.seq-wrap');
  await expect(partialSequence).toContainText('·');
  expect(await partialSequence.textContent()).toMatch(/^[ACGT·]+$/);
  await expect(page.getByTestId('card-continue')).toBeVisible();
});

test('TTR final replay opens the card even with a missing earlier level',async({page})=>{
  const run=CAMPAIGN_LEVELS.filter(l=>l.symbol==='TTR'),last=run.at(-1)!;
  const stage=mixedStage(last)!;
  expect(last.id).toBe('ttr-c09');expect(stage.mechanic).toBe('trace');
  await openCompleted(page,serializeSave({...newSave(LEVEL_PACK),completed:run.slice(1).map(l=>l.id)}));
  await page.getByTestId('cnode-'+last.id).click();
  await page.getByTestId('replay').click();
  for(const cell of stage.spec.TRACE_PATH.slice(2))await tile(page,cell).tap();
  await expect(page.getByTestId('win-bases')).toContainText('Replay · no new bases');
  await page.getByRole('button',{name:'View card',exact:true}).click();
  await expect(page.locator('#card-title')).toHaveText('TTR');
  await expect(page.getByTestId('card-state')).toHaveText('Final level complete');
  await expect(page.getByTestId('card-coverage')).toContainText('Not yet assembled');
});


test('B2M final replay opens the completion card even with older incomplete assembly credit',async({page})=>{
  const run=CAMPAIGN_LEVELS.filter(l=>l.symbol==='B2M'),last=run.at(-1)!;
  expect(last.id).toBe('b2m-c08');expect(mechanicOf(last)).toBe('slide');
  await openCompleted(page,serializeSave({...newSave(LEVEL_PACK),completed:run.slice(1).map(l=>l.id),legacyReferenceLevels:[run[0]!.id]}));
  await page.getByTestId('cnode-'+last.id).click();
  await page.getByTestId('replay').click();await solveWithHints(page);
  await expect(page.getByTestId('win-bases')).toContainText('Replay · no new bases');
  await page.getByRole('button',{name:'View card',exact:true}).click();
  await expect(page.locator('#card-title')).toHaveText('B2M');
  await expect(page.getByTestId('card-state')).toHaveText('Final level complete');
  await expect(page.getByTestId('card-coverage')).toContainText('Not yet assembled');
  await expect(page.getByTestId('assembled-sequence').locator('.seq-wrap')).toBeVisible();
});
