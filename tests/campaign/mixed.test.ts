import { describe, expect, test } from 'vitest';
import { runOf, LEVEL_PACK } from '../../src/campaign/campaign.ts';
import { assemblyStatus, levelContribution } from '../../src/campaign/assembly.ts';
import { mechanicOf, mixedStage, replayMixed, verifiedMixed } from '../../src/campaign/mixed.ts';
import { createLab, labExtractedSequence,labDecode } from '../../src/engine/mechanicsLab.ts';
import { GENES,CATALOGUE_ORDER,INS } from '../../src/genomics/genes.ts';
import { createMemoryAdapter, loadSave, newSave, serializeSave } from '../../src/persistence/save.ts';
import { applyCommand, createInitialState } from '../../src/engine/engine.ts';

describe('mixed INS campaign',()=>{
  test('all 13 stages cover exact consecutive CDS and all seven mechanics',()=>{
    let end=0; const completed:string[]=[];
    const run=runOf('INS');
    expect(new Set(run.map(mechanicOf)).size).toBe(7);
    for(const def of run){
      expect(def.sourceIntervals[0]!.start).toBe(end);
      end=def.sourceIntervals.at(-1)!.end;
      const stage=mixedStage(def);
      if(stage){
        const initial=createLab(stage.mechanic,stage.spec);
        expect(initial.board).toHaveLength(81);expect(initial.won).toBe(false);
        const final=replayMixed(stage,stage.certificate);
        expect(final.won,def.id).toBe(true);
        expect(verifiedMixed(stage,final),def.id).toBe(true);
        expect(labExtractedSequence(final)).toBe(INS.sequence.slice(stage.start,stage.end));
        expect(levelContribution(def).sort((a,b)=>a.offset-b.offset).map(p=>p.seq).join('')).toBe(stage.sequence);
        expect(verifiedMixed(stage,initial)).toBe(false);
      }else{
        let state=createInitialState(def);
        for(const slide of def.certificateSlides)state=applyCommand(def,state,{type:'slide',...slide}).state;
        expect(state.status,def.id).toBe('solved');
      }
      completed.push(def.id);
      expect(assemblyStatus(completed,INS).covered).toBe(end);
    }
    expect(end).toBe(333);
    expect(assemblyStatus(completed,INS).verified).toBe(true);
    expect(assemblyStatus(completed,INS).assembled).toBe(INS.sequence);
  });
  test('mixed replay logs and first-use flags survive save load without dropping legacy attempts',()=>{
    const def=runOf('INS')[1]!, stage=mixedStage(def)!;
    const original=createInitialState(def);
    const save={...newSave(LEVEL_PACK),attempts:{[def.id]:original},mixedAttempts:{[def.id]:stage.certificate.slice(0,3)},traceStarterAttempts:[def.id],tutorialsSeen:['slide','trace']};
    const restored=loadSave(createMemoryAdapter(serializeSave(save)),LEVEL_PACK).save;
    expect(restored.attempts[def.id]).toEqual(original);
    expect(restored.mixedAttempts?.[def.id]).toEqual(stage.certificate.slice(0,3));
    expect(restored.traceStarterAttempts).toEqual([def.id]);
    expect(restored.tutorialsSeen).toEqual(['slide','trace']);
    expect(verifiedMixed(stage,replayMixed(stage,restored.mixedAttempts![def.id]!))).toBe(false);
  });
});

 test('legacy trace logs retain their exact path and moves; new starter attempts remain distinct',()=>{
  const def=runOf('INS')[1]!, stage=mixedStage(def)!;
  const legacy=[9].map(cell=>({type:'trace' as const,cell}));
  const old={...newSave(LEVEL_PACK),mixedAttempts:{[def.id]:legacy}};
  const loaded=loadSave(createMemoryAdapter(serializeSave(old)),LEVEL_PACK).save;
  expect(loaded.mixedAttempts?.[def.id]).toEqual(legacy);
  expect(loaded.traceStarterAttempts).toBeUndefined();
  expect(replayMixed(stage,legacy,false).trace).toEqual([9]);
  const seeded={...old,mixedAttempts:{[def.id]:stage.certificate.slice(0,1)},traceStarterAttempts:[def.id]};
  const restored=loadSave(createMemoryAdapter(serializeSave(seeded)),LEVEL_PACK).save;
  expect(restored.traceStarterAttempts).toEqual([def.id]);
  expect(replayMixed(stage,restored.mixedAttempts![def.id]!).trace).toEqual(stage.spec.TRACE_PATH.slice(0,3));
});

test('Codon Crush chapter collects twelve ordered codons with cascades and exact coverage',()=>{
  const stage=mixedStage(runOf('INS').find(d=>d.id==='ins-c02')!)!;
  expect(stage.mechanic).toBe('crush');
  expect(stage.spec.CRUSH_TARGETS).toHaveLength(4);
  expect(stage.spec.blockSize).toBe(3);
  const end=replayMixed(stage,stage.certificate);
  expect(end.won).toBe(true);
  expect(end.moves).toBeLessThan(12);
  expect(verifiedMixed(stage,end)).toBe(true);
});

test('legacy Codon Crush logs keep the valid prefix and a backup if a cascade supersedes a swap',()=>{
  const stage=mixedStage(runOf('INS').find(d=>d.id==='ins-05')!)!;
  const old=[{type:'swap' as const,a:12,b:13},{type:'swap' as const,a:39,b:40}];
  const initial={...newSave(LEVEL_PACK),completed:['ins-01'],mixedAttempts:{[stage.id]:old}};
  const adapter=createMemoryAdapter(serializeSave(initial));
  const loaded=loadSave(adapter,LEVEL_PACK);
  expect(loaded.save.completed).toEqual(['ins-01']);
  expect(loaded.save.mixedAttempts?.[stage.id]).toEqual(old.slice(0,1));
  expect(loaded.notices.join(' ')).toContain('Codon Crush now chains automatically');
  expect(adapter.backups.length).toBeGreaterThan(0);
  expect(replayMixed(stage,loaded.save.mixedAttempts![stage.id]!).collected).toBe(2);
  expect(loadSave(createMemoryAdapter(serializeSave(loaded.save)),LEVEL_PACK).notices).toEqual([]);
});

test('all 31 gene runs begin with letters, escalate, and every mixed certificate extracts exact reference DNA',()=>{
  const blockKinds=new Set<string>(),tiers=new Set<number>();
  for(const symbol of CATALOGUE_ORDER){
    const run=runOf(symbol);expect(run[0]!.tier).toBeUndefined();
    expect(run.filter(d=>!d.tier).length).toBeGreaterThanOrEqual(3);
    let previous=1;
    for(const def of run){
      const tier=def.tier??1;if(def!==run.at(-1))expect(tier).toBeGreaterThanOrEqual(previous);previous=tier;tiers.add(tier);
      const stage=mixedStage(def);if(!stage)continue;
      const initial=createLab(stage.mechanic,stage.spec);expect(initial.board).toHaveLength(81);expect(initial.won).toBe(false);
      if(def.tier){expect(stage.spec.blockSize).toBe(def.tier);expect(Object.keys(stage.spec.tokens!).length).toBeLessThanOrEqual(65);expect(Object.values(stage.spec.tokens!).some(t=>t.seq.length>1)).toBe(true);blockKinds.add(stage.mechanic);}
      const solved=replayMixed(stage,stage.certificate);expect(verifiedMixed(stage,solved),def.id).toBe(true);
      expect(labExtractedSequence(solved)).toBe(GENES[symbol]!.sequence.slice(stage.start,stage.end));
      if(stage.spec.tokens)expect(labDecode(stage.spec,solved.board.filter(b=>b!=='.'&&b!=='·').join(''))).toMatch(/^[ACGT]+$/);
    }
  }
  expect(blockKinds.size).toBe(6);expect([...tiers]).toContain(96);expect([...tiers]).toContain(48);
});
