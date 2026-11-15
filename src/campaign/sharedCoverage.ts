import {FAMOUS_REFERENCE} from '../genomics/sharedReference.ts';
import {ALL_LEVELS,LEGACY_LEVELS} from './campaign.ts';
import {GENES,LEGACY_GENES} from '../genomics/genes.ts';
import {addGenomeCredit,covered,type BonusProgress,type Interval} from './bonus.ts';
import type {LevelDefinition} from '../engine/types.ts';

/** Map spliced, strand-oriented CDS offsets into exact forward-reference genomic intervals. */
export function codingCoordinates(symbol:string,start:number,end:number):Interval[]{
  const g=FAMOUS_REFERENCE[symbol];if(!g||start<0||end>g.sequence.length||start>=end)throw Error('Invalid CDS interval '+symbol);
  const out:Interval[]=[];let offset=0;
  for(const [a,b] of g.intervals){
    const lo=Math.max(start,offset),hi=Math.min(end,offset+b-a);
    if(lo<hi)out.push(g.strand==='+'?[a+lo-offset,a+hi-offset]:[b-(hi-offset),b-(lo-offset)]);
    offset+=b-a;
  }
  if(out.reduce((n,[a,b])=>n+b-a,0)!==end-start)throw Error('Incomplete CDS mapping '+symbol);
  return out;
}
export function creditFamousLevel(p:BonusProgress,def:LevelDefinition):BonusProgress{
  if(def.lab)return p;
  const g=FAMOUS_REFERENCE[def.symbol];if(!g)return p;
  for(const iv of def.sourceIntervals)for(const coord of codingCoordinates(def.symbol,iv.start,iv.end))p=addGenomeCredit(p,g.chromosome,coord);
  return p;
}
export function creditFamousCompleted(p:BonusProgress,ids:readonly string[]):BonusProgress{
  const done=new Set(ids);for(const def of ALL_LEVELS)if(done.has(def.id))p=creditFamousLevel(p,def);return p;
}
export function referenceLevelCovered(p:BonusProgress,def:LevelDefinition):boolean{
  const g=FAMOUS_REFERENCE[def.symbol];return !!g&&!def.lab&&def.sourceIntervals.every(iv=>codingCoordinates(def.symbol,iv.start,iv.end).every(([a,b])=>covered(p[g.chromosome]??[],a,b)===b-a));
}
export function legacyLevelExact(id:string):boolean{
  const old=LEGACY_LEVELS.find(l=>l.id===id),next=ALL_LEVELS.find(l=>l.id===id);
  if(!old||!next)return false;if(old.lab)return true;
  const oldSeq=LEGACY_GENES[old.symbol]!.sequence,newSeq=GENES[next.symbol]!.sequence;
  return old.symbol===next.symbol&&JSON.stringify(old.sourceIntervals)===JSON.stringify(next.sourceIntervals)&&old.sourceIntervals.every(iv=>oldSeq.slice(iv.start,iv.end)===newSeq.slice(iv.start,iv.end));
}
