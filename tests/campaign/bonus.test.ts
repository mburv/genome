import {describe,expect,it} from 'vitest';
import { CAMPAIGN_LEVELS,LEVEL_PACK } from '../../src/campaign/campaign.ts';
import { CHROMOSOMES,GENOME_BASES,addGenomeCredit,bonusUnlocked,bonusVerified,covered,genomeCovered,genomeStage,nextPuzzle,readGenomeProgress } from '../../src/campaign/bonus.ts';
import { newSave,createMemoryAdapter,loadSave,serializeSave } from '../../src/persistence/save.ts';
describe('full T2T genome',()=>{
  it('unlocks after the existing campaign',()=>{const ids=CAMPAIGN_LEVELS.map(l=>l.id);expect(bonusUnlocked(ids.slice(0,-1))).toBe(false);expect(bonusUnlocked(ids)).toBe(true);});
  it('includes every chromosome and mitochondrion',()=>{expect(Object.keys(CHROMOSOMES)).toHaveLength(25);expect(GENOME_BASES).toBeGreaterThan(3.1e9);expect(GENOME_BASES).toBeLessThan(3.2e9);});
  it('credits overlapping genes and chromosome traversal exactly once',()=>{
    let p=addGenomeCredit({},'chr1',[10,20]);p=addGenomeCredit(p,'chr1',[15,30]);p=addGenomeCredit(p,'chr1',[0,10]);
    expect(p.chr1).toEqual([[0,30]]);expect(genomeCovered(p)).toBe(30);expect(covered(p.chr1!,5,25)).toBe(20);
    expect(nextPuzzle(p,'chr1',0,100)).toEqual([30,36]);expect(addGenomeCredit(p,'chr1',[5,10])).toBe(p);
  });
  it('partitions all bases, including short tails, and verifies puzzle certificates',()=>{
    let p={};const end=2000;let count=0;
    for(let iv=nextPuzzle(p,'chr1',0,end);iv;iv=nextPuzzle(p,'chr1',0,end)){
      const seq='ACGT'.repeat(216).slice(0,iv[1]-iv[0]);const s=genomeStage('chr1',iv,seq);
      expect(bonusVerified(s),s.id).toBe(true);p=addGenomeCredit(p,'chr1',iv);count++;
    }expect(genomeCovered(p)).toBe(end);expect(count).toBe(6);
    for(const n of [1,2,3,9,10,17,27,28,54,96,863,864]){
      const s=genomeStage('chrM',[0,n],'A'.repeat(n));expect(bonusVerified(s),s.id).toBe(true);
    }
  });
  it('retains validated coordinate coverage on reload',()=>{
    const s={...newSave(LEVEL_PACK),genomeProgress:addGenomeCredit({},'chr1',[0,9])};
    expect(loadSave(createMemoryAdapter(serializeSave(s)),LEVEL_PACK).save.genomeProgress).toEqual(s.genomeProgress);
    expect(readGenomeProgress({chr1:[[10,20],[0,15],[-1,2]],fake:[[0,1]]})).toEqual({chr1:[[0,20]]});
  });
});
