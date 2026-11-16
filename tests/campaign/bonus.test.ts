import {describe,expect,it} from 'vitest';
import { CAMPAIGN_LEVELS,LEVEL_PACK } from '../../src/campaign/campaign.ts';
import { CHROMOSOMES,GENOME_BASES,addGenomeCredit,bonusUnlocked,bonusVerified,covered,genomeCovered,genomeStage,nextPuzzle,readGenomeProgress,genomeLevelCount,genomeLevelInterval,genomeLevelAt,nextGenomeLevel } from '../../src/campaign/bonus.ts';
import { readGenomeDownload } from '../../src/genomics/genomePack.ts';
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
  it('uses distinct, reproducible spatial boards for chromosome bonus levels',()=>{
    const seq='ACGT'.repeat(3).slice(0,9);
    const tracing=Array.from({length:24},(_,i)=>{
      const stage=genomeStage('chr1',[i*9,i*9+9],seq);
      expect(bonusVerified(stage),stage.id).toBe(true);
      expect(genomeStage('chr1',[i*9,i*9+9],seq)).toEqual(stage);
      return JSON.stringify(stage.spec.TRACE_PATH);
    });
    expect(new Set(tracing).size).toBe(tracing.length);
    const mutation=Object.keys(CHROMOSOMES).slice(0,12).map(chrom=>genomeStage(chrom,[9,36],'ACG'.repeat(9)));
    expect(new Set(mutation.map(s=>JSON.stringify([s.spec.MUTATIONS,s.spec.MUTATION_ROWS]))).size).toBe(mutation.length);
    const assembly=Object.keys(CHROMOSOMES).slice(0,12).map(chrom=>genomeStage(chrom,[90,954],'ACGT'.repeat(216)));
    expect(new Set(assembly.map(s=>JSON.stringify([s.spec.READ_CELLS,s.spec.READ_STARTS,s.spec.READ_ORDER]))).size).toBe(assembly.length);
    for(const stage of [...mutation,...assembly])expect(bonusVerified(stage),stage.id).toBe(true);
    const historical=genomeStage('chr1',[0,9],seq,true);
    expect(historical.spec.TRACE_PATH).toEqual([17,16,15,14,13,12,11,10,9]);
  });
  it('retains old bonus board geometry for already completed intervals on migration',()=>{
    const progress=addGenomeCredit({},'chr1',[0,9]);
    const old={...newSave(LEVEL_PACK),genomeProgress:progress};
    delete old.mixedGeometryVersion;
    const migrated=loadSave(createMemoryAdapter(serializeSave(old)),LEVEL_PACK).save;
    expect(migrated.legacyBonusGeometry).toEqual(progress);
    expect(migrated.mixedGeometryVersion).toBe(2);
    const reopened=loadSave(createMemoryAdapter(serializeSave(migrated)),LEVEL_PACK).save;
    expect(reopened.legacyBonusGeometry).toEqual(progress);
  });
  it('retains validated coordinate coverage on reload',()=>{
    const s={...newSave(LEVEL_PACK),genomeProgress:addGenomeCredit({},'chr1',[0,9])};
    expect(loadSave(createMemoryAdapter(serializeSave(s)),LEVEL_PACK).save.genomeProgress).toEqual(s.genomeProgress);
    expect(readGenomeProgress({chr1:[[10,20],[0,15],[-1,2]],fake:[[0,1]]})).toEqual({chr1:[[0,20]]});
  });
});


describe('chromosome download progress',()=>{
  it('reports actual percentages even without a Content-Length header and with a split prefix',async()=>{
    const bytes=new Uint8Array(4+4+Math.ceil(CHROMOSOMES.chrM!/4));
    new DataView(bytes.buffer).setUint32(0,4,true);
    const half=Math.ceil(bytes.length/2),progress:number[]=[];
    const stream=new ReadableStream<Uint8Array>({start(controller){
      for(const chunk of [bytes.slice(0,2),bytes.slice(2,half),bytes.slice(half)])controller.enqueue(chunk);
      controller.close();
    }});
    const blob=await readGenomeDownload(new Response(stream),'chrM',p=>progress.push(p));
    expect(blob.size).toBe(bytes.length);
    expect(progress).toEqual([0,50,99,100]);
  });
  it('never reports completion for a truncated download',async()=>{
    const bytes=new Uint8Array(8);new DataView(bytes.buffer).setUint32(0,4,true);
    const progress:number[]=[];
    await expect(readGenomeDownload(new Response(bytes),'chrM',p=>progress.push(p))).rejects.toThrow('Incomplete data pack');
    expect(progress).not.toContain(100);
  });
});


describe('stable chromosome level map',()=>{
  it('partitions the chromosome without gaps and preserves level numbering with sparse credit',()=>{
    const length=CHROMOSOMES.chrM!,total=genomeLevelCount(length);
    let end=0;for(let level=1;level<=total;level++){const iv=genomeLevelInterval(length,level);expect(iv[0]).toBe(end);expect(genomeLevelAt(iv[0])).toBe(level);end=iv[1];}
    expect(end).toBe(length);
    const p=addGenomeCredit(addGenomeCredit({},'chrM',[0,9]),'chrM',[36,90]);
    expect(nextGenomeLevel(p,'chrM')).toBe(2);
    expect(nextGenomeLevel(addGenomeCredit(p,'chrM',[9,36]),'chrM')).toBe(4);
    expect(nextGenomeLevel(addGenomeCredit(p,'chrM',[0,length]),'chrM')).toBeNull();
  });
});
