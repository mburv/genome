import { useCallback,useEffect,useRef,useState } from 'react';
import { CHROMOSOMES,GENOME_BASES,REFERENCE,addGenomeCredit,covered,genomeCovered,genomeLevelCount,genomeLevelInterval,genomeLevelAt,nextGenomeLevel,genomeStage,type BonusProgress,type Interval } from '../campaign/bonus.ts';
import { openGenomePack,readGenomeDownload,readGenomeSequence,type GenomePack } from '../genomics/genomePack.ts';
import { loadGenomePacks,storeGenomePack } from '../genomics/genomeStorage.ts';
import { bonusClueRange, cdsComplete, cdsLocus, newlyCompletedCds, validateCdsIndex, type CdsGene, type CdsIndex } from '../genomics/bonusAnnotations.ts';
import { BonusGeneCard } from './BonusGeneCard.tsx';
import { BonusCdsCatalogue } from './BonusCdsCatalogue.tsx';
import { MechanicsPlay } from './MechanicsLab.tsx';
import { labExtractedSequence,type LabState } from '../engine/mechanicsLab.ts';
import type { MixedStage } from '../campaign/mixed.ts';
import type { FeedbackOptions } from './feedback.ts';

interface Props{feedback:FeedbackOptions;progress:BonusProgress;legacyGeometry:BonusProgress;legacyAssemblyGeometry:BonusProgress;onProgress:(next:BonusProgress)=>void;onBack:()=>void;onPlaying:(playing:boolean)=>void;onSettings:()=>void;reducedMotion:boolean}
interface Scope{chrom:string;level:number}
const PAGE=11*11;
async function readAnnotations(chrom:string,pack?:GenomePack):Promise<CdsIndex|null>{
  try{
    const response=await fetch(new URL('cds-annotations/'+chrom+'.json',document.baseURI));
    if(!response.ok)return null;
    const raw:unknown=await response.json();
    // The mitochondrion has a separately mapped gene annotation; Liftoff's
    // nuclear CDS sidecar is empty there. Accept that verified empty index
    // even when the downloaded chrM pack uses its own annotation checksum.
    return validateCdsIndex(raw,pack?.header ?? chrom) ??
      (chrom==='chrM' && Array.isArray((raw as CdsIndex)?.genes) &&
        (raw as CdsIndex).genes.length===0 ? validateCdsIndex(raw,chrom) : null);
  }catch{return null;}
}

export function BonusScreen({progress,legacyGeometry,legacyAssemblyGeometry,onProgress,onBack,onPlaying,onSettings,reducedMotion,feedback}:Props){
  const [packs,setPacks]=useState<Record<string,GenomePack>>({});
  const [annotations,setAnnotations]=useState<Record<string,CdsIndex>>({});
  const [milestones,setMilestones]=useState<CdsGene[]>([]);
  const [viewMilestone,setViewMilestone]=useState<number|null>(null);
  const [cardChrom,setCardChrom]=useState('');
  const requestedAnnotations=useRef(new Set<string>());
  const [storageNote,setStorageNote]=useState('');
  useEffect(()=>{let active=true;void loadGenomePacks().then(p=>{if(active)setPacks(old=>({...p,...old}));}).catch(()=>{if(active)setStorageNote('Offline storage is unavailable; reference data will be loaded when needed.');});return()=>{active=false;};},[]);
  const [scope,setScope]=useState<Scope|null>(null),[stage,setStage]=useState<MixedStage|null>(null);
  const [hint,setHint]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [loadingPercent,setLoadingPercent]=useState(0),[loadingChrom,setLoadingChrom]=useState('');
  const [pages,setPages]=useState<Record<string,number>>({});
  const [selected,setSelected]=useState<Scope|null>(null);
  const done=genomeCovered(progress);
  // Load the much smaller CDS catalogue without downloading any chromosome
  // DNA. Users can see named genes before choosing a chromosome to install.
  // When a DNA pack is available the sidecar must match its annotation hash.
  useEffect(()=>{
    for(const chrom of Object.keys(CHROMOSOMES)){
      if(requestedAnnotations.current.has(chrom))continue;
      requestedAnnotations.current.add(chrom);
      void readAnnotations(chrom,packs[chrom]).then(index=>{
        if(index)setAnnotations(old=>({...old,[chrom]:index}));
      });
    }
  },[packs]);
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
      // A newly downloaded pack can be played before the map's prefetch runs.
      const index=annotations[s.chrom] ?? await readAnnotations(s.chrom,pack);
      if(index)setAnnotations(old=>({...old,[s.chrom]:index}));
      setMilestones([]);setViewMilestone(null);
      setScope(s);setStage(genomeStage(s.chrom,iv,seq,covered(legacyGeometry[s.chrom]??[],...iv)===iv[1]-iv[0],covered(legacyAssemblyGeometry[s.chrom]??[],...iv)===iv[1]-iv[0]));setSelected(s);setHint(null);
      onPlaying(true);window.scrollTo(0,0);
    }catch(e){setError(String(e));}finally{setBusy(false);}
  };
  const credit=useCallback((state:LabState)=>{
    if(!stage||!scope||!state.won||labExtractedSequence(state)!==stage.sequence)return;
    const iv:Interval=[stage.start,stage.end];
    const next=addGenomeCredit(progress,scope.chrom,iv);
    if(next!==progress){
      const awarded=newlyCompletedCds(annotations[scope.chrom],progress,next,scope.chrom,iv);
      if(awarded.length)setMilestones(awarded);
      onProgress(next);
    }
  },[stage,scope,progress,onProgress,annotations]);
  const back=()=>{setScope(null);setStage(null);setHint(null);setPages({});setMilestones([]);setViewMilestone(null);onPlaying(false);window.scrollTo(0,0);};
  if(scope&&stage){
    const length=CHROMOSOMES[scope.chrom]!,total=genomeLevelCount(length);
    const iv:Interval=[stage.start,stage.end],remaining=nextGenomeLevel(addGenomeCredit(progress,scope.chrom,iv),scope.chrom);
    const newBases=iv[1]-iv[0]-covered(progress[scope.chrom]??[],...iv);
    const completed=newBases===0;
    const clueRange=bonusClueRange(scope.chrom,iv,stage.spec.blockSize,annotations[scope.chrom]);
    const advance=()=>{setViewMilestone(null);if(remaining!==null)void open({chrom:scope.chrom,level:remaining});else back();};
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
        bonus={{stage,label:scope.chrom,part:scope.level,of:total,hasNext:remaining!==null,completed,newBases,covered:covered(progress[scope.chrom]??[],0,length),length,clueRange,geneCardAvailable:milestones.length>0,onCard:()=>setViewMilestone(0),onComplete:credit,onNext:advance}}/>
      {viewMilestone!==null&&milestones[viewMilestone]&&
        <BonusGeneCard gene={milestones[viewMilestone]} chromosome={scope.chrom} onMap={back}
          hasNextGene={viewMilestone+1<milestones.length}
          onContinue={()=>{if(viewMilestone+1<milestones.length)setViewMilestone(viewMilestone+1);else advance();}}/>}
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
    <BonusCdsCatalogue annotations={annotations} availableChromosomes={new Set(Object.keys(packs))} progress={progress} busy={busy}
      onPlay={(chrom,level)=>{void open({chrom,level});}}
      onCard={(chrom,gene)=>{setMilestones([gene]);setCardChrom(chrom);setViewMilestone(0);}} />
    <div className="panel catalogue" data-testid="bonus-coordinate-map"><h3 className="gene">Chromosome coordinates</h3>{Object.entries(CHROMOSOMES).map(([c,len])=>{
      const n=covered(progress[c]??[],0,len),total=genomeLevelCount(len),next=nextGenomeLevel(progress,c),available=!!packs[c];
      const cds=annotations[c];
      // The default window starts exactly at the first unfinished puzzle. Relative
      // pages preserve that anchor when going back through completed levels.
      const anchor=next??Math.max(1,total-PAGE+1),firstPage=-Math.ceil((anchor-1)/PAGE),lastPage=Math.floor((total-anchor)/PAGE);
      const page=Math.max(firstPage,Math.min(lastPage,pages[c]??0)),start=Math.max(1,anchor+page*PAGE),end=Math.min(total,anchor+(page+1)*PAGE-1);
      const changePage=(p:number)=>setPages(old=>({...old,[c]:Math.max(firstPage,Math.min(lastPage,p))}));
      const regionStart=genomeLevelInterval(len,start)[0],regionEnd=genomeLevelInterval(len,end)[1];
      const visibleGenes=(cds?.genes??[]).filter(g=>g[3]<regionEnd&&g[4]>regionStart);
      const geneRegions=(packs[c]?.header.genes??[]).filter(g=>g[3]<regionEnd&&g[4]>regionStart);
      return <div className={'cat-gene'+(n===len?' assembled':'')} key={c} data-testid={'chromosome-'+c}>
        <div className="row-between"><b>{c}</b><span className={'cat-state'+(n===len?' ok':'')}>{n===len?'🧬 Assembled':n?'In progress':'New'}</span></div>
        <div className="progress thin" role="progressbar" aria-label={c+' bases assembled'} aria-valuemin={0} aria-valuemax={len} aria-valuenow={n}><i style={{width:100*n/len+'%'}}/></div>
        <div className="row-between muted tiny"><span>{n.toLocaleString()} / {len.toLocaleString()} bp</span><button type="button" className="bonus-assemble" disabled={busy||(available&&next===null)} onClick={()=>{void open({chrom:c,level:next??1});}}>{busy&&loadingChrom===c?`Loading ${loadingPercent}%`:next===null?(available?'Complete':'Download'):'Assemble'}</button></div>
        <ol className={'chapter-nodes bonus-nodes'+(available?'':' unavailable')} aria-label={c+' puzzles'+(available?'':' · download required')} data-testid={'bonus-nodes-'+c}>{Array.from({length:PAGE},(_,i)=>{
          const level=start+i;
          if(level>end)return <li key={'empty-'+i} className="bonus-node-empty" aria-hidden="true"/>;
          const iv=genomeLevelInterval(len,level),amount=covered(progress[c]??[],...iv),complete=amount===iv[1]-iv[0];
          const locus=cdsLocus(cds,c,iv);
          const coding=visibleGenes.find(g=>g[7].some(([a,b])=>a<iv[1]&&b>iv[0]));
          const geneRegion=geneRegions.find(g=>g[3]<iv[1]&&g[4]>iv[0]);
          const regionNote=locus?locus.gene[1]+' CDS '+locus.first+'–'+locus.last:
            coding?coding[1]+' coding exon overlaps this level':
            geneRegion?geneRegion[1]+' gene region':'chromosome sequence';
          return <li key={level}><button type="button" className={'cnode'+(complete?' done':amount?' started':'')+(level===next?' current':'')+(locus?' bonus-cds-node':coding?' bonus-cds-overlap':geneRegion?' bonus-gene-region':'')} disabled={busy||!available} onClick={()=>{void open({chrom:c,level});}} aria-label={c+' '+level+' of '+total+', '+regionNote+(complete?', complete':'')} title={c+':'+(iv[0]+1).toLocaleString()+'–'+iv[1].toLocaleString()+' · '+regionNote} data-testid={'bonus-node-'+c+'-'+level} data-digits={String(level).length}><span className="node-number">{level}</span>{complete&&<span className="node-check" aria-hidden="true">✓</span>}</button></li>;
        })}</ol>
        <div className="row-between bonus-pagination"><button type="button" disabled={page===firstPage||busy} onClick={()=>changePage(page-1)} aria-label={'Previous '+c+' levels'}>‹</button><span className="muted tiny">{start.toLocaleString()}–{end.toLocaleString()} / {total.toLocaleString()}</span><button type="button" disabled={page===lastPage||busy} onClick={()=>changePage(page+1)} aria-label={'Next '+c+' levels'}>›</button></div>
        {available&&<div className="bonus-annotation" data-testid={'bonus-annotation-'+c}>
          <span className="muted tiny">{c}:{(regionStart+1).toLocaleString()}–{regionEnd.toLocaleString()}</span>
          <span className="muted tiny">{cds?'CDS = inside a coding exon · other tiles use chromosome coordinates':'Gene annotations load with the reference index'}</span>
          {visibleGenes.length>0&&<div className="bonus-gene-landmarks" data-testid={'bonus-gene-landmarks-'+c}>
            {visibleGenes.slice(0,5).map(g=>{
              const complete=cdsComplete(g,progress,c),first=genomeLevelAt(g[3]);
              return <div className="bonus-gene-landmark" key={g[0]}>
                <button type="button" className={complete?'bonus-gene-done':''} onClick={()=>changePage(Math.floor((first-anchor)/PAGE))} title={'Jump to '+g[1]+' at '+c+':'+(g[3]+1).toLocaleString()}>
                  {g[1]}{complete?' ✓':''}
                </button>
                {complete&&<button type="button" className="bonus-gene-view" onClick={()=>{setMilestones([g]);setCardChrom(c);setViewMilestone(0);}} aria-label={'View '+g[1]+' gene card'}>Card</button>}
              </div>;
            })}
          </div>}
        </div>}
      </div>;
    })}</div>
    {viewMilestone!==null&&milestones[viewMilestone]&&
      <BonusGeneCard gene={milestones[viewMilestone]} chromosome={cardChrom}
        onMap={()=>{setViewMilestone(null);setMilestones([]);}}
        hasNextGene={viewMilestone+1<milestones.length}
        onContinue={()=>{if(viewMilestone+1<milestones.length)setViewMilestone(viewMilestone+1);else{setViewMilestone(null);setMilestones([]);}}}/>}
  </section>;
}
