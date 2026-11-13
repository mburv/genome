import { CELLS, rotateCells, segmentCells } from '../engine/grid.ts';
import type { Axis, Board, Cell, Mask, Slide, Track } from '../engine/types.ts';

/**
 * Bounded breadth-first solver in the drag metric (one drag = rotate one segment by any k).
 * Pure and synchronous: used at build time (generator, audit CLI), never on the UI thread.
 *
 * Limits: the state space grows ~ (Σ(n_i − 1))^d — about 140^d on a near-full board — so within the
 * default budget it proves optima of ≤ 2 drags (lower bound 3) on large boards and sometimes ≤ 3 on
 * sparse ones. When the budget runs out it reports 'unknown' with the deepest fully explored bound.
 */
export interface SolveOptions {
  maxDepth: number;
  maxNodes: number;
}

export interface SolveResult {
  status: 'optimal' | 'unknown' | 'invalid';
  /** Every solution needs at least this many drags (proven by exhaustive layers). */
  lowerBound: number;
  optimal?: number;
  solution?: Slide[];
  nodes: number;
}

interface SegmentMove {
  cells: Cell[];
  origin: Cell;
  axis: Axis;
}

export function segmentsOf(mask: Mask): SegmentMove[] {
  const out: SegmentMove[] = [];
  for (let cell = 0; cell < CELLS; cell++) {
    for (const axis of ['row', 'col'] as const) {
      const seg = segmentCells(mask, cell, axis);
      if (seg.length >= 2 && seg[0] === cell) out.push({ cells: seg, origin: cell, axis });
    }
  }
  return out;
}

const matches = (tracks: readonly Track[], board: Board): boolean =>
  tracks.every((t) => t.cells.every((c, i) => board[c] === t.expected[i]));

export function solveBounded(mask: Mask, tracks: readonly Track[], start: Board, opts: SolveOptions): SolveResult {
  if (start.length !== CELLS) return { status: 'invalid', lowerBound: 0, nodes: 0 };
  if (matches(tracks, start)) return { status: 'optimal', lowerBound: 0, optimal: 0, solution: [], nodes: 1 };
  const segs = segmentsOf(mask);
  // Each slide as (segment, k) with k in the normalised range, so no duplicate rotations.
  const slides: { seg: SegmentMove; k: number }[] = [];
  for (const seg of segs) {
    const n = seg.cells.length;
    for (let k = -Math.floor((n - 1) / 2); k <= Math.floor(n / 2); k++) if (k !== 0) slides.push({ seg, k });
  }
  const parent = new Map<Board, { prev: Board; slide: Slide } | null>([[start, null]]);
  let frontier: Board[] = [start];
  let nodes = 1;
  for (let depth = 1; depth <= opts.maxDepth; depth++) {
    const next: Board[] = [];
    for (const b of frontier) {
      for (const { seg, k } of slides) {
        let nb = b;
        const step = k > 0 ? 1 : -1;
        for (let i = 0; i < Math.abs(k); i++) nb = rotateCells(nb, seg.cells, step);
        if (parent.has(nb)) continue;
        parent.set(nb, { prev: b, slide: { origin: seg.origin, axis: seg.axis, steps: k } });
        nodes++;
        if (matches(tracks, nb)) {
          const solution: Slide[] = [];
          let cur: Board = nb;
          for (let p = parent.get(cur); p; p = parent.get(cur)) {
            solution.unshift(p.slide);
            cur = p.prev;
          }
          return { status: 'optimal', lowerBound: depth, optimal: depth, solution, nodes };
        }
        if (nodes >= opts.maxNodes) return { status: 'unknown', lowerBound: depth, nodes };
        next.push(nb);
      }
    }
    frontier = next;
  }
  return { status: 'unknown', lowerBound: opts.maxDepth + 1, nodes };
}
