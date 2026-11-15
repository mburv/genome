import { useCallback, useMemo, useState } from 'react';
import { BONUS_PACK, advanceBonus, bonusCompleted, bonusStageCount, bonusStages, type BonusGene, type BonusProgress } from '../campaign/bonus.ts';
import { MechanicsPlay } from './MechanicsLab.tsx';
import { labExtractedSequence, type LabState } from '../engine/mechanicsLab.ts';

const PAGE=40;
interface Props {
  progress: BonusProgress;
  onProgress: (next: BonusProgress) => void;
  onBack: () => void;
  reducedMotion: boolean;
}
export function BonusScreen({progress,onProgress,onBack,reducedMotion}:Props) {
  const [query,setQuery]=useState('');
  const [chrom,setChrom]=useState('');
  const [page,setPage]=useState(0);
  const [gene,setGene]=useState<BonusGene|null>(null);
  const [part,setPart]=useState(0);
  const [hint,setHint]=useState<boolean|null>(null);
  const [onlyRemaining,setOnlyRemaining]=useState(false);
  const chromosomes=useMemo(()=>[...new Set(BONUS_PACK.genes.map(g=>g[3]))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[]);
  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return BONUS_PACK.genes.filter(g=>(!chrom||g[3]===chrom)&&(!q||g[0].toLowerCase().includes(q)||g[1].toLowerCase().includes(q)||g[2].toLowerCase().includes(q))&&(!onlyRemaining||!bonusCompleted(progress,g)));
  },[query,chrom,onlyRemaining,progress]);
  const done=useMemo(()=>BONUS_PACK.genes.filter(g=>bonusCompleted(progress,g)).length,[progress]);
  const stages=useMemo(()=>gene?bonusStages(gene):[],[gene]);
  const stage=stages[part];
  const credit=useCallback((state:LabState)=>{
    if(!gene||!stage||!state.won||labExtractedSequence(state)!==stage.sequence)return;
    const next=advanceBonus(progress,gene,part+1);
    if(next!==progress)onProgress(next);
  },[gene,stage,part,progress,onProgress]);
  const back=()=>{setGene(null);setHint(null);};
  if(gene&&stage) {
    const [,symbol,biotype,chr,start,end,strand,lo,hi]=gene;
    const first=strand==='+'?lo+stage.start:hi-stage.end+1;
    const last=strand==='+'?lo+stage.end-1:hi-stage.start;
    return <section className="bonus-play" data-testid="bonus-play">
      <div className="row-between"><h2 className="gene">{symbol} <span>· {part+1}/{stages.length}</span></h2><button type="button" onClick={back}>Bonus map</button></div>
      <p className="muted small">{biotype.replaceAll('_',' ')} · {chr}:{start.toLocaleString()}–{end.toLocaleString()} ({strand})</p>
      <p className="muted tiny">{BONUS_PACK.release} · fragment {first.toLocaleString()}–{last.toLocaleString()} · {gene[0]}</p>
      <MechanicsPlay key={stage.id} id={stage.mechanic} reducedMotion={reducedMotion} hintMode={hint} onHintModeChange={setHint}
        onBack={back} onNext={()=>undefined} bonus={{stage,label:symbol,part:part+1,of:stages.length,completed:(progress[gene[0]]??0)>part,
        onComplete:credit,onNext:()=>{if(part+1<stages.length)setPart(part+1);else back();}}}/>
    </section>;
  }
  const lastPage=Math.max(0,Math.ceil(filtered.length/PAGE)-1);
  const current=Math.min(page,lastPage);
  return <section className="map bonus-map" data-testid="bonus-map">
    <div className="row-between"><h2 className="gene">Human Genome <span>· bonus</span></h2><button type="button" onClick={onBack}>Main map</button></div>
    <p className="muted small">Every remaining annotated gene in the pinned reference. Complete its DNA fragment stages to discover the gene. Samples do not constitute full-gene assembly.</p>
    <p className="muted small">{done.toLocaleString()} / {BONUS_PACK.genes.length.toLocaleString()} bonus genes complete · {BONUS_PACK.release}</p>
    {!BONUS_PACK.genes.length ? <p role="status">Reference catalogue not installed. Run the reference preparation step before building GENOME.</p> : <>
      <div className="progress thin" role="progressbar" aria-label="Bonus genes completed" aria-valuemin={0} aria-valuemax={BONUS_PACK.genes.length} aria-valuenow={done}><i style={{width:(100*done/BONUS_PACK.genes.length)+'%'}}/></div>
      <label className="bonus-filter">Find gene <input type="search" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} placeholder="Symbol, Ensembl ID or gene type"/></label>
      <label className="bonus-filter">Chromosome / contig <select value={chrom} onChange={e=>{setChrom(e.target.value);setPage(0);}}><option value="">All</option>{chromosomes.map(c=><option key={c}>{c}</option>)}</select></label>
      <label className="bonus-filter"><input type="checkbox" checked={onlyRemaining} onChange={e=>{setOnlyRemaining(e.target.checked);setPage(0);}}/> Uncompleted genes only</label>
      <p className="muted small">{filtered.length.toLocaleString()} matching genes</p>
      <div className="panel catalogue">
        {filtered.slice(current*PAGE,(current+1)*PAGE).map(g=>{
          const n=bonusStageCount(g),p=progress[g[0]]??0;
          return <div className="cat-gene" key={g[0]}>
            <div className="row-between"><b>{g[1]}</b><span className="muted tiny">{g[3]} · {g[2].replaceAll('_',' ')}</span></div>
            <p className="muted tiny">{g[0]} · {p}/{n} stages{p===n?' · Complete':''}</p>
            <ol className="chapter-nodes">{Array.from({length:n},(_,i)=><li key={i}><button type="button" className={'cnode'+(i<p?' done':'')} disabled={i>p} aria-label={g[1]+' bonus stage '+(i+1)+(i<p?', complete':'')} onClick={()=>{setGene(g);setPart(i);setHint(null);}}><span className="node-number">{i+1}</span>{i<p&&<span className="node-check">✓</span>}</button></li>)}</ol>
          </div>;
        })}
      </div>
      <div className="row-between"><button type="button" disabled={!current} onClick={()=>setPage(current-1)}>Previous</button><span className="muted small">Page {current+1} / {lastPage+1}</span><button type="button" disabled={current>=lastPage} onClick={()=>setPage(current+1)}>Next</button></div>
    </>}
    <p className="muted tiny">Source: <a href="https://www.gencodegenes.org/human/release_48.html">GENCODE release 48</a> · primary assembly, including chromosome and scaffold loci. Reference fragments only; no clinical claims.</p>
  </section>;
}
