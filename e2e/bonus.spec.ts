import {test,expect} from '@playwright/test';
import {GENES} from '../src/genomics/genes.ts';
import {CAMPAIGN_LEVELS,LEVEL_PACK} from '../src/campaign/campaign.ts';
import {newSave,serializeSave} from '../src/persistence/save.ts';
import {openCompleted} from './helpers.ts';
const FAMOUS_BASES=Object.values(GENES).reduce((n,g)=>n+g.cdsLength,0);
test('whole genome is locked until the main campaign ends',async({page})=>{
  const save=newSave(LEVEL_PACK),completed=CAMPAIGN_LEVELS.map(l=>l.id);
  await openCompleted(page,serializeSave({...save,completed:completed.slice(0,-1)}));
  await expect(page.getByTestId('open-bonus')).toBeDisabled();
  await openCompleted(page,serializeSave({...save,completed}));
  await page.getByTestId('open-bonus').click();
  await expect(page.getByTestId('bonus-map')).toBeVisible();
  await expect(page.getByRole('progressbar',{name:'Genome bases assembled'})).toHaveAttribute('aria-valuenow',String(FAMOUS_BASES));
  await expect(page.getByRole('button',{name:'Install pack',exact:true})).toHaveCount(25);
});

import {createHash} from 'node:crypto';
import {CHROMOSOMES,CHUNK_BASES,REFERENCE} from '../src/campaign/bonus.ts';
test('installs a test-only pack, assembles an exact interval and restores coverage',async({page})=>{
  // Synthetic fixture exercises packing/UI; never part of the shipped reference.
  const length=CHROMOSOMES.chrM!,payload=Buffer.alloc(Math.ceil(length/4),0x1b);
  const header=Buffer.from(JSON.stringify({format:'GENOME-T2T-1',reference:REFERENCE,chromosome:'chrM',length,annotation:'test fixture',annotationSha256:'test',sourceMd5:'06caded0055ec647a69acb708e13beff',chunkBases:CHUNK_BASES,genes:[['test','TESTGENE','test',0,9,'+']],chunkSha256:[createHash('sha256').update(payload).digest('hex')]}));
  const prefix=Buffer.alloc(4);prefix.writeUInt32LE(header.length);
  await openCompleted(page,serializeSave({...newSave(LEVEL_PACK),completed:CAMPAIGN_LEVELS.map(l=>l.id)}));
  await page.getByTestId('open-bonus').click();
  await page.getByLabel('Install chromosome packs').setInputFiles({name:'chrM.genome',mimeType:'application/octet-stream',buffer:Buffer.concat([prefix,header,payload])});
  await page.getByPlaceholder('Gene symbol or ID').fill('TESTGENE');
  await page.getByRole('button',{name:'Assemble',exact:true}).last().click();
  await expect(page.getByTestId('bonus-play')).toBeVisible();
  for(const cell of [15,14,13,12,11,10,9])await page.getByTestId('lab-cell-'+cell).click();
  await expect(page.getByTestId('bonus-win')).toBeVisible();
  await page.getByTestId('bonus-win').getByRole('button',{name:'Bonus map'}).click();
  await expect(page.getByRole('progressbar',{name:'Genome bases assembled'})).toHaveAttribute('aria-valuenow',String(FAMOUS_BASES+9));
  await expect(page.getByRole('button',{name:'✓ Complete',exact:true})).toBeVisible();
  await page.reload();await page.getByTestId('title-play').click();await page.getByTestId('open-bonus').click();
  await expect(page.getByRole('progressbar',{name:'Genome bases assembled'})).toHaveAttribute('aria-valuenow',String(FAMOUS_BASES+9));
  await page.getByPlaceholder('Gene symbol or ID').fill('TESTGENE');
  await expect(page.getByRole('button',{name:'✓ Complete',exact:true})).toBeVisible();
});
