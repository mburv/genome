import {describe,it,expect} from 'vitest';
import {ALL_LEVELS,CAMPAIGN_LEVELS,LEVEL_PACK} from '../../src/campaign/campaign.ts';
import {GENES,LEGACY_GENES} from '../../src/genomics/genes.ts';
import {FAMOUS_REFERENCE} from '../../src/genomics/sharedReference.ts';
import {codingCoordinates,creditFamousCompleted,referenceLevelCovered,legacyLevelExact} from '../../src/campaign/sharedCoverage.ts';
import {genomeCovered,nextPuzzle,covered,addGenomeCredit,bonusUnlocked} from '../../src/campaign/bonus.ts';
import {newSave,recordCompletion,recordGenomeProgress,loadSave,createMemoryAdapter,serializeSave} from '../../src/persistence/save.ts';
describe('one shared reference',()=>{
 it('maps every coding base exactly to T2T chromosomes, on both strands',()=>{
  for(const [symbol,g] of Object.entries(FAMOUS_REFERENCE)){
   expect(GENES[symbol]!.sequence).toBe(g.sequence);
   const mapped=codingCoordinates(symbol,0,g.sequence.length);
   expect(mapped.reduce((n,[a,b])=>n+b-a,0)).toBe(g.sequence.length);
   expect(mapped).toEqual(g.intervals);
  }
 });
 it('credits all famous DNA coordinates once and bonus skips them',()=>{
  const ids=CAMPAIGN_LEVELS.map(l=>l.id),p=creditFamousCompleted({},ids);
  expect(genomeCovered(p)).toBe(Object.values(GENES).reduce((n,g)=>n+g.sequence.length,0));
  expect(creditFamousCompleted(p,ids)).toEqual(p);
  for(const l of CAMPAIGN_LEVELS)expect(referenceLevelCovered(p,l),l.id).toBe(true);
  for(const [c,ivs] of Object.entries(p))for(const [a,b] of ivs)expect(nextPuzzle(p,c,a,b)).toBeNull();
 });
 it('credits both mixed and sliding completions through save and reload',()=>{
  const a=CAMPAIGN_LEVELS[0]!,b=CAMPAIGN_LEVELS[1]!;
  let s=recordCompletion(newSave(LEVEL_PACK),a.id);s=recordCompletion(s,b.id);
  expect(genomeCovered(s.genomeProgress!)).toBe(18);
  expect(loadSave(createMemoryAdapter(serializeSave(s)),LEVEL_PACK).save.genomeProgress).toEqual(s.genomeProgress);
 });
 it('does not credit optional laboratory puzzles',()=>{
  const l=ALL_LEVELS.find(l=>l.lab)!;expect(genomeCovered(recordCompletion(newSave(LEVEL_PACK),l.id).genomeProgress!)).toBe(0);
 });
 it('migrates exact legacy puzzles without duplicating existing genome credit',()=>{
  const l=CAMPAIGN_LEVELS.find(l=>legacyLevelExact(l.id))!,s={...newSave(LEVEL_PACK),datasets:Object.fromEntries(Object.values(LEGACY_GENES).map(g=>[g.symbol,g.datasetId])),completed:[l.id]};
  const loaded=loadSave(createMemoryAdapter(serializeSave(s)),LEVEL_PACK).save;
  expect(loaded.completed).toContain(l.id);expect(referenceLevelCovered(loaded.genomeProgress!,l)).toBe(true);
  const r=FAMOUS_REFERENCE[l.symbol]!,iv=codingCoordinates(l.symbol,l.sourceIntervals[0]!.start,l.sourceIntervals[0]!.end)[0]!;
  expect(covered(loaded.genomeProgress![r.chromosome]!,...iv)).toBe(iv[1]-iv[0]);
 });
});

it('preserves completed legacy campaign and credits only exact matching bases; bonus fills the differences',()=>{
 const old={...newSave(LEVEL_PACK),datasets:Object.fromEntries(Object.values(LEGACY_GENES).map(g=>[g.symbol,g.datasetId])),completed:CAMPAIGN_LEVELS.map(l=>l.id)};
 const s=loadSave(createMemoryAdapter(serializeSave(old)),LEVEL_PACK).save;
 expect(bonusUnlocked([...s.completed,...s.legacyReferenceLevels??[]])).toBe(true);
 expect(s.legacyReferenceLevels).toContain('hbb-01');
 expect(genomeCovered(s.genomeProgress!)).toBe(62969);
 const hbb=FAMOUS_REFERENCE.HBB!,coords=codingCoordinates('HBB',8,9)[0]!;
 expect(covered(s.genomeProgress![hbb.chromosome]??[],...coords)).toBe(0);
 const next=recordGenomeProgress(s,addGenomeCredit(s.genomeProgress!,hbb.chromosome,coords));
 expect(next.completed).toContain('hbb-01');expect(next.legacyReferenceLevels).not.toContain('hbb-01');
});
