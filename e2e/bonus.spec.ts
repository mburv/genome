import {test,expect} from '@playwright/test';
import {CAMPAIGN_LEVELS,LEVEL_PACK} from '../src/campaign/campaign.ts';
import {newSave,serializeSave} from '../src/persistence/save.ts';
import {openCompleted} from './helpers.ts';
test('whole genome is locked until the main campaign ends',async({page})=>{
  const save=newSave(LEVEL_PACK),completed=CAMPAIGN_LEVELS.map(l=>l.id);
  await openCompleted(page,serializeSave({...save,completed:completed.slice(0,-1)}));
  await expect(page.getByTestId('open-bonus')).toBeDisabled();
  await openCompleted(page,serializeSave({...save,completed}));
  await page.getByTestId('open-bonus').click();
  await expect(page.getByTestId('bonus-map')).toBeVisible();
  await expect(page.getByRole('progressbar',{name:'Genome bases assembled'})).toHaveAttribute('aria-valuenow','0');
  await expect(page.getByRole('button',{name:'Install pack',exact:true})).toHaveCount(25);
});
