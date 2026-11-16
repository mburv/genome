/* eslint-disable react-hooks/set-state-in-effect -- Measuring DOM geometry before paint requires a synchronous layout pass. */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ALL_LEVELS } from '../campaign/campaign.ts';
import { mixedStage, type MixedStage } from '../campaign/mixed.ts';
import { genomeStage } from '../campaign/bonus.ts';
import { GENES } from '../genomics/genes.ts';
import { createLab, LAB_IDS, labDecode, type LabState } from '../engine/mechanicsLab.ts';
import { symbolSequence } from '../engine/tokens.ts';
import type { LevelDefinition } from '../engine/types.ts';
import { MechanicClues, mechanicClueRange } from './MechanicsLab.tsx';
import { TargetPanel, slidingClueRange } from './TargetPanel.tsx';

type Candidate = { shape: string; range: string; panel: ReactNode };
let candidates: Candidate[] | undefined;
const faceLength = (n: number) => Math.min(n, 7); // All long faces have the same two codons and divider.

function mixedCandidate(state: LabState, defId: string, range: string, def?: LevelDefinition): Candidate {
  const {id,spec} = state;
  const lengths = (seq:string) => [...seq].map(b=>faceLength(labDecode(spec,b).length));
  const units = id==='trace' ? lengths(spec.TRACE_TARGET)
    : id==='crush' ? spec.CRUSH_TARGETS.map(lengths)
    : id==='assembly' ? lengths(spec.ASSEMBLY_TARGET)
    : id==='mutation' ? spec.MUTATION_ROWS.map(row=>lengths(row.seq))
    : id==='connections' ? spec.CONNECTION_PAIRS.map(pair=>spec.tokens
        ? [faceLength(labDecode(spec,pair.seq).length), faceLength(labDecode(spec,pair.complement!).length)]
        : [pair.seq.length,pair.seq.length])
    : lengths(spec.CUT_TARGET);
  return {
    shape: JSON.stringify([id,!!spec.tokens,units]),
    range,
    panel: <MechanicClues key={defId} state={state} defId={defId} range={range} def={def} measureOnly/>,
  };
}

function slidingCandidate(def: LevelDefinition, solved: boolean): Candidate {
  const shape = JSON.stringify(['slide',def.mode,def.title,def.tier,!!def.tokens,
    def.tracks.map(track=>[track.group,track.orientation,[...track.expected].map(b=>faceLength(symbolSequence(def,{},b).length))]),
    def.repair?.length,def.repair && faceLength(symbolSequence(def,{},def.repair.expected).length),solved]);
  const matches = def.tracks.map(track=>Array.from(track.expected,()=>solved));
  return {
    shape, range:slidingClueRange(def),
    panel:<TargetPanel key={def.id+(solved?'-solved':'')} def={def} matches={matches} committedMatches={matches} solved={solved} measureOnly/>,
  };
}

function getCandidates(): Candidate[] {
  if(candidates) return candidates;
  const result:Candidate[]=[];
  for(const def of ALL_LEVELS){
    const stage=mixedStage(def);
    if(stage) result.push(mixedCandidate(createLab(stage.mechanic,stage.spec),def.id,mechanicClueRange(stage),def));
    else {
      result.push(slidingCandidate(def,false));
      // Restoring the missing fragment can change the repair chip's natural height.
      if(def.repair) result.push(slidingCandidate(def,true));
    }
  }
  for(const id of LAB_IDS) result.push(mixedCandidate(createLab(id),'lab-'+id,mechanicClueRange()));
  // Extended levels have at most nine pieces: single-base trace, two-/three-base
  // mutation, four-/five-/six-base assembly, or the same long two-codon face.
  // Include the largest layout of each family and a long puzzle with a short tail.
  // A verified coding sequence is used ONLY as a sizing specimen, not as chromosome data.
  const sample=Object.values(GENES).find(g=>g.sequence.length>=864)!.sequence;
  for(const n of [9,18,27,36,45,54,62,63,864]){
    const stage:MixedStage=genomeStage('chrM',[0,n],sample.slice(0,n));
    result.push(mixedCandidate(createLab(stage.mechanic,stage.spec),stage.id,mechanicClueRange(stage,true)));
  }
  candidates=result;
  return result;
}

/** Select the widest real metadata label for each identical clue shape. The
 * labels are measured in the browser's actual responsive font, not by character count. */
function representatives(probe: HTMLDivElement): ReactNode[] {
  const all=getCandidates();
  const ruler=document.createElement('div');
  ruler.className='small';
  ruler.style.cssText='position:absolute;display:flex;flex-direction:column;align-items:flex-start;white-space:nowrap;';
  const labels=all.map(({range})=>{
    const span=document.createElement('span');span.className='muted';span.textContent=range;ruler.appendChild(span);return span;
  });
  probe.appendChild(ruler);
  const chosen=new Map<string,{width:number;panel:ReactNode}>();
  all.forEach((candidate,i)=>{
    const width=labels[i]!.getBoundingClientRect().width;
    const old=chosen.get(candidate.shape);
    if(!old || width>old.width) chosen.set(candidate.shape,{width,panel:candidate.panel});
  });
  ruler.remove();
  return Array.from(chosen.values(),entry=>entry.panel);
}

/** One offscreen measurement per available width, shared across all puzzles.
 * Probe nodes are discarded before paint; no duplicate visible controls, and
 * changing puzzle or committing a move cannot change the reserved height. */
export function ClueSizing({active}:{active:boolean}){
  const probe=useRef<HTMLDivElement>(null);
  const measuredWidth=useRef(0);
  const [panels,setPanels]=useState<ReactNode[]>([]);
  useLayoutEffect(()=>{
    if(!active)return;
    const request=()=>{
      const el=probe.current;if(!el)return;
      const width=el.getBoundingClientRect().width;
      if(width<=0||width===measuredWidth.current)return;
      measuredWidth.current=width;
      setPanels(representatives(el));
    };
    request();
    window.addEventListener('resize',request);
    window.visualViewport?.addEventListener('resize',request);
    return()=>{
      window.removeEventListener('resize',request);
      window.visualViewport?.removeEventListener('resize',request);
    };
  },[active]);
  useLayoutEffect(()=>{
    const el=probe.current;
    if(!el||!panels.length)return;
    let height=0,source='';
    for(const panel of el.querySelectorAll<HTMLElement>(':scope > .target')){
      const h=Math.ceil(Math.max(panel.getBoundingClientRect().height,panel.scrollHeight));
      if(h>height){height=h;source=panel.dataset.clueMeasureId??'';}
    }
    if(height>0){
      el.parentElement?.style.setProperty('--clue-height',height+'px');
      if(el.parentElement)el.parentElement.dataset.clueHeightSource=source;
    }
    setPanels([]);
  },[panels]);
  return <div className="clue-size-probe" ref={probe} aria-hidden="true" inert>{panels}</div>;
}
