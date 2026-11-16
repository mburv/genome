import { test, expect, type Page } from '@playwright/test';
import { fresh, openMap, solveWithHints } from './helpers';
import { installFeedbackProbe, feedbackLog, clearFeedback } from './feedbackProbe';
import { LAB_IDS } from '../src/engine/mechanicsLab.ts';
import { CAMPAIGN_LEVELS } from '../src/campaign/campaign.ts';
import { mixedStage } from '../src/campaign/mixed.ts';

const move = { notes: [520], vibration: [8] };
const reject = { notes: [180,150], vibration: [[12,40,12]] };
const undo = { notes: [400], vibration: [6] };
const win = { notes: [523,659,784,1047], vibration: [[30,50,30,50,60]] };
const silent = { notes: [], vibration: [] };
const tile = (page: Page, c: number) => page.getByTestId('lab-cell-'+c);
const tap = (page: Page, c: number) => tile(page,c).tap();
const log = async (page: Page, expected: object) => expect(await feedbackLog(page)).toEqual(expected);

async function start(page: Page, sound = true, haptics = true, reducedMotion = false) {
  await installFeedbackProbe(page);
  await fresh(page);
  await page.evaluate(({sound,haptics,reducedMotion}) => {
    const saved = JSON.parse(localStorage.getItem('genome-save')!);
    saved.settings = { ...saved.settings, sound, haptics, reducedMotion };
    localStorage.setItem('genome-save', JSON.stringify(saved));
  }, {sound,haptics,reducedMotion});
  await page.reload(); await openMap(page);
}
async function practice(page: Page, id: string) {
  await page.getByTestId('open-mechanics').click();
  await page.getByTestId('mechanic-'+id).click();
  await expect(page.getByTestId('mechanics-board')).toBeVisible();
}
async function swap(page: Page, a: number, b: number) {
  await tap(page,a); await tap(page,b);
  await expect(page.getByTestId('mechanics-board')).toHaveAttribute('data-crush-phase','idle');
}
async function edit(page: Page, c: number) {
  const want = await page.getByTestId('mutation-target-'+c).getAttribute('data-symbol');
  await tap(page,c); await page.getByTestId('lab-base-'+want).tap();
}
async function place(page: Page, a: number, b: number) { await tap(page,a); await tap(page,b); }
async function firstMove(page: Page, id: string) {
  switch(id) {
    case 'trace': await tap(page,12); break;
    case 'crush': await swap(page,12,13); break;
    case 'assembly': await place(page,1,67); break;
    case 'mutation': await edit(page,20); break;
    case 'connections': await tap(page,1); break;
    case 'restriction': await tap(page,10); break;
  }
  await expect(page.getByTestId('moves')).toHaveText('1 move');
}
async function finish(page: Page, id: string) {
  switch(id) {
    case 'trace': for(const c of [21,30,31,40,49,50]) await tap(page,c); break;
    case 'crush': await swap(page,4,13); break;
    case 'assembly': await place(page,19,63); await place(page,37,65); break;
    case 'mutation': for(const c of [23,48,74,78]) await edit(page,c); break;
    case 'connections':
      for(const path of [[2,3,4,5,6,7,16,25],[27,28,29,38,39,40,41,42,43,44,53],[55,64,73,74,75,76,77]])
        for(const c of path) await tap(page,c);
      break;
    case 'restriction': await tap(page,41); break;
  }
  await expect(page.getByTestId('win')).toBeVisible();
}
for(const id of LAB_IDS) test(id+' shares move, undo and completion sound/vibration', async ({page}) => {
  await start(page); await practice(page,id); await log(page,silent);
  await firstMove(page,id); await log(page,move);
  await clearFeedback(page);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await log(page,undo);
  await clearFeedback(page);
  await firstMove(page,id); await log(page,move);
  await clearFeedback(page);
  await finish(page,id);
  const cues = await feedbackLog(page);
  expect(cues.notes.slice(-4)).toEqual(win.notes);
  expect(cues.vibration.at(-1)).toEqual(win.vibration[0]);
  expect(cues.notes.filter(f=>f===523)).toHaveLength(1);
});
test('classic and mixed campaign use the same cues, including rejected actions and silent saved replays',async({page})=>{
  await start(page);
  await page.getByTestId('cnode-ins-01').click();
  await solveWithHints(page); await log(page,win);
  await page.getByRole('button',{name:'Next level →'}).click();
  await clearFeedback(page);
  // Test the level's seeded geometry, not a hard-coded legacy route.
  const route=mixedStage(CAMPAIGN_LEVELS.find(l=>l.id==='ins-02')!)!.spec.TRACE_PATH;
  await tap(page,route[1]!); await log(page,silent);
  await tap(page,route.at(-1)!); await log(page,reject);
  await clearFeedback(page); await tap(page,route[2]!); await log(page,move);
  await page.reload(); await openMap(page); await page.getByTestId('cnode-ins-02').click();
  await expect(page.getByTestId('lab-progress')).toHaveText('3/9 bases');
  await log(page,silent);
  for(const c of route.slice(3)) await tap(page,c);
  await expect(page.getByTestId('win')).toBeVisible();
  const cues=await feedbackLog(page); expect(cues.notes.slice(-4)).toEqual(win.notes);
  expect(cues.vibration.at(-1)).toEqual(win.vibration[0]);
  await page.reload(); await openMap(page); await page.getByTestId('cnode-ins-02').click();
  await log(page,silent);
});
for(const [sound,haptics] of [[false,false],[true,false],[false,true]] as const)
  test('feedback respects sound='+sound+' haptics='+haptics,async({page})=>{
    await start(page,sound,haptics,true); await practice(page,'crush');
    await firstMove(page,'crush');
    await log(page,{notes:sound?move.notes:[],vibration:haptics?move.vibration:[]});
    await clearFeedback(page); await finish(page,'crush');
    await log(page,{notes:sound?win.notes:[],vibration:haptics?win.vibration:[]});
  });
