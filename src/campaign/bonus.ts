import { CAMPAIGN_LEVELS } from './campaign.ts';
import { blockStage } from './blockMixed.ts';
import { DEFAULT_LAB_SPEC, applyLab, createLab, labExtractedSequence } from '../engine/mechanicsLab.ts';
import type { MixedStage } from './mixed.ts';

export const REFERENCE='T2T-CHM13v2.0+Y / GCA_009914755.4';
export const REFERENCE_URL='https://github.com/marbl/CHM13';
export const CHROMOSOMES: Readonly<Record<string,number>>={
  chr1:248387328,chr2:242696752,chr3:201105948,chr4:193574945,chr5:182045439,
  chr6:172126628,chr7:160567428,chr8:146259331,chr9:150617247,chr10:134758134,
  chr11:135127769,chr12:133324548,chr13:113566686,chr14:101161492,chr15:99753195,
  chr16:96330374,chr17:84276897,chr18:80542538,chr19:61707364,chr20:66210255,
  chr21:45090682,chr22:51324926,chrX:154259566,chrY:62460029,chrM:16569
};
export const GENOME_BASES=Object.values(CHROMOSOMES).reduce((a,b)=>a+b,0);
export const CHUNK_BASES=884736; // divisible by 4; ~216 KiB packed
export type Interval=readonly [start:number,end:number]; // zero-based, half-open
export type BonusProgress=Record<string,Interval[]>;
export type GenomeGene=readonly [id:string,symbol:string,biotype:string,start:number,end:number,strand:string];
export interface GenomeHeader {
  format:'GENOME-T2T-1'; reference:string; chromosome:string; length:number;
  annotation:string; annotationSha256:string; sourceMd5:string; chunkBases:number;
  genes:GenomeGene[]; chunkSha256:string[];
}
export const bonusUnlocked=(completed:readonly string[]):boolean=>{
  const done=new Set(completed);return CAMPAIGN_LEVELS.every(l=>done.has(l.id));
};
export function mergeCoverage(intervals:readonly Interval[],add:Interval):Interval[]{
  const out:Interval[]=[];let [a,b]=add;
  for(const [x,y] of intervals){
    if(y<a)out.push([x,y]);
    else if(x>b){out.push([a,b]);[a,b]=[x,y];}
    else{a=Math.min(a,x);b=Math.max(b,y);}
  }
  out.push([a,b]);return out;
}
export function covered(intervals:readonly Interval[],start:number,end:number):number{
  let n=0;for(const [a,b] of intervals){if(a>=end)break;n+=Math.max(0,Math.min(b,end)-Math.max(a,start));}return n;
}
export function genomeCovered(p:BonusProgress):number{
  return Object.entries(CHROMOSOMES).reduce((n,[c,len])=>n+covered(p[c]??[],0,len),0);
}
export function nextInterval(intervals:readonly Interval[],start:number,end:number):Interval|null{
  let at=start;
  for(const [a,b] of intervals){if(b<=at)continue;if(a>at)return [at,Math.min(end,a)];at=Math.max(at,b);if(at>=end)return null;}
  return at<end?[at,end]:null;
}
/** Intro ramp resets for every gene/selected scope; later boards have at most nine 96-base pieces.
 * The next interval may be clipped by already solved overlapping loci; no duplicated credit. */
export function nextPuzzle(p:BonusProgress,chrom:string,start:number,end:number):Interval|null{
  const gap=nextInterval(p[chrom]??[],start,end);if(!gap)return null;
  const n=gap[0]-start;
  const limit=n<9?9-n:n<36?36-n:n<90?90-n:864;
  return [gap[0],Math.min(gap[1],gap[0]+limit)];
}
export function addGenomeCredit(p:BonusProgress,chrom:string,iv:Interval):BonusProgress{
  const len=CHROMOSOMES[chrom];
  if(!len||!Number.isInteger(iv[0])||!Number.isInteger(iv[1])||iv[0]<0||iv[1]>len||iv[0]>=iv[1])return p;
  if(covered(p[chrom]??[],iv[0],iv[1])===iv[1]-iv[0])return p;
  return {...p,[chrom]:mergeCoverage(p[chrom]??[],iv)};
}
export function readGenomeProgress(value:unknown):BonusProgress{
  const out:BonusProgress={};if(!value||typeof value!=='object')return out;
  for(const [c,rs] of Object.entries(value)){
    const len=CHROMOSOMES[c];if(!len||!Array.isArray(rs))continue;
    const valid=rs.filter((v):v is Interval=>Array.isArray(v)&&v.length===2&&v.every(Number.isInteger)&&v[0]>=0&&v[1]<=len&&v[0]<v[1]).sort((a,b)=>a[0]-b[0]);
    let merged:Interval[]=[];for(const r of valid)merged=mergeCoverage(merged,r);if(merged.length)out[c]=merged;
  }return out;
}
/** Puzzles use the exact forward reference strand. DNA is never randomly generated except filler. */
export function genomeStage(chrom:string,iv:Interval,sequence:string):MixedStage{
  const [start,end]=iv;if(sequence.length!==end-start||!/^[ACGT]{1,864}$/.test(sequence))throw Error('Invalid reference interval');
  const id='t2t-'+chrom+'-'+start+'-'+end,symbol=chrom;
  const k=Math.ceil(sequence.length/9);
  if(sequence.length>9){
    const mechanic=sequence.length<=27?'mutation':'assembly';
    return blockStage({id,symbol,tier:k,index:start},mechanic,start,end,sequence);
  }
  const path=Array.from({length:sequence.length},(_,i)=>17-i);
  const spec={...DEFAULT_LAB_SPEC,TRACE_TARGET:sequence,TRACE_PATH:path,traceHoles:[0,8,27,44,53,72,80]};
  return {id,symbol,mechanic:'trace',start,end,sequence,spec,certificate:path.slice(Math.min(2,path.length-1)).map(cell=>({type:'trace',cell}))};
}
export function bonusVerified(stage:MixedStage):boolean{
  const state=stage.certificate.reduce((s,a)=>applyLab(s,a).state,createLab(stage.mechanic,stage.spec));
  return state.won&&labExtractedSequence(state)===stage.sequence;
}
