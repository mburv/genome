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
  const def=runOf('INS')[1]!, stage=mixedStage(def,true)!;
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
  const stage=mixedStage(runOf('INS').find(d=>d.id==='ins-05')!,true)!;
  const old=[{type:'swap' as const,a:12,b:13},{type:'swap' as const,a:39,b:40}];
  const initial={...newSave(LEVEL_PACK),mixedGeometryVersion:1,completed:['ins-01'],mixedAttempts:{[stage.id]:old}};
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

test('unified campaign retains all sliding modes and backs up old mixed attempts for reassigned stages',()=>{
  const slides=CATALOGUE_ORDER.flatMap(symbol=>runOf(symbol)).filter(def=>mechanicOf(def)==='slide');
  expect(new Set(slides.map(def=>def.mode))).toEqual(new Set(['sequence','splice','replicate','repair']));
  const original={...newSave(LEVEL_PACK),completed:['ins-c04'],mixedAttempts:{'ins-c04':[{type:'place' as const,read:0,offset:3}]}};
  const adapter=createMemoryAdapter(serializeSave(original));
  const restored=loadSave(adapter,LEVEL_PACK);
  expect(restored.save.completed).toContain('ins-c04');
  expect(restored.save.mixedAttempts?.['ins-c04']).toBeUndefined();
  expect(restored.notices.join(' ')).toContain('Older mixed attempts were backed up');
  expect(adapter.backups.length).toBeGreaterThan(0);
});

test('seeded varied geometries change spatial routes, target positions and swaps across genes',()=>{
  const samples = CATALOGUE_ORDER.flatMap(symbol => runOf(symbol))
    .map(def => mixedStage(def)).filter((s):s is NonNullable<typeof s> => s !== null);
  const geometry = (s: (typeof samples)[number]): string => {
    const p=s.spec;
    switch(s.mechanic){
      case 'trace': return JSON.stringify([p.TRACE_PATH,p.traceHoles]);
      case 'connections': return JSON.stringify([p.CONNECTION_ROUTES,p.connectionHoles]);
      case 'assembly': return JSON.stringify([p.READ_STARTS,p.READ_CELLS,p.READ_ORDER]);
      case 'crush': return JSON.stringify([p.CRUSH_SWAPS,p.crushHoles]);
      case 'mutation': return JSON.stringify([p.MUTATION_ROWS.map(r=>[r.top,r.bottom]),p.MUTATIONS]);
      case 'restriction': return JSON.stringify([p.CUT_STRANDS,p.CUT_SITES]);
    }
  };
  for(const kind of ['trace','connections','assembly','crush','mutation','restriction'] as const){
    const stages=samples.filter(s=>s.mechanic===kind);
    expect(stages.length,kind).toBeGreaterThan(3);
    expect(new Set(stages.map(geometry)).size,kind).toBeGreaterThan(Math.floor(stages.length*.9));
    for(const stage of stages.slice(0,20)){
      const original=mixedStage(runOf(stage.symbol).find(d=>d.id===stage.id)!)!;
      expect(geometry(original)).toEqual(geometry(stage));
      expect(replayMixed(stage,stage.certificate).won,stage.id).toBe(true);
    }
  }
});

test('old mixed save geometry and in-progress cell logs are retained after upgrading',()=>{
  const def=runOf('INS').find(d=>d.id==='ins-02')!,legacy=mixedStage(def,true)!;
  const actions=legacy.certificate.slice(0,2);
  const old={...newSave(LEVEL_PACK),mixedAttempts:{[def.id]:actions},completed:['ins-03']};
  delete old.mixedGeometryVersion;
  const loaded=loadSave(createMemoryAdapter(serializeSave(old)),LEVEL_PACK);
  expect(loaded.save.legacyMixedLayouts).toContain(def.id);
  expect(loaded.save.legacyMixedLayouts).toContain('ins-03');
  expect(loaded.save.mixedGeometryVersion).toBe(2);
  expect(loaded.save.mixedAttempts?.[def.id]).toEqual(actions);
  expect(replayMixed(mixedStage(def,loaded.save.legacyMixedLayouts!.includes(def.id))!,actions).moves).toBe(actions.length);
  const newRun=loadSave(createMemoryAdapter(serializeSave(loaded.save)),LEVEL_PACK);
  expect(newRun.save.legacyMixedLayouts).toEqual(loaded.save.legacyMixedLayouts);
});
