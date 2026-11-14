import { describe, expect, test } from 'vitest';
import { runOf, LEVEL_PACK } from '../../src/campaign/campaign.ts';
import { assemblyStatus, levelContribution } from '../../src/campaign/assembly.ts';
import { mechanicOf, mixedStage, replayMixed, verifiedMixed } from '../../src/campaign/mixed.ts';
import { createLab, labExtractedSequence } from '../../src/engine/mechanicsLab.ts';
import { INS } from '../../src/genomics/genes.ts';
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
    const save={...newSave(LEVEL_PACK),attempts:{[def.id]:original},mixedAttempts:{[def.id]:stage.certificate.slice(0,3)},tutorialsSeen:['slide','trace']};
    const restored=loadSave(createMemoryAdapter(serializeSave(save)),LEVEL_PACK).save;
    expect(restored.attempts[def.id]).toEqual(original);
    expect(restored.mixedAttempts?.[def.id]).toEqual(stage.certificate.slice(0,3));
    expect(restored.tutorialsSeen).toEqual(['slide','trace']);
    expect(verifiedMixed(stage,replayMixed(stage,restored.mixedAttempts![def.id]!))).toBe(false);
  });
});
