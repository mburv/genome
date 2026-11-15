import { describe, expect, it } from 'vitest';
import { BONUS_PACK, advanceBonus, bonusCompleted, bonusStageCount, bonusStages, bonusUnlocked, bonusVerified, type BonusGene } from '../../src/campaign/bonus.ts';
import { newSave, createMemoryAdapter, loadSave, serializeSave, resetProgress } from '../../src/persistence/save.ts';
import { CAMPAIGN_LEVELS, CAMPAIGN_GENES, LEVEL_PACK } from '../../src/campaign/campaign.ts';
const gene=(seq:string):BonusGene=>['ENSG00000000001.1','TEST','lncRNA','chr1',1,seq.length,'+',1,seq.length,seq];
describe('post-campaign bonus genes',()=>{
  it('unlocks only after every main level, not labs',()=>{
    const ids=CAMPAIGN_LEVELS.map(l=>l.id);
    expect(bonusUnlocked(ids.slice(0,-1))).toBe(false);
    expect(bonusUnlocked(ids)).toBe(true);
  });
  it('constructs exact, replayable fragments from single to multi-base',()=>{
    for(const n of [1,2,3,9,17,18,27,53,54,90]){
      const g=gene('ACGT'.repeat(23).slice(0,n));
      const stages=bonusStages(g);
      expect(stages).toHaveLength(bonusStageCount(g));
      expect(stages.map(s=>s.sequence).join('')).toBe(g[9]);
      for(const s of stages)expect(bonusVerified(s),s.id+' '+n).toBe(true);
    }
  });
  it('records sequential progress without replay duplication',()=>{
    const g=gene('ACGT'.repeat(23).slice(0,90));
    let p=advanceBonus({},g,2);expect(p).toEqual({});
    p=advanceBonus(p,g,1);expect(advanceBonus(p,g,1)).toBe(p);
    p=advanceBonus(p,g,2);p=advanceBonus(p,g,3);expect(bonusCompleted(p,g)).toBe(true);
  });
  it('retains bonus completion on save reload, without changing campaign completion',()=>{
    const save={...newSave(LEVEL_PACK),completed:CAMPAIGN_LEVELS.map(l=>l.id),bonusProgress:{'ENSG00000000001.1':2}};
    const restored=loadSave(createMemoryAdapter(serializeSave(save)),LEVEL_PACK).save;
    expect(restored.bonusProgress).toEqual(save.bonusProgress);
    expect(restored.completed).toEqual(save.completed);
    expect(resetProgress(LEVEL_PACK,save.settings).bonusProgress).toBeUndefined();
  });
  it('reconciles the pinned catalogue and verifies every shipped certificate',()=>{
    if(!BONUS_PACK.totalGenes)return; // local source-only checkout before preparation
    expect(BONUS_PACK.totalGenes).toBe(BONUS_PACK.genes.length+CAMPAIGN_GENES.length);
    const ids=new Set<string>();
    const main=new Set(CAMPAIGN_GENES);
    for(const g of BONUS_PACK.genes){
      if(ids.has(g[0])||main.has(g[1])||!/^[ACGT]{1,90}$/.test(g[9])||g[8]-g[7]+1!==g[9].length||g[7]<g[4]||g[8]>g[5])throw Error('Invalid bonus provenance: '+g[0]);
      ids.add(g[0]);
      for(const stage of bonusStages(g))if(!bonusVerified(stage))throw Error('Invalid bonus certificate: '+g[0]+' '+stage.id);
    }
  },120000);
});
