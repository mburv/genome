import { CELLS, SIZE, cellAt, colOf, inBounds, isActive, rowOf, segmentCells } from '../engine/grid.ts';
import type { Cell, Mask } from '../engine/types.ts';
import type { Rng } from './rng.ts';

type Transform = (r: number, c: number) => [number, number];
const L = SIZE - 1;
/** The eight dihedral transforms of the square (rotations and reflections). */
export const TRANSFORMS: readonly Transform[] = [
  (r, c) => [r, c],
  (r, c) => [c, L - r],
  (r, c) => [L - r, L - c],
  (r, c) => [L - c, r],
  (r, c) => [r, L - c],
  (r, c) => [L - r, c],
  (r, c) => [c, r],
  (r, c) => [L - c, L - r],
];

export function transformMask(mask: Mask, t: Transform): Mask {
  const out = new Array<string>(CELLS);
  for (let cell = 0; cell < CELLS; cell++) {
    const [r, c] = t(rowOf(cell), colOf(cell));
    out[cellAt(r, c)] = mask[cell]!;
  }
  return out.join('');
}

/** Canonical fingerprint: lexicographically smallest of all eight transforms. */
export function canonicalMask(mask: Mask): string {
  return TRANSFORMS.map((t) => transformMask(mask, t)).sort()[0]!;
}

/** Minimum Hamming distance between `a` and any transform of `b`. 0 means identical up to symmetry. */
export function symmetricDistance(a: Mask, b: Mask): number {
  let best = Infinity;
  for (const t of TRANSFORMS) {
    const tb = transformMask(b, t);
    let d = 0;
    for (let i = 0; i < CELLS; i++) if (a[i] !== tb[i]) d++;
    best = Math.min(best, d);
  }
  return best;
}

const neighbours = (cell: Cell): Cell[] => {
  const r = rowOf(cell);
  const c = colOf(cell);
  return ([[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]] as const)
    .filter(([rr, cc]) => inBounds(rr, cc))
    .map(([rr, cc]) => cellAt(rr, cc));
};

export function isConnected(mask: Mask): boolean {
  const start = mask.indexOf('#');
  if (start < 0) return false;
  const seen = new Set<Cell>([start]);
  const queue = [start];
  while (queue.length) {
    const cell = queue.pop()!;
    for (const n of neighbours(cell)) if (isActive(mask, n) && !seen.has(n)) { seen.add(n); queue.push(n); }
  }
  return seen.size === mask.split('').filter((ch) => ch === '#').length;
}

export interface MaskMetrics {
  active: number;
  holes: number;
  /** Active cells with exactly one active orthogonal neighbour. */
  deadEnds: number;
  /** Active cells that cannot move along either axis. */
  immobile: number;
  /** Fewest playable cells in any single row or column. */
  sparsestLine: number;
}

/** Avoid near-empty rows/columns that merely shrink the board. */
export const MIN_LINE_ACTIVE = 3;

export function maskMetrics(mask: Mask): MaskMetrics {
  let active = 0;
  let deadEnds = 0;
  let immobile = 0;
  for (let cell = 0; cell < CELLS; cell++) {
    if (!isActive(mask, cell)) continue;
    active++;
    if (neighbours(cell).filter((n) => isActive(mask, n)).length === 1) deadEnds++;
    if (segmentCells(mask, cell, 'row').length < 2 && segmentCells(mask, cell, 'col').length < 2) immobile++;
  }
  let sparsestLine = SIZE;
  for (let i = 0; i < SIZE; i++) {
    let r = 0;
    let c = 0;
    for (let j = 0; j < SIZE; j++) {
      if (isActive(mask, cellAt(i, j))) r++;
      if (isActive(mask, cellAt(j, i))) c++;
    }
    sparsestLine = Math.min(sparsestLine, r, c);
  }
  return { active, holes: CELLS - active, deadEnds, immobile, sparsestLine };
}

export interface MaskOptions {
  protect: readonly Cell[];
  /** Cells that must be holes (e.g. a repair gap). */
  forceHoles?: readonly Cell[];
  /** Reject masks that equal any non-identity rotation/reflection of themselves. */
  requireAsymmetric?: boolean;
  minActive: number;
  maxActive: number;
  maxDeadEnds: number;
  operations: number;
  /** Relative weights of layout primitives. */
  weights: { edgeBite: number; cornerCut: number; cavity: number; channel: number; island: number; diagonal?: number; branch?: number };
}

/** One proposal from generative primitives. Callers validate and retry. */
export function proposeMask(rng: Rng, opts: MaskOptions): Mask {
  const cells = new Array<string>(CELLS).fill('#');
  const protect = new Set(opts.protect);
  const carve = (r: number, c: number): void => {
    if (inBounds(r, c) && !protect.has(cellAt(r, c))) cells[cellAt(r, c)] = '.';
  };
  const rect = (r0: number, c0: number, h: number, w: number): void => {
    for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) carve(r, c);
  };
  const kinds = Object.entries(opts.weights).flatMap(([k, w]) => new Array<string>(w ?? 0).fill(k));
  for (let i = 0; i < opts.operations; i++) {
    const kind = rng.pick(kinds);
    if (kind === 'edgeBite') {
      const depth = rng.range(1, 2);
      const width = rng.range(1, 3);
      const pos = rng.range(0, SIZE - width);
      const side = rng.int(4);
      if (side === 0) rect(0, pos, depth, width);
      else if (side === 1) rect(SIZE - depth, pos, depth, width);
      else if (side === 2) rect(pos, 0, width, depth);
      else rect(pos, SIZE - depth, width, depth);
    } else if (kind === 'cornerCut') {
      const size = rng.range(1, 3);
      const top = rng.int(2) === 0;
      const left = rng.int(2) === 0;
      for (let k = 0; k < size; k++) {
        for (let j = 0; j < size - k; j++) carve(top ? k : L - k, left ? j : L - j);
      }
    } else if (kind === 'cavity') {
      const h = rng.range(1, 2);
      const w = rng.range(1, 2);
      rect(rng.range(1, SIZE - 1 - h), rng.range(1, SIZE - 1 - w), h, w);
    } else if (kind === 'channel') {
      const len = rng.range(2, 4);
      if (rng.int(2) === 0) rect(rng.range(1, L - 1), rng.range(0, SIZE - len), 1, len);
      else rect(rng.range(0, SIZE - len), rng.range(1, L - 1), len, 1);
    } else if (kind === 'diagonal') {
      // diagonal band: a staircase of single holes
      const len = rng.range(3, 5);
      const r0 = rng.range(0, SIZE - len);
      const c0 = rng.range(0, SIZE - len);
      const anti = rng.int(2) === 0;
      for (let k = 0; k < len; k++) carve(r0 + k, anti ? c0 + len - 1 - k : c0 + k);
    } else if (kind === 'branch') {
      // branching corridor walls: an L or T shaped hole wall
      const r0 = rng.range(1, 6);
      const c0 = rng.range(1, 6);
      const a = rng.range(2, 3);
      const b = rng.range(2, 3);
      rect(r0, c0, 1, a);
      if (rng.int(2) === 0) rect(r0, c0, b, 1);
      else rect(r0 - Math.floor(b / 2), c0 + Math.floor(a / 2), b, 1);
    } else {
      // island: a hole ring fragment that leaves an offset block connected by a neck
      const r0 = rng.range(1, 5);
      const c0 = rng.range(1, 5);
      rect(r0, c0, 1, 3);
      rect(r0, c0, 3, 1);
    }
  }
  for (const cell of opts.forceHoles ?? []) cells[cell] = '.';
  return cells.join('');
}

export function isSelfSymmetric(mask: Mask): boolean {
  return TRANSFORMS.slice(1).some((t) => transformMask(mask, t) === mask);
}

export function maskErrors(mask: Mask, opts: MaskOptions): string[] {
  const errors: string[] = [];
  const m = maskMetrics(mask);
  if (!isConnected(mask)) errors.push('not connected');
  if (m.active < opts.minActive || m.active > opts.maxActive) errors.push(`active ${m.active} outside ${opts.minActive}-${opts.maxActive}`);
  if (m.active === CELLS) errors.push('full board');
  if (m.deadEnds > opts.maxDeadEnds) errors.push(`dead ends ${m.deadEnds}`);
  if (m.immobile > 0) errors.push(`immobile cells ${m.immobile}`);
  if (m.sparsestLine < MIN_LINE_ACTIVE) errors.push(`a row/column has only ${m.sparsestLine} playable cells`);
  for (const cell of opts.protect) if (!isActive(mask, cell)) errors.push(`protected cell ${cell} carved`);
  for (const cell of opts.forceHoles ?? []) if (isActive(mask, cell)) errors.push(`forced hole ${cell} active`);
  if (opts.requireAsymmetric && isSelfSymmetric(mask)) errors.push('symmetric');
  return errors;
}

/**
 * Deterministic clean-up of a proposal: (1) re-open one crossing neighbour for any protected cell that
 * would otherwise be stuck on its crossing axis, (2) drop playable fragments cut off from the protected
 * cells. Never touches forced holes. Returns null if protected cells end up in different regions.
 */
export function tidyMask(mask: Mask, protect: readonly Cell[], crossAxis: (cell: Cell) => 'row' | 'col', forceHoles: readonly Cell[] = []): Mask | null {
  const cells = mask.split('');
  const forced = new Set(forceHoles);
  for (const cell of protect) {
    const axis = crossAxis(cell);
    if (segmentCells(cells.join(''), cell, axis).length >= 2) continue;
    const r = rowOf(cell);
    const c = colOf(cell);
    const options = axis === 'col' ? [[r - 1, c], [r + 1, c]] : [[r, c - 1], [r, c + 1]];
    for (const [rr, cc] of options) {
      if (rr === undefined || cc === undefined || !inBounds(rr, cc)) continue;
      const n = cellAt(rr, cc);
      if (forced.has(n)) continue;
      cells[n] = '#';
      break;
    }
  }
  const m = cells.join('');
  // keep only the region containing the protected cells
  const start = protect[0];
  if (start === undefined) return m;
  const seen = new Set<Cell>([start]);
  const queue = [start];
  while (queue.length) {
    const cell = queue.pop()!;
    for (const n of neighbours(cell)) if (isActive(m, n) && !seen.has(n)) { seen.add(n); queue.push(n); }
  }
  if (protect.some((p) => !seen.has(p))) return null;
  return m.split('').map((ch, i) => (ch === '#' && !seen.has(i) ? '.' : ch)).join('');
}
