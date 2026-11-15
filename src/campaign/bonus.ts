import raw from '../genomics/bonus.generated.json' with { type: 'json' };
import { CAMPAIGN_LEVELS } from './campaign.ts';
import { blockStage } from './blockMixed.ts';
import type { MixedStage } from './mixed.ts';
import { DEFAULT_LAB_SPEC, applyLab, createLab, labExtractedSequence } from '../engine/mechanicsLab.ts';

/** One annotated gene locus, with an exact strand-oriented genomic sample.
 * This is NOT a CDS, full gene, or personal genome. Coordinates are 1-based inclusive. */
export type BonusGene = readonly [
  id: string, symbol: string, biotype: string, chromosome: string,
  geneStart: number, geneEnd: number, strand: '+' | '-',
  sampleStart: number, sampleEnd: number, sequence: string
];
export interface BonusPack {
  release: string; annotationUrl: string; referenceUrl: string;
  annotationSha256: string; referenceSha256: string;
  totalGenes: number; mainGenes: number; genes: BonusGene[];
}
export const BONUS_PACK = raw as unknown as BonusPack;
export type BonusProgress = Record<string, number>;
export const bonusUnlocked = (completed: readonly string[]): boolean => {
  const done = new Set(completed);
  return CAMPAIGN_LEVELS.every(l => done.has(l.id));
};

/** A short gene can have fewer stages. All others progress from single bases to
 * 3-base mutation correction and 6-base assembly. Intervals partition the sample. */
export function bonusStages(gene: BonusGene): MixedStage[] {
  const [id, symbol, , , , , , , , sequence] = gene;
  const n = sequence.length;
  const a = n < 18 ? n : 9;
  const b = n-a < 45 ? n : a+27;
  const trace = sequence.slice(0,a);
  const path = Array.from({length:a}, (_,i) => {
    const row = 1 + Math.floor(i/9);
    return row*9 + (row%2 ? 8-i%9 : i%9);
  });
  const spec = {...DEFAULT_LAB_SPEC, TRACE_TARGET:trace, TRACE_PATH:path,
    traceHoles: [0,8,27,44,53,72,80].filter(c=>!path.includes(c))};
  const out: MixedStage[] = [{id:id+'-b1',symbol,mechanic:'trace',start:0,end:a,sequence:trace,spec,
    certificate:path.slice(Math.min(2,a-1)).map(cell=>({type:'trace',cell}))}];
  if (b>a) out.push(blockStage({id:id+'-b2',symbol,tier:3,index:0},'mutation',a,b,sequence.slice(a,b)));
  if (n>b) out.push(blockStage({id:id+'-b3',symbol,tier:6,index:0},'assembly',b,n,sequence.slice(b)));
  return out;
}
export function bonusVerified(stage: MixedStage): boolean {
  const state=stage.certificate.reduce((s,a)=>applyLab(s,a).state,createLab(stage.mechanic,stage.spec));
  return state.won && labExtractedSequence(state)===stage.sequence;
}
export function bonusStageCount(gene: BonusGene): number {
  const n=gene[9].length;
  return n<18 ? 1 : n<54 ? 2 : 3;
}
export function bonusCompleted(progress: BonusProgress, gene: BonusGene): boolean {
  return (progress[gene[0]]??0)>=bonusStageCount(gene);
}
/** Completion is monotonic and sequential. Replays never add duplicate credit. */
export function advanceBonus(progress: BonusProgress, gene: BonusGene, part: number): BonusProgress {
  const prior=progress[gene[0]]??0;
  if(part!==prior+1 || part>bonusStageCount(gene))return progress;
  return {...progress,[gene[0]]:part};
}
