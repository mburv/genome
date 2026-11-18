import { expect, test } from '@playwright/test';
import { completedLevelSave, openCompleted, openChapter, openMap, solveWithHints } from './helpers';
import m2 from '../src/campaign/levels.generated.json' with {type:'json'};
import type { LevelDefinition } from '../src/engine/types.ts';
import { CAMPAIGN_LEVELS } from '../src/campaign/campaign.ts';
import { mechanicOf, mixedStage } from '../src/campaign/mixed.ts';

// Swiss redesign (D-UI-01): the board is full-bleed on phones, with 1px hairline gutters.
for (const vp of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 430, height: 932 }]) {
  test(`board runs edge to edge at ${vp.width}×${vp.height} with no horizontal overflow and maximal tiles`, async ({ page }) => {
    await page.setViewportSize(vp);
    await openChapter(page, 'ins-01');
    const m = await page.evaluate(() => {
      const b = document.querySelector('.board')!.getBoundingClientRect();
      const t = document.querySelector('.board > .cell')!.getBoundingClientRect();
      return { left: b.left, right: b.right, width: b.width, height: b.height, tile: t.width, tileH: t.height, scroll: document.documentElement.scrollWidth, inner: window.innerWidth };
    });
    expect(m.scroll).toBeLessThanOrEqual(vp.width);
    expect(Math.abs(m.tile - m.tileH)).toBeLessThan(0.5);
    expect(Math.abs(m.width - m.height)).toBeLessThan(1);
    expect(m.left).toBeGreaterThanOrEqual(-0.5);
    expect(m.right).toBeLessThanOrEqual(vp.width + 0.5);
    // Even short viewports keep full-width square tiles; the page may scroll vertically.
    expect(m.left).toBe(0);
    expect(m.right).toBe(vp.width);
    expect(m.tile).toBeGreaterThanOrEqual((vp.width - 8) / 9 - 0.5);
  });
}

test('clinical light theme: paper canvas, light theme-color, flat square tiles', async ({ page }) => {
  await openChapter(page, 'ins-01');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(247, 247, 245)');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f7f7f5');
  const tile = page.locator('.tile').first();
  expect(await tile.evaluate((e) => getComputedStyle(e).borderRadius)).toBe('0px');
});

test('a long-token chapter board is also full-bleed at 320px with no overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openChapter(page, 'hbb-c08');
  const r = await page.locator('.board').boundingBox();
  expect(r!.x).toBe(0);
  expect(r!.width).toBe(320);
  expect(Math.abs(r!.width - r!.height)).toBeLessThan(1);
  expect(Math.abs(r!.x - (320 - (r!.x + r!.width)))).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});


test('HBB 14/15 completion card stays centered and contains all 96 bases and both actions', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await openChapter(page, 'hbb-c08');
  await solveWithHints(page);
  const win = page.getByTestId('win');
  const card = page.getByTestId('win-card');
  await expect(win).toBeVisible();
  await expect(win.getByTestId('win-meta')).toContainText('HBB 14/15 COMPLETE');
  await expect(win.locator('.win-strand .strip-cell')).toHaveCount(96);
  const assertBounds = async (width: number) => {
    const m = await card.evaluate(el => {
      const r = el.getBoundingClientRect();
      const css = getComputedStyle(el);
      const contentLeft = r.left + parseFloat(css.borderLeftWidth) + parseFloat(css.paddingLeft);
      const contentRight = r.right - parseFloat(css.borderRightWidth) - parseFloat(css.paddingRight);
      const children = Array.from(el.querySelectorAll('.win-strand .strip-cell, .card-actions button')).map(n => n.getBoundingClientRect());
      return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, viewport:window.innerHeight,
        paddingLeft:css.paddingLeft,paddingRight:css.paddingRight,overflow:el.scrollWidth-el.clientWidth,
        contentLeft,contentRight,childLeft:Math.min(...children.map(n=>n.left)),childRight:Math.max(...children.map(n=>n.right)) };
    });
    expect(m.left).toBeGreaterThanOrEqual(13.5);
    expect(width-m.right).toBeGreaterThanOrEqual(13.5);
    expect(Math.abs(m.left-(width-m.right))).toBeLessThanOrEqual(1);
    expect(m.paddingLeft).toBe(m.paddingRight);
    expect(m.top).toBeGreaterThanOrEqual(13.5);
    expect(m.bottom).toBeLessThanOrEqual(m.viewport-13.5);
    expect(m.overflow).toBeLessThanOrEqual(1);
    expect(m.childLeft).toBeGreaterThanOrEqual(m.contentLeft-1);
    expect(m.childRight).toBeLessThanOrEqual(m.contentRight+1);
    await expect(win.getByTestId('win-map')).toBeVisible();
    await expect(win.getByRole('button',{name:'Next level →'})).toBeVisible();
  };
  // The join animation must not widen the card; skip it to measure exact tile bounds.
  await win.locator('.win-strand').click();
  for(const vp of [{width:393,height:852},{width:320,height:568},{width:430,height:932},{width:568,height:320},{width:768,height:900}]){
    await page.setViewportSize(vp);
    await assertBounds(vp.width);
  }
  await page.setViewportSize({width:393,height:852});
  await win.getByRole('button',{name:'Next level →'}).click();
  await expect(page.getByTestId('play-progress')).toHaveText('15/15');
});

test('one numbered campaign map keeps completion ticks and ignores the retired classic URL',async({page})=>{
  const def=(m2.levels as LevelDefinition[]).find(l=>l.id==='ins-02')!;
  const {save}=completedLevelSave(def);
  const raw=JSON.stringify({...save,completed:['ins-01','ins-02']});
  await page.setViewportSize({width:320,height:568});
  await openCompleted(page,raw);
  await page.goto('/?classic=1');await openMap(page);
  await expect(page.getByTestId('classic-toggle')).toHaveCount(0);
  await expect(page.getByText('Use classic boards')).toHaveCount(0);
  await expect(page.locator('.node-mechanic,.cnode.play')).toHaveCount(0);
  await expect(page.locator('.cnode')).toHaveCount(413);
  const nodes=page.getByTestId('run-nodes-INS').locator('.cnode');
  await expect(nodes).toHaveCount(13);
  for(let i=0;i<13;i++)await expect(nodes.nth(i).locator('.node-number')).toHaveText(String(i+1));
  await expect(nodes.nth(0)).toHaveClass(/done/);
  await expect(nodes.nth(1)).toHaveClass(/done/);
  await expect(nodes.nth(1).locator('.node-check')).toHaveText('✓');
  await expect(nodes.nth(2).locator('.node-check')).toHaveCount(0);
  expect(await nodes.nth(1).evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe(await nodes.nth(2).evaluate(el=>getComputedStyle(el).backgroundColor));
  const bounds=await nodes.nth(1).evaluate(el=>{const r=el.getBoundingClientRect();return Array.from(el.children).every(c=>{const b=c.getBoundingClientRect();return b.left>=r.left&&b.right<=r.right&&b.top>=r.top&&b.bottom<=r.bottom;});});
  expect(bounds).toBe(true);
  await nodes.nth(1).click();
  await expect(page.getByTestId('mechanics-board')).toBeVisible();
  await expect(page.getByTestId('board')).toHaveCount(0);
  await expect(page.getByTestId('solved-banner')).toBeVisible();
  await page.getByTestId('replay').click();
  await expect(page.getByTestId('lab-progress')).toHaveText('2/9 bases');
  await openMap(page);await page.getByTestId('cnode-ins-c04').click();
  await expect(page.getByTestId('board')).toBeVisible();
  await expect(page.getByTestId('mechanics-board')).toHaveCount(0);
  await openMap(page);await page.getByTestId('cnode-ins-c06').click();
  await expect(page.getByTestId('mechanics-board')).toBeVisible();
  await expect(page.getByTestId('mixed-range')).toContainText('6-base blocks');
});


test('three-base block lettering matches the original single-base graphite on both mechanics',async({page})=>{
  await openChapter(page,'ins-01');
  const grey=await page.locator('.board .tile .letter').first().evaluate(el=>getComputedStyle(el).color);
  expect(grey).toBe('rgb(68, 68, 67)');
  for(const id of ['hbb-c03','ins-c02']){
    await openMap(page);await page.getByTestId('cnode-'+id).click();
    const letters=page.locator('.tile.tok.tier-3 .tok-row i, .lab-cell.lab-token.tier-3 .tok-row i');
    expect(await letters.count()).toBeGreaterThan(0);
    expect(await letters.evaluateAll(els=>[...new Set(els.map(el=>getComputedStyle(el).color))])).toEqual([grey]);
    const clues=page.getByTestId('target-panel').locator('.tok-chip.tier-3 .chip-label i, .lab-token.tier-3 .tok-row i');
    expect(await clues.count()).toBeGreaterThan(0);
    expect(await clues.evaluateAll(els=>[...new Set(els.map(el=>getComputedStyle(el).color))])).toEqual([grey]);
  }
});

test('long DNA tiles show only first and last codons with a divider in sliding and mixed boards', async ({ page }) => {
  const mixed = CAMPAIGN_LEVELS.find(l => (l.tier ?? 0) >= 12 && mechanicOf(l) !== 'slide')!;
  expect(mixed).toBeDefined();
  for (const id of ['hbb-c08', mixed.id]) {
    await openChapter(page, id);
    const tiles = page.locator('.board .tier-l[data-seq]');
    expect(await tiles.count()).toBeGreaterThan(0);
    for (const vp of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(vp);
      const report = await tiles.evaluateAll(els => els.map(el => {
        const seq = el.getAttribute('data-seq')!;
        const face = el.querySelector('.tok-face.long')!;
        const rows = [...face.querySelectorAll('.tok-row')].map(r => r.textContent);
        const divider = face.querySelector('.tok-divider')!;
        const box = el.getBoundingClientRect(), line = divider.getBoundingClientRect();
        return {
          seq, rows, title: el.getAttribute('title'), accessible: el.getAttribute('aria-label'),
          extras: face.querySelectorAll('.ell,.tok-len,.barcode').length,
          grey: getComputedStyle(face.querySelector('.tok-row i')!).color,
          fits: [...face.children].every(c => { const r = c.getBoundingClientRect(); return r.left >= box.left - 1 && r.right <= box.right + 1 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1; }),
          line: line.width > 0 && Math.abs(line.height - 1) < .5,
        };
      }));
      for (const tile of report) {
        expect(tile.seq.length).toBeGreaterThan(6);
        expect(tile.rows).toEqual([tile.seq.slice(0,3),tile.seq.slice(-3)]);
        expect(tile.title).toBe(tile.seq);
        expect(tile.accessible).toContain(tile.seq);
        expect(tile.extras).toBe(0);
        expect(tile.grey).toBe('rgb(68, 68, 67)');
        expect(tile.fits).toBe(true);
        expect(tile.line).toBe(true);
      }
    }
  }
  await openChapter(page, 'hbb-c07');
  const hex = page.locator('.board .tier-6 .tok-face').first();
  await expect(hex.locator('.tok-row')).toHaveCount(2);
  await expect(hex.locator('.barcode i')).toHaveCount(6);
  await expect(hex.locator('.tok-divider')).toHaveCount(0);
});

test('all long fragments, including 36-base connection pieces, share the simplified face in boards and clues', async ({page})=>{
  const longConnection=CAMPAIGN_LEVELS.find(l=>{
    if(mechanicOf(l)!=='connections'||!l.tier)return false;
    const stage=mixedStage(l)!;
    return Object.values(stage.spec.tokens??{}).some(t=>t.seq.length===36);
  });
  expect(longConnection,'a real campaign connection level with a 36-base token').toBeDefined();
  for(const id of ['hbb-c08',longConnection!.id]){
    await page.setViewportSize({width:390,height:844});
    await openChapter(page,id);
    const faces=page.locator('.board .tok-face.long, .target .tok-face.long');
    expect(await faces.count()).toBeGreaterThan(0);
    const report=await faces.evaluateAll(nodes=>nodes.map(el=>{
      const host=el.closest('[data-seq], [title], [aria-label]');
      const seq=host?.getAttribute('data-seq')??host?.getAttribute('title');
      return {seq,rows:[...el.querySelectorAll('.tok-row')].map(n=>n.textContent),divider:el.querySelectorAll('.tok-divider').length,old:el.querySelectorAll('.barcode,.ell,.tok-len').length};
    }));
    for(const r of report){
      expect(r.divider).toBe(1);expect(r.old).toBe(0);
      if(r.seq){expect(r.rows).toEqual([r.seq.slice(0,3),r.seq.slice(-3)]);}
    }
    await expect(page.locator('.target .tier-l .barcode,.board .tier-l .barcode,.target .tier-l .tok-len,.board .tier-l .tok-len')).toHaveCount(0);
    if(id===longConnection!.id)expect(report.some(r=>r.seq?.length===36)).toBe(true);
    const panel=page.getByTestId('target-panel');
    expect(await panel.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
  }
});


test('long clue chips grow around both codons and their divider on narrow and standard phones', async ({page})=>{
  test.setTimeout(180_000);
  const kinds=['trace','crush','assembly','mutation','connections','restriction'] as const;
  const replication=CAMPAIGN_LEVELS.filter(l=>(l.tier??0)>=12&&mechanicOf(l)==='slide'&&l.mode==='replicate');
  expect(replication.length).toBeGreaterThan(0);
  const ids=[...new Set(['hbb-c08','rho-c07','gpx1-c08',...replication.map(l=>l.id),...kinds.map(kind=>CAMPAIGN_LEVELS.find(l=>(l.tier??0)>=12&&mechanicOf(l)===kind)?.id).filter((id):id is string=>!!id)])].filter(id=>CAMPAIGN_LEVELS.some(l=>l.id===id));
  expect(ids.length).toBeGreaterThan(3);
  for(const id of ids){
    await page.setViewportSize({width:390,height:844});
    await openChapter(page,id);
    for(const viewport of [{width:390,height:844},{width:320,height:568}]){
      await page.setViewportSize(viewport);
      const panel=page.getByTestId('target-panel');
      await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      const report=await panel.evaluate(root=>Array.from(root.querySelectorAll('.tok-face.long')).filter(face=>face.getBoundingClientRect().height>0).map(face=>{
        const chip=face.parentElement!;
        const bounds=chip.getBoundingClientRect();
        const [a,b]=[...face.querySelectorAll('.tok-row')].map(el=>el.getBoundingClientRect());
        const line=face.querySelector('.tok-divider')!.getBoundingClientRect();
        const within=(r:DOMRect)=>r.left>=bounds.left-0.5&&r.right<=bounds.right+0.5&&r.top>=bounds.top-0.5&&r.bottom<=bounds.bottom+0.5;
        return {label:face.textContent,chipHeight:bounds.height,rowsFit:within(a!)&&within(b!)&&within(line),
          separated:a!.bottom<=line.top+0.5&&line.bottom<=b!.top+0.5,
          lineVisible:line.height>=0.5&&line.width>0,
          siblingsFit:[...chip.children].every(el=>within(el.getBoundingClientRect()))};
      }));
      expect(report.length,id+' should have visible long clue chips').toBeGreaterThan(0);
      for(const chip of report){
        expect(chip.chipHeight,id+' '+chip.label).toBeGreaterThanOrEqual(26);
        expect(chip.rowsFit,id+' '+chip.label).toBe(true);
        expect(chip.separated,id+' '+chip.label).toBe(true);
        expect(chip.lineVisible).toBe(true);
        expect(chip.siblingsFit,id+' '+chip.label).toBe(true);
      }
      expect(await panel.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
      expect(await panel.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);
      const visibleTops=await panel.locator('[data-clue-unit]:visible').evaluateAll(nodes=>
        nodes.map(node=>node.getBoundingClientRect().top));
      expect(Math.max(...visibleTops)-Math.min(...visibleTops)).toBeLessThan(2);
      const queued=await panel.locator('[data-clue-unit][data-clue-done="false"][data-clue-hidden]').count();
      if(queued)expect(visibleTops.length).toBeGreaterThan(0);
      await expect(page.getByTestId('icon-row')).toBeVisible();
    }
  }
});

test('all campaign mechanics share the one-row clue height, board origin and action row', async ({page})=>{
  test.setTimeout(180_000);
  const kinds=['trace','crush','assembly','mutation','connections','restriction'] as const;
  const ids=[...new Set(['ins-01','hbb-c07','rho-c07','hbb-c08',
    ...kinds.map(kind=>CAMPAIGN_LEVELS.find(def=>mechanicOf(def)===kind)!.id),
    ...kinds.map(kind=>CAMPAIGN_LEVELS.find(def=>(def.tier??0)>=12&&mechanicOf(def)===kind)?.id).filter((id):id is string=>!!id)])];
  for(const viewport of [{width:320,height:568},{width:375,height:667},{width:390,height:844},{width:430,height:932}]){
    await page.setViewportSize(viewport);
    await openChapter(page,'ins-01');
    const geometry=()=>page.evaluate(()=>{
      const box=(selector:string)=>document.querySelector(selector)!.getBoundingClientRect();
      const panel=box('[data-testid="target-panel"]'), board=box('.board-stage'), actions=box('[data-testid="icon-row"]');
      return {clue:panel.height,boardY:board.y+window.scrollY,boardWidth:board.width,boardHeight:board.height,boardX:board.x,actionY:actions.y+window.scrollY,actionBottom:actions.bottom+window.scrollY};
    });
    const initial=await geometry();
    expect(initial.boardWidth).toBe(viewport.width);
    expect(initial.boardHeight).toBe(viewport.width);
    expect(initial.boardX).toBe(0);
    if(viewport.height>=844)expect(initial.actionBottom).toBeLessThanOrEqual(viewport.height+1);
    expect(initial.clue).toBeGreaterThan(50);
    let sawQueuedClues=false;
    for(const id of ids){
      if(id!=='ins-01'){await openMap(page);await page.getByTestId('cnode-'+id).click();}
      const panel=page.getByTestId('target-panel');
      await expect(panel).toBeVisible();
      const actual=await geometry();
      for(const key of ['clue','boardY','boardWidth','boardHeight','boardX','actionY'] as const)expect(Math.abs(actual[key]-initial[key]),id+' '+key).toBeLessThanOrEqual(1);
      expect(await panel.evaluate(el=>el.scrollHeight-el.clientHeight),id).toBeLessThanOrEqual(1);
      const visibleTops=await panel.locator('[data-clue-unit]:visible').evaluateAll(nodes=>
        nodes.map(node=>node.getBoundingClientRect().top));
      if(visibleTops.length)expect(Math.max(...visibleTops)-Math.min(...visibleTops),id+' should show one row').toBeLessThan(2);
      const queued=await panel.locator('[data-clue-unit][data-clue-done="false"][data-clue-hidden]').count();
      if(queued)sawQueuedClues=true;
      await expect(panel.locator('.clue-pagination')).toHaveCount(0);
      await page.getByTestId('icon-row').scrollIntoViewIfNeeded();
      await expect(page.getByTestId('icon-row')).toBeInViewport({ratio:0.99});
      await page.evaluate(()=>window.scrollTo(0,0));
    }
    expect(sawQueuedClues).toBe(true);
    const source=await page.locator('.app').getAttribute('data-clue-height-source');
    expect(source).toBeTruthy();
  }
});


test('settings shares the gameplay header position and replaces the cog with a same-size X', async ({ page }) => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport);
    await openChapter(page, 'ins-01');
    const playHeader = (await page.getByTestId('play-top').boundingBox())!;
    const playTitle = (await page.getByTestId('play-title').boundingBox())!;
    const cog = page.getByTestId('open-settings');
    const cogBox = (await cog.boundingBox())!;
    await cog.click();

    await expect(page.getByTestId('settings')).toBeVisible();
    await expect(page.getByTestId('open-settings')).toHaveCount(0);
    await expect(page.getByTestId('help-how-to-play')).toHaveCount(0);
    await expect(page.getByTestId('help-about-dna')).toHaveCount(0);
    await expect(page.getByText('Settings are saved on this device. No timers, accounts or tracking.')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Done' })).toHaveCount(0);
    for (const toggle of ['toggle-motion', 'toggle-sound', 'toggle-haptics']) await expect(page.getByTestId(toggle)).toBeVisible();

    const settingsHeader = (await page.getByTestId('app-top').boundingBox())!;
    const wordmark = (await page.getByRole('heading', { name: 'GENOME' }).boundingBox())!;
    const close = page.getByTestId('close-settings');
    await expect(close).toHaveAttribute('aria-label', 'Close settings');
    await expect(close).toHaveText('×');
    const closeBox = (await close.boundingBox())!;

    expect(Math.abs(settingsHeader.y - playHeader.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(settingsHeader.y + settingsHeader.height - playHeader.y - playHeader.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(wordmark.y - playTitle.y)).toBeLessThanOrEqual(1);
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(closeBox[key] - cogBox[key]), key + ' at ' + viewport.width).toBeLessThanOrEqual(1);
    }

    await close.click();
    await expect(page.getByTestId('settings')).toHaveCount(0);
    await expect(page.getByTestId('board')).toBeVisible();
    await expect(page.getByTestId('open-settings')).toBeVisible();
  }
});


test('RHO 9/12 replication has one shared vertical strand border and unobstructed multi-base lettering', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 320, height: 700 });
  await openChapter(page, 'rho-c07');
  await expect(page.getByTestId('play-progress')).toHaveText('9/12');
  await expect(page.locator('.target-title')).toContainText('replication');

  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const a = page.getByTestId('track-1'), b = page.getByTestId('track-2');
    await expect(a).toHaveCSS('border-right-width', '2px');
    await expect(b).toHaveClass(/shared-left/);
    await expect(b).toHaveCSS('border-left-width', '0px');
    await expect(a).toHaveCSS('box-shadow', 'none');
    const rects = await page.evaluate(() => {
      const left = document.querySelector<HTMLElement>('[data-testid="track-1"]')!;
      const right = document.querySelector<HTMLElement>('[data-testid="track-2"]')!;
      const bottom = document.querySelector<HTMLElement>('[data-cell="68"] .tok-row:last-child')!;
      const a = left.getBoundingClientRect(), b = right.getBoundingClientRect();
      return { gap: b.left - a.right, textBottom: bottom.getBoundingClientRect().bottom, frameBottom: a.bottom };
    });
    expect(rects.gap).toBeGreaterThanOrEqual(-0.5);
    expect(rects.gap).toBeLessThanOrEqual(2);
    expect(rects.textBottom).toBeLessThan(rects.frameBottom - 2);
  }

  await solveWithHints(page);
  await expect(page.getByTestId('win')).toBeVisible();
  const correct = page.locator('.board .tile.tok.goal.ok');
  expect(await correct.count()).toBeGreaterThan(0);
  await expect(correct.first()).toHaveCSS('box-shadow', 'none');
  const clue = page.locator('.target .tok-chip.ok').first();
  await expect(clue).toHaveCSS('outline-style', 'none');
  await expect(clue).toHaveCSS('box-shadow', 'none');
  await expect(clue).toHaveCSS('border-bottom-width', '2px');
});

test('horizontally adjacent replication strands share a single horizontal frame edge', async ({ page }) => {
  await openChapter(page, 'rho-c03');
  const a = page.getByTestId('track-1'), b = page.getByTestId('track-2');
  await expect(a).toHaveCSS('border-bottom-width', '2px');
  await expect(b).toHaveClass(/shared-top/);
  await expect(b).toHaveCSS('border-top-width', '0px');
});
