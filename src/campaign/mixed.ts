import { GENES } from '../genomics/genes.ts';
import { DEFAULT_LAB_SPEC, createLab, applyLab, labExtractedSequence, mutationExpected, reverseComplement, type LabSpec, type LabId, type LabAction, type LabState } from '../engine/mechanicsLab.ts';
import { blockStage } from './blockMixed.ts';
import { variedStage } from './varied.ts';
import type { LevelDefinition } from '../engine/types.ts';

export type Mechanic = LabId | 'slide';
/** Keep the old 'slide' acknowledgement for Sequencing; the other three guides are independent. */
export const SLIDE_TUTORIALS = ['slide', 'slide-splice', 'slide-replicate', 'slide-repair'] as const;
export type SlideTutorial = typeof SLIDE_TUTORIALS[number];
export type TutorialId = LabId | SlideTutorial;
export const isSlidingTutorial = (id: TutorialId): id is SlideTutorial => (SLIDE_TUTORIALS as readonly string[]).includes(id);
export const slidingTutorial = (mode: LevelDefinition['mode']): SlideTutorial => ({
  sequence: 'slide', splice: 'slide-splice', replicate: 'slide-replicate', repair: 'slide-repair',
} as const)[mode];
/** Reuse existing stage ids and exact CDS intervals. Original sliding boards remain valid legacy alternatives. */
const MECHANICS: Record<string, LabId> = {
  'ins-02': 'trace', 'ins-03': 'connections', 'ins-04': 'assembly', 'ins-05': 'crush', 'ins-06': 'mutation',
  'ins-c01': 'trace', 'ins-c02': 'crush', 'ins-c03': 'mutation', 'ins-c06': 'trace', 'ins-c07': 'restriction',
};
export function mechanicOf(def:LevelDefinition):Mechanic {
  if(def.lab)return 'slide';
  if(!def.tier) {
    if(MECHANICS[def.id])return MECHANICS[def.id]!;
    if(def.id.endsWith('-i02')||def.id==='hbb-02')return 'trace';
    if(def.id.endsWith('-i03')||def.id==='hbb-04')return 'assembly';
    if(def.id==='hbb-03')return 'connections';
    if(def.id==='hbb-06')return 'mutation';
    return 'slide';
  }
  if(def.symbol==='INS')return ({'ins-c01':'trace','ins-c02':'crush','ins-c03':'mutation','ins-c06':'trace','ins-c07':'restriction'} as Record<string,LabId>)[def.id]??'slide';
  if(def.id==='hbb-c03')return 'slide';
  const part=Number(/-c(\d+)$/.exec(def.id)?.[1]??1);
  const order:Mechanic[]=['trace','crush','mutation','assembly','connections','restriction','slide','slide','trace','crush','mutation','connections','restriction','slide'];
  const wanted=order[(part-1)%order.length]!;
  const n=Math.ceil((def.sourceIntervals[0]!.end-def.sourceIntervals[0]!.start)/def.tier);
  if(wanted==='crush'&&(n%3!==0||n>12))return 'trace';
  if(wanted==='assembly'&&n>9)return 'trace';
  return wanted;
}
export interface MixedStage { id: string; symbol:string; mechanic: LabId; start: number; end: number; sequence: string; spec: LabSpec; certificate: LabAction[] }
const snake = (n: number, startRow = 0): number[] => Array.from({ length: n }, (_, i) => {
  const row = Math.floor(i / 9) + startRow, col = i % 9;
  return row * 9 + (row % 2 ? 8 - col : col);
});
export function mixedStage(def: LevelDefinition, legacyLayout = false, legacyAssembly = false): MixedStage | null {
  const mechanic = mechanicOf(def);
  if (mechanic === 'slide') return null;
  const start = def.sourceIntervals[0]!.start, end = def.sourceIntervals.at(-1)!.end;
  const sequence = GENES[def.symbol]!.sequence.slice(start,end);
  if(def.tier)return blockStage(def,mechanic,start,end,sequence,legacyLayout,legacyAssembly);
  const spec: LabSpec = { ...DEFAULT_LAB_SPEC };
  let certificate: LabAction[];
  if (mechanic === 'trace') {
    spec.TRACE_TARGET = sequence;
    spec.TRACE_PATH = sequence.length === 9 ? DEFAULT_LAB_SPEC.TRACE_PATH : snake(sequence.length, sequence.length === 27 ? 1 : 0);
    spec.traceHoles = sequence.length === 9 ? [0,8,18,28,52,72,79,80] : sequence.length === 27 ? [0,4,8,37,44,54,63,71,80] : [55,62,65,70,72,78,80];
    certificate = spec.TRACE_PATH.slice(2).map(cell => ({ type: 'trace', cell }));
  } else if (mechanic === 'connections') {
    spec.CONNECTION_PAIRS = DEFAULT_LAB_SPEC.CONNECTION_PAIRS.map((p, i) => ({ ...p, seq: sequence.slice(i*2,i*2+2) }));
    spec.connectionHoles = [...DEFAULT_LAB_SPEC.connectionHoles, 81-6].filter(c => !spec.CONNECTION_ROUTES.some(p => p.includes(c)));
    certificate = spec.CONNECTION_ROUTES.flatMap((route, pair) => route.map(cell => ({ type: 'route', pair, cell })));
  } else if (mechanic === 'assembly') {
    spec.ASSEMBLY_TARGET = sequence;
    spec.READS = spec.READ_STARTS.map(offset => sequence.slice(offset, offset + 5));
    certificate = spec.READ_STARTS.map((offset, read) => ({ type: 'place', read, offset }));
  } else if (mechanic === 'crush') {
    spec.CRUSH_TARGETS = sequence.match(/.{3}/g)!;
    spec.crushHoles = [...DEFAULT_LAB_SPEC.crushHoles, 54];
    // The later chapter uses its original 36-base interval, with a verified seed.
    if (def.id === 'ins-c02') spec.crushSeed=4;
    const solution = def.id === 'ins-c02' ? [[12,13],[66,67],[7,16],[4,5],[9,10],[2,3]] : [[12,13],[66,67]];
    certificate = solution.map(([a,b]) => ({type:'swap',a:a!,b:b!}));
  } else if (mechanic === 'mutation') {
    const width = sequence.length / 3;
    spec.MUTATION_ROWS = [1,4,7].map((r,i) => ({ top:r*9+1, bottom:(r+1)*9+1, seq:sequence.slice(i*width,(i+1)*width) }));
    spec.MUTATIONS = spec.MUTATION_ROWS.flatMap((r,i) => i===1 ? [r.bottom+1] : [r.bottom, r.bottom+width-1]);
    certificate = spec.MUTATIONS.map(cell => ({ type:'edit',cell,base:mutationExpected(cell,spec)! }));
  } else {
    // BsaI top-strand digest: 5' GGTCTC N| ... |NNNNN GAGACC 3'.
    // Adapter flanks are synthetic, not human sequence; only the exact central INS CDS counts.
    const left = 'GGTCTCA', right = 'AAAAAGAGACC';
    const strand = snake(left.length + sequence.length + right.length);
    const decoy = [72,73,74,75,76,77,78,79,80];
    spec.enzyme = 'BsaI';
    spec.CUT_STRANDS = [strand,decoy];
    spec.CUT_SEQUENCES = [left+sequence+right,'GGTCTCAAC'];
    spec.CUT_TARGET = sequence;
    spec.CUT_SOLUTION = [strand[left.length-1]!,strand[left.length+sequence.length-1]!];
    spec.CUT_SITES = [...spec.CUT_SOLUTION,decoy[6]!];
    certificate = spec.CUT_SOLUTION.map(cell => ({ type:'cut',cell }));
  }
  const stage = { id:def.id,symbol:def.symbol, mechanic, start,end,sequence,spec,certificate };
  return legacyLayout ? stage : variedStage(def,stage,legacyAssembly);
}
export function replayMixed(stage: MixedStage, actions: readonly LabAction[], seedTrace = true): LabState {
  return actions.reduce((state, action) => applyLab(state, action).state, createLab(stage.mechanic, stage.spec, seedTrace));
}
export function verifiedMixed(stage: MixedStage, state: LabState): boolean {
  return state.id === stage.mechanic && labExtractedSequence(state) === stage.sequence && stage.sequence === GENES[stage.symbol]!.sequence.slice(stage.start,stage.end);
}
export function mixedPairLabel(seq: string): string { return seq + ' ↔ ' + reverseComplement(seq); }
