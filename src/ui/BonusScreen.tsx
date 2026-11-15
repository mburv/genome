import { useCallback,useEffect,useRef,useState } from 'react';
import { CHROMOSOMES,GENOME_BASES,REFERENCE,addGenomeCredit,covered,genomeCovered,nextPuzzle,genomeStage,type BonusProgress,type Interval } from '../campaign/bonus.ts';
import { openGenomePack,readGenomeSequence,type GenomePack } from '../genomics/genomePack.ts';
import { loadGenomePacks,storeGenomePack } from '../genomics/genomeStorage.ts';
import { MechanicsPlay } from './MechanicsLab.tsx';
import { labExtractedSequence,type LabState } from '../engine/mechanicsLab.ts';
import type { MixedStage } from '../campaign/mixed.ts';
import type { FeedbackOptions } from './feedback.ts';

interface Props{feedback:FeedbackOptions;progress:BonusProgress;onProgress:(next:BonusProgress)=>void;onBack:()=>void;reducedMotion:boolean}
interface Scope{chrom:string;start:number;end:number;label:string}
export function BonusScreen({progress,onProgress,onBack,reducedMotion,feedback}:Props){
  const [packs,setPacks]=useState<Record<string,GenomePack>>({});
  const [storageNote,setStorageNote]=useState('');
  useEffect(()=>{let active=true;void loadGenomePacks().then(p=>{if(active)setPacks(old=>({...p,...old}));}).catch(()=>{if(active)setStorageNote('Offline storage is unavailable; selected packs work for this session.');});return()=>{active=false;};},[]);
  const packInput=useRef<HTMLInputElement>(null);
  const [scope,setScope]=useState<Scope|null>(null),[stage,setStage]=useState<MixedStage|null>(null);
  const [hint,setHint]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const done=genomeCovered(progress);
  const install=async(files:FileList|null)=>{
    if(!files)return;setBusy(true);setError('');
    try{for(const file of Array.from(files)){const p=await openGenomePack(file);setPacks(old=>({...old,[p.header.chromosome]:p}));try{await storeGenomePack(p);}catch{setStorageNote('Storage quota or browser restrictions prevented saving some packs. Reselect those packs after reopening.');}}}
    catch(e){setError(String(e));}finally{setBusy(false);}
  };
  const open=async(s:Scope)=>{
    setBusy(true);setError('');
    try{
      const pack=packs[s.chrom];if(!pack)throw Error('Install this chromosome data pack first.');
      const iv=nextPuzzle(progress,s.chrom,s.start,s.end);
      if(!iv){setStage(null);setScope(null);return;}
      const seq=await readGenomeSequence(pack,iv);setScope(s);setStage(genomeStage(s.chrom,iv,seq));setHint(null);
    }catch(e){setError(String(e));}finally{setBusy(false);}
  };
  const credit=useCallback((state:LabState)=>{
    if(!stage||!scope||!state.won||labExtractedSequence(state)!==stage.sequence)return;
    const next=addGenomeCredit(progress,scope.chrom,[stage.start,stage.end]);if(next!==progress)onProgress(next);
  },[stage,scope,progress,onProgress]);
  const back=()=>{setScope(null);setStage(null);setHint(null);};
  if(scope&&stage){
    const iv:Interval=[stage.start,stage.end],remaining=nextPuzzle(addGenomeCredit(progress,scope.chrom,iv),scope.chrom,scope.start,scope.end);
    const completed=covered(progress[scope.chrom]??[],...iv)===iv[1]-iv[0];
    return <section className="bonus-play" data-testid="bonus-play">
      <div className="row-between"><h2 className="gene">{scope.label}</h2><button type="button" onClick={back}>Genome map</button></div>
      <p className="muted small">{scope.chrom}:{(iv[0]+1).toLocaleString()}–{iv[1].toLocaleString()} · {REFERENCE}</p>
      <p className="muted small">{covered(progress[scope.chrom]??[],scope.start,scope.end).toLocaleString()} / {(scope.end-scope.start).toLocaleString()} bases assembled in this region</p>
      {error&&<p role="alert">{error}</p>}
      <MechanicsPlay feedback={feedback} key={stage.id} id={stage.mechanic} reducedMotion={reducedMotion} hintMode={hint} onHintModeChange={setHint} onBack={back} onNext={()=>undefined}
        bonus={{stage,label:scope.label,hasNext:!!remaining,completed,onComplete:credit,onNext:()=>{if(remaining)void open(scope);else back();}}}/>
    </section>;
  }
  return <section className="map bonus-map" data-testid="bonus-map">
    <div className="row-between"><h2 className="gene">Human Genome</h2><button type="button" onClick={onBack}>Main map</button></div>
    <p className="muted small">{REFERENCE} · every chromosome, every annotated gene and intergenic base.</p>
    <p><b>{done.toLocaleString()} / {GENOME_BASES.toLocaleString()} bp assembled</b></p>
    <div className="progress thin" role="progressbar" aria-label="Genome bases assembled" aria-valuemin={0} aria-valuemax={GENOME_BASES} aria-valuenow={done}><i style={{width:100*done/GENOME_BASES+'%'}}/></div>
    {done===GENOME_BASES&&<p className="discovered assembled">Human reference genome assembled!</p>}
    <div className="row-between"><h3>Chromosomes</h3><a className="small" href="https://github.com/mburv/genome/releases/tag/t2t-chm13-v2.0">Download chromosome packs</a></div>
    <input ref={packInput} type="file" multiple accept=".genome" hidden disabled={busy} onChange={e=>{void install(e.target.files);e.target.value='';}} aria-label="Install chromosome packs"/>
    {busy&&<p role="status">Reading reference data…</p>}{error&&<p role="alert">{error}</p>}{storageNote&&<p className="muted small" role="status">{storageNote}</p>}
    <div className="panel catalogue">{Object.entries(CHROMOSOMES).map(([c,len])=>{
      const n=covered(progress[c]??[],0,len);return <div className="cat-gene" key={c} data-testid={'chromosome-'+c}>
        <div className="row-between"><b>{c}</b><button type="button" disabled={busy||n===len} onClick={()=>{if(packs[c])void open({chrom:c,start:0,end:len,label:c});else packInput.current?.click();}}>{n===len?'Complete':packs[c]?'Assemble':'Install pack'}</button></div>
        <div className="progress thin"><i style={{width:100*n/len+'%'}}/></div><p className="muted tiny">{n.toLocaleString()} / {len.toLocaleString()} bp</p>
      </div>;
    })}</div>
  </section>;
}
