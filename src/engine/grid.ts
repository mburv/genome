import type { Axis, Board, Cell, Direction, Mask, Move } from './types.ts';

export const SIZE = 9;
export const CELLS = SIZE * SIZE;
export const HOLE = '.';

export const rowOf = (cell: Cell): number => Math.floor(cell / SIZE);
export const colOf = (cell: Cell): number => cell % SIZE;
export const cellAt = (row: number, col: number): Cell => row * SIZE + col;
export const inBounds = (row: number, col: number): boolean => row >= 0 && row < SIZE && col >= 0 && col < SIZE;
export const isActive = (mask: Mask, cell: Cell): boolean => mask[cell] === '#';

/** Maximal contiguous playable run along `axis` containing `origin`. Empty if origin is a hole/out of range. */
export function segmentCells(mask: Mask, origin: Cell, axis: Axis): Cell[] {
  if (!Number.isInteger(origin) || origin < 0 || origin >= CELLS || !isActive(mask, origin)) return [];
  const r = rowOf(origin);
  const c = colOf(origin);
  const [dr, dc] = axis === 'row' ? [0, 1] : [1, 0];
  let sr = r;
  let sc = c;
  while (inBounds(sr - dr, sc - dc) && isActive(mask, cellAt(sr - dr, sc - dc))) {
    sr -= dr;
    sc -= dc;
  }
  const cells: Cell[] = [];
  while (inBounds(sr, sc) && isActive(mask, cellAt(sr, sc))) {
    cells.push(cellAt(sr, sc));
    sr += dr;
    sc += dc;
  }
  return cells;
}

/** Rotate tiles along `cells` by one step: old[i] moves to new[(i + d + n) % n]. */
export function rotateCells(board: Board, cells: readonly Cell[], direction: Direction): Board {
  const n = cells.length;
  if (n < 2) return board;
  const out = board.split('');
  for (let i = 0; i < n; i++) {
    const from = cells[i]!;
    const to = cells[(i + direction + n) % n]!;
    out[to] = board[from]!;
  }
  return out.join('');
}

export const inverseMove = (m: Move): Move => ({ origin: m.origin, axis: m.axis, direction: (m.direction === 1 ? -1 : 1) as Direction });

/** Canonical identity: axis + segment span + direction. Origin aliases inside one segment are equal. */
export function moveKey(mask: Mask, m: Move): string | null {
  const seg = segmentCells(mask, m.origin, m.axis);
  if (seg.length < 2) return null;
  return `${m.axis}:${seg[0]}-${seg[seg.length - 1]}:${m.direction}`;
}

export interface MoveOutcome {
  board: Board;
  segment: Cell[];
  changed: boolean;
}

/** Apply a normal rotation. `changed` is false for holes, singletons or identical results (no-ops). */
export function applyMove(mask: Mask, board: Board, m: Move): MoveOutcome {
  const segment = segmentCells(mask, m.origin, m.axis);
  if (segment.length < 2) return { board, segment, changed: false };
  const next = rotateCells(board, segment, m.direction);
  return { board: next, segment, changed: next !== board };
}

/** One canonical move per movable segment per direction (origin = first cell of the segment). */
export function allMoves(mask: Mask): Move[] {
  const moves: Move[] = [];
  const seen = new Set<string>();
  for (let cell = 0; cell < CELLS; cell++) {
    for (const axis of ['row', 'col'] as const) {
      const seg = segmentCells(mask, cell, axis);
      if (seg.length < 2 || seg[0] !== cell) continue;
      const key = `${axis}:${cell}`;
      if (seen.has(key)) continue;
      seen.add(key);
      moves.push({ origin: cell, axis, direction: 1 }, { origin: cell, axis, direction: -1 });
    }
  }
  return moves;
}

export function maskOfBoard(board: Board): Mask {
  return board.replace(/[ATCG]/g, '#');
}

export function baseCounts(board: Board): Record<string, number> {
  const counts: Record<string, number> = { A: 0, T: 0, C: 0, G: 0 };
  for (const ch of board) if (ch !== HOLE) counts[ch] = (counts[ch] ?? 0) + 1;
  return counts;
}

/**
 * Normalise a multi-step slide to the shortest equivalent signed step count in (-n/2, n/2].
 * Returns 0 for full turns (k ≡ 0 mod n) and for immobile segments (n < 2).
 */
export function normaliseSteps(steps: number, segmentLength: number): number {
  if (segmentLength < 2 || !Number.isInteger(steps)) return 0;
  let k = ((steps % segmentLength) + segmentLength) % segmentLength;
  if (k > segmentLength / 2) k -= segmentLength;
  return k;
}

/** Expand a k-step slide of the segment at `origin` into its equivalent sequence of single-step moves. */
export function slideToMoves(mask: Mask, origin: Cell, axis: Axis, steps: number): Move[] {
  const k = normaliseSteps(steps, segmentCells(mask, origin, axis).length);
  const direction: Direction = k > 0 ? 1 : -1;
  return Array.from({ length: Math.abs(k) }, () => ({ origin, axis, direction }));
}

/** Rotate the segment at `origin` by `steps` cells (any integer, wraps mod segment length). */
export function applySlide(mask: Mask, board: Board, origin: Cell, axis: Axis, steps: number): MoveOutcome {
  const segment = segmentCells(mask, origin, axis);
  let next = board;
  for (const m of slideToMoves(mask, origin, axis, steps)) next = rotateCells(next, segment, m.direction);
  return { board: next, segment, changed: next !== board };
}
