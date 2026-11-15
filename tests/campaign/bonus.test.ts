import { describe, expect, it } from 'vitest';
import { BONUS_PACK, advanceBonus, bonusCompleted, bonusStageCount, bonusStages, bonusUnlocked, bonusVerified, type BonusGene } from '../../src/campaign/bonus.ts';
import { CAMPAIGN_LEVELS, CAMPAIGN_GENES } from '../../src/campaign/campaign.ts';
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
  it('reconciles the pinned catalogue and verifies every shipped certificate',()=>{
    if(!BONUS_PACK.totalGenes)return; // local source-only checkout before preparation
    expect(BONUS_PACK.totalGenes).toBe(BONUS_PACK.genes.length+CAMPAIGN_GENES.length);
    const ids=new Set<string>();
    const main=new Set(CAMPAIGN_GENES);
    for(const g of BONUS_PACK.genes){
      expect(ids.has(g[0])).toBe(false);ids.add(g[0]);
      expect(main.has(g[1])).toBe(false);
      expect(g[9]).toMatch(/^[ACGT]{1,90}$/);
      expect(g[8]-g[7]+1).toBe(g[9].length);
      expect(g[7]).toBeGreaterThanOrEqual(g[4]);
      expect(g[8]).toBeLessThanOrEqual(g[5]);
      for(const stage of bonusStages(g))if(!bonusVerified(stage))throw Error('Invalid bonus certificate: '+g[0]+' '+stage.id);
    }
  },120000);
});
