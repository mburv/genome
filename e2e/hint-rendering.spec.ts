import { expect, test, type Locator } from '@playwright/test';
import { openChapter } from './helpers';

/** Verify the pixels actually painted by the browser, not just the CSS declaration.
 * Use the screenshot's device pixels so a two-CSS-pixel dash is measurable at DPR 3. */
async function paintedRails(tile: Locator) {
  const metrics = await tile.evaluate(el => {
    const r = el.getBoundingClientRect(), css = getComputedStyle(el), dash = getComputedStyle(el, '::after');
    return { width:r.width, height:r.height, inset:parseFloat(dash.top),
      border:parseFloat(css.borderTopWidth), colour:dash.color };
  });
  const png = await tile.screenshot({ animations:'disabled', scale:'device' });
  return tile.page().evaluate(async ({png, metrics}) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + png;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width=img.width; canvas.height=img.height;
    const ctx=canvas.getContext('2d')!;
    ctx.drawImage(img,0,0);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    const color=metrics.colour.match(/\d+(?:\.\d+)?/g)!.slice(0,3).map(Number);
    const sx=img.width/metrics.width, sy=img.height/metrics.height;
    const edge=metrics.border+metrics.inset;
    // Sample the centre of each rail, avoiding corner overlap and fractional rounding.
    const sample=(side:'top'|'right'|'bottom'|'left')=>{
      const horizontal=side==='top'||side==='bottom';
      const length=(horizontal?metrics.width:metrics.height)-2*edge;
      const scale=horizontal?sx:sy;
      let hits=0, gaps=0;
      for(let i=3*scale;i<(length-3)*scale;i++){
        const along=edge+i/scale;
        const x=horizontal?along:side==='left'?edge+1:metrics.width-edge-1;
        const y=horizontal?(side==='top'?edge+1:metrics.height-edge-1):along;
        const at=(Math.min(img.height-1,Math.floor(y*sy))*img.width+Math.min(img.width-1,Math.floor(x*sx)))*4;
        const hit=color.every((c,k)=>Math.abs(pixels[at+k]!-c)<35);
        if(hit) hits++; else gaps++;
      }
      return {side,hits,gaps};
    };
    return [sample('top'),sample('right'),sample('bottom'),sample('left')];
  },{png:png.toString('base64'),metrics});
}

test('inset hint dashes paint all four sides on long sliding tiles',async({page})=>{
  await openChapter(page,'hbb-c08');
  await page.getByTestId('action-hint').click();
  // A nonselected tile avoids the arrow and the selection's solid highlight.
  const marked=page.locator('.board .tile.hinted:not(.selected):not(.goal)');
  expect(await marked.count()).toBeGreaterThan(0);
  for(const vp of [{width:320,height:568},{width:390,height:844}]){
    await page.setViewportSize(vp);
    const tiles=await marked.all();
    for(const tile of tiles.slice(0,2)){
      const rails=await paintedRails(tile);
      for(const r of rails){
        expect(r.hits,r.side+' painted dash pixels').toBeGreaterThan(5);
        expect(r.gaps,r.side+' visible gaps').toBeGreaterThan(5);
      }
    }
  }
  await page.getByTestId('action-hint').click();
  await expect(marked).toHaveCount(0);
});

test('mixed puzzle dashed rails paint on all sides',async({page})=>{
  await openChapter(page,'ins-02');
  await page.getByTestId('action-hint').click();
  const tile=page.locator('.board .lab-cell.hinted');
  await expect(tile).toHaveCount(1);
  for(const r of await paintedRails(tile)){
    expect(r.hits,r.side+' painted dash pixels').toBeGreaterThan(5);
    expect(r.gaps,r.side+' visible gaps').toBeGreaterThan(5);
  }
});
