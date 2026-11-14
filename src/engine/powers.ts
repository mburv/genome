/**
 * M3 enzyme power-ups: rules shared by the engine, hint search, generator and UI. Pure data/functions.
 * Costs and energy numbers are the GDD §6 playtest defaults (proposed; tune after playtest).
 */
import { CELLS, colOf, inBounds, rowOf, cellAt, segmentCells } from './grid.ts';
import type { Axis, Board, Cell, LevelDefinition, Mask, Power } from './types.ts';

export type { Power };
export const POWERS: readonly Power[] = ['crispr', 'ligase', 'scaffold'];
export const POWER_COST: Readonly<Record<Power, number>> = { crispr: 4, ligase: 2, scaffold: 3 };
export const START_ENERGY = 2;
export const ENERGY_CAP = 9;
/** Successful normal rotations a scaffold lasts. */
export const SCAFFOLD_TURNS = 3;
export const MAX_SCAFFOLD_GAP = 2;
/** The opening 1-base puzzle has no powers so new players learn plain sliding first. Labs and every later puzzle do. */
export const OPENING_LEVEL_ID = 'ins-01';

/** A temporary bridge: `cells` (segment A then segment B, skipping `gap`) rotate as one cyclic track. */
export interface Scaffold {
  axis: Axis;
  gap: Cell[];
  cells: Cell[];
  remaining: number;
}

export interface Codon {
  /** Stable level-local key: strand + CDS offset of the codon's first base. */
  key: string;
  cells: Cell[];
  expected: string;
  group: number;
  /** Energy is only earned for coding-strand reference codons (not the complementary strand). */
  rewardable: boolean;
}

export const powersEnabled = (def: LevelDefinition): boolean => def.id !== OPENING_LEVEL_ID;

/**
 * Reward units. Single-base levels: reference codons that lie wholly inside one track (in-frame
 * triples of contiguous track cells). Token levels (M4): every target tile is one unit — each piece
 * starts in frame and holds ≥ 1 whole codon — keyed by its CDS offset.
 */
export function levelCodons(def: LevelDefinition): Codon[] {
  const out: Codon[] = [];
  if (def.tokens) {
    for (const t of def.tracks) {
      let offset = t.source.start;
      t.cells.forEach((cell, i) => {
        const sym = t.expected[i]!;
        out.push({ key: `${t.strand === 'coding' ? 'c' : 'x'}${offset}`, cells: [cell], expected: sym, group: t.group, rewardable: t.strand === 'coding' });
        offset += def.tokens![sym]!.seq.length;
      });
    }
    return out;
  }
  for (const t of def.tracks) {
    for (let i = 0; i + 2 < t.cells.length; i++) {
      const offset = t.source.start + i;
      if (offset % 3 !== 0) continue;
      out.push({
        key: `${t.strand === 'coding' ? 'c' : 'x'}${offset}`,
        cells: t.cells.slice(i, i + 3),
        expected: t.expected.slice(i, i + 3),
        group: t.group,
        rewardable: t.strand === 'coding',
      });
    }
  }
  return out;
}

export const codonComplete = (board: Board, c: Codon): boolean => c.cells.every((cell, i) => board[cell] === c.expected[i]);

/**
 * The rotating segment for (origin, axis) under the current topology. Locked cells behave like holes
 * on both axes (a locked origin has no segment). A scaffold joins its two segments along its axis.
 */
export function effectiveSegment(mask: Mask, locks: readonly Cell[], scaffold: Scaffold | null, origin: Cell, axis: Axis): Cell[] {
  if (locks.includes(origin)) return [];
  if (scaffold && scaffold.axis === axis && scaffold.cells.includes(origin)) return scaffold.cells;
  const base = segmentCells(mask, origin, axis);
  if (!locks.length) return base;
  const i = base.indexOf(origin);
  let a = i;
  let b = i;
  while (a > 0 && !locks.includes(base[a - 1]!)) a--;
  while (b < base.length - 1 && !locks.includes(base[b + 1]!)) b++;
  return base.slice(a, b + 1);
}

const step = (axis: Axis): [number, number] => (axis === 'row' ? [0, 1] : [1, 0]);

/**
 * Validate a scaffold over `gap` (1–2 contiguous holes along `axis`) between two playable, unlocked
 * segments. Returns the combined track, or a reason.
 */
export function scaffoldTrack(mask: Mask, locks: readonly Cell[], axis: Axis, gap: readonly Cell[]): { cells: Cell[] } | { reason: string } {
  if (gap.length < 1 || gap.length > MAX_SCAFFOLD_GAP) return { reason: 'gap must be 1–2 cells' };
  const [dr, dc] = step(axis);
  const sorted = [...gap].sort((x, y) => x - y);
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i]!;
    if (!Number.isInteger(c) || c < 0 || c >= CELLS || mask[c] !== '.') return { reason: 'gap cells must be holes' };
    if (i > 0 && c !== cellAt(rowOf(sorted[i - 1]!) + dr, colOf(sorted[i - 1]!) + dc)) return { reason: 'gap must be contiguous on the axis' };
    if (axis === 'row' && rowOf(c) !== rowOf(sorted[0]!)) return { reason: 'gap must be contiguous on the axis' };
  }
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const br = rowOf(first) - dr, bc = colOf(first) - dc;
  const ar = rowOf(last) + dr, ac = colOf(last) + dc;
  if (!inBounds(br, bc) || !inBounds(ar, ac)) return { reason: 'gap must sit between two segments' };
  const before = cellAt(br, bc);
  const after = cellAt(ar, ac);
  if (mask[before] !== '#' || mask[after] !== '#') return { reason: 'gap must sit between two segments' };
  if (locks.includes(before) || locks.includes(after)) return { reason: 'a scaffold cannot cross a bonded cell' };
  const segA = effectiveSegment(mask, locks, null, before, axis);
  const segB = effectiveSegment(mask, locks, null, after, axis);
  return { cells: [...segA, ...segB] };
}

export interface ScaffoldCandidate {
  axis: Axis;
  gap: Cell[];
  cells: Cell[];
}

/** Every legal scaffold placement (maximal hole runs of length 1–2 bounded by playable unlocked cells). */
export function scaffoldCandidates(mask: Mask, locks: readonly Cell[] = []): ScaffoldCandidate[] {
  const out: ScaffoldCandidate[] = [];
  for (const axis of ['row', 'col'] as const) {
    for (let line = 0; line < 9; line++) {
      const cells = Array.from({ length: 9 }, (_, i) => (axis === 'row' ? cellAt(line, i) : cellAt(i, line)));
      for (let i = 1; i < 8; i++) {
        if (mask[cells[i]!] !== '.' || mask[cells[i - 1]!] !== '#') continue;
        let j = i;
        while (j < 9 && mask[cells[j]!] === '.') j++;
        if (j >= 9 || j - i > MAX_SCAFFOLD_GAP) continue;
        const gap = cells.slice(i, j);
        const r = scaffoldTrack(mask, locks, axis, gap);
        if ('cells' in r) out.push({ axis, gap, cells: r.cells });
      }
    }
  }
  return out;
}

/** Available energy: starting + earned − net spent, capped. */
export const availableEnergy = (earned: number, spent: number): number => Math.max(0, Math.min(ENERGY_CAP, START_ENERGY + earned - spent));
