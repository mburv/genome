import { useCallback,useEffect,useState } from 'react';
import { CHROMOSOMES,GENOME_BASES,REFERENCE,addGenomeCredit,covered,genomeCovered,genomeLevelCount,genomeLevelInterval,nextGenomeLevel,genomeStage,type BonusProgress,type Interval } from '../campaign/bonus.ts';
import { openGenomePack,readGenomeDownload,readGenomeSequence,type GenomePack } from '../genomics/genomePack.ts';
import { loadGenomePacks,storeGenomePack } from '../genomics/genomeStorage.ts';
import { MechanicsPlay } from './MechanicsLab.tsx';
import { labExtractedSequence,type LabState } from '../engine/mechanicsLab.ts';
import type { MixedStage } from '../campaign/mixed.ts';
import type { FeedbackOptions } from './feedback.ts';

interface Props{feedback:FeedbackOptions;progress:BonusProgress;onProgress:(next:BonusProgress)=>void;onBack:()=>void;onPlaying:(playing:boolean)=>void;onSettings:()=>void;reducedMotion:boolean}
interface Scope{chrom:string;level:number}
const PAGE=11*11;

export function BonusScreen({progress,onProgress,onBack,onPlaying,onSettings,reducedMotion,feedback}:Props){
  const [packs,setPacks]=useState<Record<string,GenomePack>>({});
  const [storageNote,setStorageNote]=useState('');
  useEffect(()=>{let active=true;void loadGenomePacks().then(p=>{if(active)setPacks(old=>({...p,...old}));}).catch(()=>{if(active)setStorageNote('Offline storage is unavailable; reference data will be loaded when needed.');});return()=>{active=false;};},[]);
  const [scope,setScope]=useState<Scope|null>(null),[stage,setStage]=useState<MixedStage|null>(null);
  const [hint,setHint]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [loadingPercent,setLoadingPercent]=useState(0),[loadingChrom,setLoadingChrom]=useState('');
  const [pages,setPages]=useState<Record<string,number>>({});
  const [selected,setSelected]=useState<Scope|null>(null);
  const done=genomeCovered(progress);
  const open=async(s:Scope)=>{
    if(busy)return;
    setBusy(true);setError('');setLoadingPercent(0);setLoadingChrom(s.chrom);
    try{
      let pack=packs[s.chrom];
      if(!pack){
        const response=await fetch(new URL('reference-data/'+s.chrom+'.genome',document.baseURI));
        pack=await openGenomePack(await readGenomeDownload(response,s.chrom,setLoadingPercent));
        if(pack.header.chromosome!==s.chrom)throw Error('Wrong chromosome reference data');
        setPacks(old=>({...old,[s.chrom]:pack!}));
        void storeGenomePack(pack).catch(()=>setStorageNote('Offline storage is unavailable; reference data may need to be loaded again.'));
      }
      setLoadingPercent(100);
      const iv=genomeLevelInterval(CHROMOSOMES[s.chrom]!,s.level);
      const seq=await readGenomeSequence(pack,iv);
      setScope(s);setStage(genomeStage(s.chrom,iv,seq));setSelected(s);setHint(null);
      onPlaying(true);window.scrollTo(0,0);
    }catch(e){setError(String(e));}finally{setBusy(false);}
  };
  const credit=useCallback((state:LabState)=>{
    if(!stage||!scope||!state.won||labExtractedSequence(state)!==stage.sequence)return;
    const next=addGenomeCredit(progress,scope.chrom,[stage.start,stage.end]);if(next!==progress)onProgress(next);
  },[stage,scope,progress,onProgress]);
  const back=()=>{setScope(null);setStage(null);setHint(null);setPages({});onPlaying(false);window.scrollTo(0,0);};
  if(scope&&stage){
    const length=CHROMOSOMES[scope.chrom]!,total=genomeLevelCount(length);
    const iv:Interval=[stage.start,stage.end],remaining=nextGenomeLevel(addGenomeCredit(progress,scope.chrom,iv),scope.chrom);
    const completed=covered(progress[scope.chrom]??[],...iv)===iv[1]-iv[0];
    return <>
      <header className="top play-top" data-testid="play-top">
        <div className="top-collapse" data-testid="bonus-play"><div className="top-collapse-inner">
          <div className="play-heading" data-testid="play-heading">
            <div className="play-title-row"><h1 data-testid="play-title">{scope.chrom}</h1><p className="play-detail" data-testid="play-detail"><span data-testid="play-progress">{scope.level}/{total}</span><span aria-hidden="true"> · </span><span className="play-fullname">HUMAN GENOME</span></p></div>
            <p className="play-locus" data-testid="play-locus">{scope.chrom}:{(iv[0]+1).toLocaleString()}–{iv[1].toLocaleString()} · T2T-CHM13v2.0</p>
          </div>
          <div className="top-buttons"><button type="button" className="map-button" onClick={back} aria-label="Genome map">←</button><button type="button" className="map-button" onClick={onSettings} aria-label="Settings" data-testid="open-settings">⚙</button></div>
        </div></div>
      </header>
      {error&&<p role="alert">{error}</p>}
      <MechanicsPlay feedback={feedback} key={stage.id} id={stage.mechanic} reducedMotion={reducedMotion} hintMode={hint} onHintModeChange={setHint} onBack={back} onNext={()=>undefined}
        bonus={{stage,label:scope.chrom,hasNext:remaining!==null,completed,covered:covered(progress[scope.chrom]??[],0,length),length,onComplete:credit,onNext:()=>{if(remaining!==null)void open({chrom:scope.chrom,level:remaining});else back();}}}/>
    </>;
  }
  const first=Object.keys(CHROMOSOMES).find(c=>nextGenomeLevel(progress,c)!==null);
  const continueChrom=selected&&nextGenomeLevel(progress,selected.chrom)!==null?selected.chrom:first;
  const continueLevel=continueChrom?nextGenomeLevel(progress,continueChrom):null;
  return <section className="map bonus-map" data-testid="bonus-map">
    <div className="row-between"><h2 className="gene">Human Genome</h2><button type="button" onClick={onBack}>Main map</button></div>
    <button type="button" className="primary big continue-button" data-testid="bonus-continue" disabled={busy||continueLevel===null} onClick={()=>{if(continueChrom&&continueLevel!==null)void open({chrom:continueChrom,level:continueLevel});}}>{continueLevel===null?'Human genome complete':`Continue · ${continueChrom} ${continueLevel}/${genomeLevelCount(CHROMOSOMES[continueChrom!]!)}`}</button>
    <div className="panel">
      <p className="muted small">{REFERENCE}</p>
      <p><b>{done.toLocaleString()} / {GENOME_BASES.toLocaleString()} bp assembled</b></p>
      <div className="progress thin" role="progressbar" aria-label="Genome bases assembled" aria-valuemin={0} aria-valuemax={GENOME_BASES} aria-valuenow={done}><i style={{width:100*done/GENOME_BASES+'%'}}/></div>
      {done===GENOME_BASES&&<p className="discovered assembled">Human reference genome assembled!</p>}
    </div>
    {busy&&<p role="status" data-testid="reference-loading">Reading reference data… {loadingPercent}%</p>}{error&&<p role="alert">{error}</p>}{storageNote&&<p className="muted small" role="status">{storageNote}</p>}
    <div className="panel catalogue"><h3 className="gene">Chromosomes</h3>{Object.entries(CHROMOSOMES).map(([c,len])=>{
      const n=covered(progress[c]??[],0,len),total=genomeLevelCount(len),next=nextGenomeLevel(progress,c);
      // The default window starts exactly at the first unfinished puzzle. Relative
      // pages preserve that anchor when going back through completed levels.
      const anchor=next??Math.max(1,total-PAGE+1),firstPage=-Math.ceil((anchor-1)/PAGE),lastPage=Math.floor((total-anchor)/PAGE);
      const page=Math.max(firstPage,Math.min(lastPage,pages[c]??0)),start=Math.max(1,anchor+page*PAGE),end=Math.min(total,anchor+(page+1)*PAGE-1);
      const changePage=(p:number)=>setPages(old=>({...old,[c]:Math.max(firstPage,Math.min(lastPage,p))}));
      return <div className={'cat-gene'+(n===len?' assembled':'')} key={c} data-testid={'chromosome-'+c}>
        <div className="row-between"><b>{c}</b><span className={'cat-state'+(n===len?' ok':'')}>{n===len?'🧬 Assembled':n?'In progress':'New'}</span></div>
        <div className="progress thin" role="progressbar" aria-label={c+' bases assembled'} aria-valuemin={0} aria-valuemax={len} aria-valuenow={n}><i style={{width:100*n/len+'%'}}/></div>
        <div className="row-between muted tiny"><span>{n.toLocaleString()} / {len.toLocaleString()} bp</span><button type="button" className="bonus-assemble" disabled={busy||next===null} onClick={()=>{if(next!==null)void open({chrom:c,level:next});}}>{next===null?'Complete':busy&&loadingChrom===c?`Loading ${loadingPercent}%`:'Assemble'}</button></div>
        <ol className="chapter-nodes bonus-nodes" aria-label={c+' puzzles'} data-testid={'bonus-nodes-'+c}>{Array.from({length:PAGE},(_,i)=>{
          const level=start+i;
          if(level>end)return <li key={'empty-'+i} className="bonus-node-empty" aria-hidden="true"/>;
          const iv=genomeLevelInterval(len,level),amount=covered(progress[c]??[],...iv),complete=amount===iv[1]-iv[0];
          return <li key={level}><button type="button" className={'cnode'+(complete?' done':amount?' started':'')+(level===next?' current':'')} disabled={busy} onClick={()=>{void open({chrom:c,level});}} aria-label={c+' '+level+' of '+total+(complete?', complete':'')} data-testid={'bonus-node-'+c+'-'+level} data-digits={String(level).length}><span className="node-number">{level}</span>{complete&&<span className="node-check" aria-hidden="true">✓</span>}</button></li>;
        })}</ol>
        <div className="row-between bonus-pagination"><button type="button" disabled={page===firstPage||busy} onClick={()=>changePage(page-1)} aria-label={'Previous '+c+' levels'}>‹</button><span className="muted tiny">{start.toLocaleString()}–{end.toLocaleString()} / {total.toLocaleString()}</span><button type="button" disabled={page===lastPage||busy} onClick={()=>changePage(page+1)} aria-label={'Next '+c+' levels'}>›</button></div>
      </div>;
    })}</div>
  </section>;
}
