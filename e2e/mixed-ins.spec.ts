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
  page.on('pageerror',error=>console.log('TRACE PAGE ERROR',error.message));
  await fresh(page,true);await openMap(page);await page.getByTestId('cnode-ins-01').click();
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
    {id:'ins-c02',kind:'crush',end:114},
    {id:'ins-c03',kind:'mutation',end:132},
    {id:'ins-c04',kind:'slide',end:186},
    {id:'ins-c05',kind:'slide',end:240},
    {id:'ins-c06',kind:'trace',end:294,cells:Array.from({length:54},(_,i)=>{const r=Math.floor(i/9);return r*9+(r%2?8-i%9:i%9);})},
    {id:'ins-c07',kind:'restriction',end:333},
  ];
  await page.getByTestId('cnode-ins-01').click();
  for(const s of stages){
    console.log('INS stage',s.id);
    await skip();
    if(s.kind==='slide')await solveWithHints(page);
    else if(s.kind==='trace')for(const c of s.cells!.slice(2))await tile(page,c).tap();
    else if(s.kind==='connections')for(const path of [[1,2,3,4,5,6,7,16,25],[27,28,29,38,39,40,41,42,43,44,53],[55,64,73,74,75,76,77]])for(const c of path)await tile(page,c).tap();
    else if(s.kind==='assembly')for(const [a,b] of [[1,67],[19,63],[37,65]]){await tile(page,a!).tap();await tile(page,b!).tap();}
    else if(s.kind==='crush')for(const [a,b] of (s.id==='ins-c02'?[[12,13],[66,67],[7,16],[4,5],[9,10],[2,3]]:[[12,13],[66,67]])){await tile(page,a!).tap();await tile(page,b!).tap();await expect(page.getByTestId('mechanics-board')).toHaveAttribute('data-crush-phase','idle');}
    else if(s.kind==='mutation'){
      const cells=await page.locator('.lab-cell.mutation-mismatch').evaluateAll(nodes=>nodes.map(n=>Number(n.getAttribute('data-lab-cell'))));
      for(const c of cells){const want=await page.getByTestId('mutation-target-'+c).textContent();await tile(page,c).tap();await page.getByTestId('lab-base-'+want).tap();}
    }else if(s.kind==='restriction'){await tile(page,6).tap();await tile(page,53).tap();}
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
});

test('sliding tutorial keeps stationary cells opaque and rotates the entire column with wrap',async({page})=>{
  await fresh(page,true);await openMap(page);await page.getByTestId('cnode-ins-01').click();
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
  await fresh(page,true);await openMap(page);await page.getByTestId('cnode-ins-02').click();
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
  await fresh(page,true);await openMap(page);
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
  await expect(page.getByTestId('target-panel').locator('[data-clue-unit]')).toHaveCount(54);
  const cap=await page.getByTestId('target-panel').evaluate(el=>el.scrollHeight-el.clientHeight);
  expect(cap).toBeLessThanOrEqual(1);
  await expect(page.getByTestId('icon-row')).toBeVisible();
  const startY=(await page.getByTestId('mechanics-board').boundingBox())!.y;
  for(let i=2;i<40;i++){
    const r=Math.floor(i/9), c=r%2?8-i%9:i%9;
    await tile(page,r*9+c).tap();
  }
  expect(Math.abs((await page.getByTestId('mechanics-board').boundingBox())!.y-startY)).toBeLessThan(1);
  await expect(page.getByTestId('lab-progress')).toHaveText('40/54 bases');
});

 test('mixed completion shares sliding win card, close/replay, and no duplicate gene credit',async({page})=>{
  await fresh(page,true);await openMap(page);await page.getByTestId('cnode-ins-02').click();await page.getByTestId('tutorial-skip').click();
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
  await fresh(page,true);await openMap(page);
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
  await fresh(page,true);await openMap(page);await page.getByTestId('cnode-ins-04').click();await page.getByTestId('tutorial-skip').click();
  await tile(page,1).tap();await tile(page,67).tap();
  await expect(page.locator('.assembly-placed')).toHaveCount(5);
  await page.reload();await openMap(page);await page.getByTestId('cnode-ins-04').click();
  await expect(page.locator('.assembly-placed')).toHaveCount(5);
  await expect(page.getByTestId('lab-progress')).toHaveText('1/3 reads');
  await page.getByTestId('action-undo').click();
  await expect(page.locator('.assembly-placed')).toHaveCount(0);
});


test('Codon Crush guide swaps real neighbours then clears and refills the exact gameplay board',async({page})=>{
  await fresh(page,true);await openMap(page);await page.getByTestId('cnode-ins-05').click();
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
  await tile(page,12).tap();await tile(page,13).tap();
  await expect(actual).toHaveAttribute('data-crush-phase','idle');
  const live=await actual.locator('[data-lab-cell]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-base')??'.').join(''));
  expect(live).not.toBe(final); // the live board has completed the automatic clear as well
  await expect(page.getByTestId('lab-progress')).toHaveText('2/3 codons');
  await expect(page.getByTestId('moves')).toHaveText('1 move');
});

test('DNA tracing hints remain graphical through wrong taps, alternate paths and backtracking',async({page})=>{
  await fresh(page,true);await openMap(page);await page.getByTestId('cnode-ins-02').click();await page.getByTestId('tutorial-skip').click();
  const board=page.getByTestId('mechanics-board'), dashed=board.locator('.hinted');
  const hint=page.getByTestId('action-hint');
  await hint.click();
  const at=async(c:number)=>{
    await expect(dashed).toHaveCount(1);
    await expect(tile(page,c)).toHaveClass(/hinted/);
    await expect(tile(page,c)).toHaveCSS('outline-style','dashed');
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
  await expect(dashed).toHaveCSS('outline-style','dashed');
  await tile(page,1).tap();await at(next);
  await hint.click();await expect(dashed).toHaveCount(0);
  await hint.click();await at(next);
  await page.getByTestId('action-restart').click();await at(12);
  await expect(page.getByTestId('lab-progress')).toHaveText('2/9 bases');
});


test('campaign Mutation Correction graphical hints retain toggle and repair the selected DNA base',async({page})=>{
  await fresh(page,true);await openMap(page);await page.getByTestId('cnode-ins-06').click();await page.getByTestId('tutorial-skip').click();
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
  await fresh(page,true);
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
  await fresh(page,true);await openMap(page);await page.getByTestId('cnode-ins-03').click();await page.getByTestId('tutorial-skip').click();
  await tile(page,1).tap();await tile(page,2).tap();
  await page.reload();await openMap(page);await page.getByTestId('cnode-ins-03').click();
  await page.getByTestId('action-hint').click();
  const dashed=page.locator('.connection-hinted');
  await expect(dashed).toHaveAttribute('data-lab-cell','3');
  await dashed.tap();await expect(dashed).toHaveAttribute('data-lab-cell','4');
  await expect(page.locator('.lab-hint')).toHaveCount(0);
  await expect(page.getByTestId('action-hint')).toHaveAttribute('aria-pressed','true');
});


test('campaign Codon Crush hints match the saved board and remain graphical',async({page})=>{
  await fresh(page,true);await openMap(page);await page.getByTestId('cnode-ins-05').click();await page.getByTestId('tutorial-skip').click();
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
  await fresh(page,true);await openMap(page);
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
