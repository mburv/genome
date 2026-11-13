import type { LevelSpec, TrackLayout } from '../generator/level.ts';
import type { LevelMode } from '../engine/types.ts';

/**
 * M4 full-CDS assembly chapters. Each gene's CDS is partitioned into ordered, non-overlapping
 * intervals that tile [0, cdsLength) exactly; each interval becomes one puzzle whose tiles carry
 * pieces of `k` bases (k = 3 codon tiles → 6 → 12 → 24 for long genes). The 9×9 board, segment
 * rotation and win rule are unchanged; only the token size grows. Pure and deterministic.
 */
export const TOKEN_GENERATOR_VERSION = 'm4-tok-1';
export const MIN_CHAPTER = 6;
export const MAX_CHAPTER = 10;

interface Shape {
  mode: LevelMode;
  cells: number;
  layout: TrackLayout;
  scrambleDrags: number;
  minDrags: number;
  minWrongCells: number;
}

const H = 'horizontal' as const;
const V = 'vertical' as const;
/** Ten puzzle shapes in chapter order (cells = tiles in the target, incl. the repair gap). */
const SHAPES: readonly Shape[] = [
  { mode: 'sequence', cells: 9, layout: { kind: 'sequence', orientation: H }, scrambleDrags: 2, minDrags: 2, minWrongCells: 3 },
  { mode: 'splice', cells: 12, layout: { kind: 'splice', parts: [{ length: 6, orientation: H }, { length: 6, orientation: V }] }, scrambleDrags: 3, minDrags: 2, minWrongCells: 4 },
  { mode: 'replicate', cells: 6, layout: { kind: 'replicate', orientation: H }, scrambleDrags: 3, minDrags: 2, minWrongCells: 4 },
  { mode: 'repair', cells: 9, layout: { kind: 'repair', orientation: V, gapIndex: 4 }, scrambleDrags: 3, minDrags: 3, minWrongCells: 4 },
  { mode: 'sequence', cells: 9, layout: { kind: 'sequence', orientation: V }, scrambleDrags: 4, minDrags: 3, minWrongCells: 5 },
  { mode: 'splice', cells: 9, layout: { kind: 'splice', parts: [{ length: 3, orientation: H }, { length: 3, orientation: V }, { length: 3, orientation: H }] }, scrambleDrags: 4, minDrags: 3, minWrongCells: 5 },
  { mode: 'replicate', cells: 6, layout: { kind: 'replicate', orientation: V }, scrambleDrags: 4, minDrags: 3, minWrongCells: 5 },
  { mode: 'splice', cells: 8, layout: { kind: 'splice', parts: [{ length: 4, orientation: H }, { length: 4, orientation: V }] }, scrambleDrags: 4, minDrags: 3, minWrongCells: 5 },
  { mode: 'sequence', cells: 8, layout: { kind: 'sequence', orientation: H }, scrambleDrags: 4, minDrags: 3, minWrongCells: 5 },
  { mode: 'splice', cells: 9, layout: { kind: 'splice', parts: [{ length: 5, orientation: V }, { length: 4, orientation: H }] }, scrambleDrags: 4, minDrags: 3, minWrongCells: 5 },
];

/** Token sizes per shape. Tier A suits CDS ≤ 579 bp, tier B ≤ 1,131 bp. */
export const TIERS: readonly (readonly number[])[] = [
  [3, 3, 3, 6, 6, 6, 6, 12, 12, 12],
  [3, 6, 6, 12, 12, 12, 12, 24, 24, 24],
];

export const tierCapacity = (ks: readonly number[]): number => ks.reduce((n, k, i) => n + k * SHAPES[i]!.cells, 0);
export const MAX_ASSEMBLY_CDS = Math.max(...TIERS.map(tierCapacity));

const base = { edgeBite: 0, cornerCut: 0, cavity: 0, channel: 0, island: 0, diagonal: 0, branch: 0 };
const MASKS: readonly LevelSpec['mask'][] = [
  { minActive: 62, maxActive: 74, maxDeadEnds: 3, operations: 6, weights: { ...base, edgeBite: 3, cornerCut: 2, cavity: 1 } },
  { minActive: 58, maxActive: 72, maxDeadEnds: 3, operations: 8, weights: { ...base, cavity: 3, edgeBite: 1, channel: 1, island: 1 } },
  { minActive: 58, maxActive: 70, maxDeadEnds: 3, operations: 8, weights: { ...base, cornerCut: 2, diagonal: 2, cavity: 1, edgeBite: 1 } },
  { minActive: 56, maxActive: 70, maxDeadEnds: 4, operations: 9, weights: { ...base, branch: 2, cavity: 2, edgeBite: 2 } },
  { minActive: 54, maxActive: 68, maxDeadEnds: 4, operations: 10, weights: { ...base, channel: 3, branch: 2, cornerCut: 1 } },
  { minActive: 56, maxActive: 68, maxDeadEnds: 4, operations: 10, weights: { ...base, island: 2, cavity: 2, diagonal: 1, edgeBite: 1 } },
  { minActive: 56, maxActive: 68, maxDeadEnds: 4, operations: 10, weights: { ...base, edgeBite: 2, cornerCut: 2, channel: 2 } },
];

const MODE_NAME: Record<LevelMode, string> = { sequence: 'sequencing', splice: 'splicing', replicate: 'replication', repair: 'repair' };
export const tierName = (k: number): string => (k === 3 ? 'Codons' : k === 6 ? 'Hexamers' : `${k}-base pieces`);

export interface ChapterGene {
  symbol: string;
  cdsLength: number;
}

export interface PlannedPuzzle {
  start: number;
  end: number;
  k: number;
  shape: Shape;
  final: boolean;
  cells: number;
}

/** Partition a CDS into chapter puzzles (pure). Throws if the CDS is outside the chapter policy. */
export function planChapter(cdsLength: number): PlannedPuzzle[] {
  if (cdsLength % 3 !== 0 || cdsLength < 9 * 3 * MIN_CHAPTER) throw new Error(`CDS length ${cdsLength} outside chapter policy`);
  const ks = TIERS.find((t) => tierCapacity(t) >= cdsLength);
  if (!ks) throw new Error(`CDS ${cdsLength} bp exceeds the largest tier (${MAX_ASSEMBLY_CDS} bp)`);
  const out: PlannedPuzzle[] = [];
  let pos = 0;
  for (let i = 0; i < SHAPES.length && pos < cdsLength; i++) {
    const shape = SHAPES[i]!;
    let k = ks[i]!;
    const cap = k * shape.cells;
    const r = cdsLength - pos;
    if (r - cap >= 9) {
      out.push({ start: pos, end: pos + cap, k, shape, final: false, cells: shape.cells });
      pos += cap;
      continue;
    }
    // Final puzzle: take everything left (the last piece may be shorter than k).
    let cells = Math.ceil(r / k);
    while (cells < 3 && k > 3) { k -= 3; cells = Math.ceil(r / k); }
    const layout: TrackLayout = cells <= 9
      ? { kind: 'sequence', orientation: H }
      : { kind: 'splice', parts: [{ length: Math.ceil(cells / 2), orientation: H }, { length: Math.floor(cells / 2), orientation: V }] };
    out.push({ start: pos, end: cdsLength, k, shape: { ...shape, mode: cells <= 9 ? 'sequence' : 'splice', cells, layout }, final: true, cells });
    pos = cdsLength;
  }
  if (pos !== cdsLength) throw new Error('chapter plan does not cover the CDS');
  return out;
}

/** Level specs for one gene's assembly chapter. `geneIndex` keeps seeds distinct across genes. */
export function chapterSpecs(gene: ChapterGene, geneIndex: number, firstIndex: number): LevelSpec[] {
  const plan = planChapter(gene.cdsLength);
  const sym = gene.symbol.toLowerCase();
  return plan.map((p, i) => ({
    id: `${sym}-c${String(i + 1).padStart(2, '0')}`,
    index: firstIndex + i,
    gene: gene.symbol,
    title: p.final ? `${tierName(p.k)} · finale` : `${tierName(p.k)} · ${MODE_NAME[p.shape.mode]}`,
    mode: p.shape.mode,
    seed: 400_000 + geneIndex * 1000 + (i + 1) * 37,
    source: { start: p.start, end: p.end },
    layout: p.shape.layout,
    tutorial: false,
    scrambleDrags: p.final ? 4 : p.shape.scrambleDrags,
    minDrags: p.final ? 3 : p.shape.minDrags,
    minWrongCells: Math.min(p.final ? 5 : p.shape.minWrongCells, p.cells - 1),
    mask: MASKS[(i + geneIndex) % MASKS.length]!,
    tokenSize: p.k,
    chapter: { part: i + 1, of: plan.length },
    solverBudget: 60_000,
  }));
}
