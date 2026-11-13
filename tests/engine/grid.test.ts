import { describe, expect, it } from 'vitest';
import { applyMove, cellAt, inverseMove, moveKey, rotateCells, segmentCells, allMoves, baseCounts } from '../../src/engine/grid.ts';
import { createRng } from '../../src/generator/rng.ts';
import type { Move } from '../../src/engine/types.ts';
import { grid, maskOf } from '../helpers.ts';

const board = grid([
  'ATC..GATC',
  'GGGGGGGGG',
  'T.CAGTCAG',
  'C.GATCGAT',
  'A.TTTTTTT',
  'G.ACGTACG',
  'T.GCATGCA',
  'AACCGGTTA',
  'CTGACTGAC',
]);
const mask = maskOf(board);
const row0 = (b: string) => b.slice(0, 9);

describe('segment rotation', () => {
  it('wraps horizontally inside the segment only (GDD example)', () => {
    const r = applyMove(mask, board, { origin: 0, axis: 'row', direction: 1 });
    expect(row0(r.board)).toBe('CAT..GATC');
    expect(r.segment).toEqual([0, 1, 2]);
  });
  it('wraps left', () => {
    expect(row0(applyMove(mask, board, { origin: 1, axis: 'row', direction: -1 }).board)).toBe('TCA..GATC');
  });
  it('holes are barriers: second segment is independent', () => {
    expect(row0(applyMove(mask, board, { origin: 8, axis: 'row', direction: 1 }).board)).toBe('ATC..CGAT');
  });
  it('wraps vertically', () => {
    const r = applyMove(mask, board, { origin: cellAt(0, 0), axis: 'col', direction: -1 });
    const col = Array.from({ length: 9 }, (_, i) => r.board[i * 9]).join('');
    expect(col).toBe('GTCAGTACA');
  });
  it('vertical segment is split by the hole in column 1', () => {
    expect(segmentCells(mask, cellAt(0, 1), 'col')).toEqual([1, 10]);
    expect(segmentCells(mask, cellAt(8, 1), 'col')).toEqual([cellAt(7, 1), cellAt(8, 1)]);
  });
  it('two-tile segment swaps', () => {
    const r = applyMove(mask, board, { origin: 1, axis: 'col', direction: 1 });
    expect(r.board[1]).toBe('G');
    expect(r.board[10]).toBe('T');
  });
  it('holes and out-of-range origins are not segments', () => {
    expect(segmentCells(mask, 3, 'row')).toEqual([]);
    expect(segmentCells(mask, -1, 'row')).toEqual([]);
    expect(segmentCells(mask, 81, 'row')).toEqual([]);
    expect(applyMove(mask, board, { origin: 3, axis: 'row', direction: 1 }).changed).toBe(false);
  });
  it('identical letters produce a no-op', () => {
    expect(applyMove(mask, board, { origin: 9, axis: 'row', direction: 1 }).changed).toBe(false);
  });
  it('single-tile segments cannot move', () => {
    const m = grid(['A.A.AAAAA', ...Array(8).fill('.........')]).replace(/A/g, '#');
    const b = grid(['A.T.ACGTA', ...Array(8).fill('.........')]);
    expect(segmentCells(m, 0, 'row')).toEqual([0]);
    expect(applyMove(m, b, { origin: 0, axis: 'row', direction: 1 }).changed).toBe(false);
    expect(applyMove(m, b, { origin: 0, axis: 'col', direction: 1 }).changed).toBe(false);
  });
  it('origin aliases share a canonical move identity', () => {
    expect(moveKey(mask, { origin: 0, axis: 'row', direction: 1 })).toBe(moveKey(mask, { origin: 2, axis: 'row', direction: 1 }));
    expect(moveKey(mask, { origin: 0, axis: 'row', direction: 1 })).not.toBe(moveKey(mask, { origin: 5, axis: 'row', direction: 1 }));
  });
  it('rotateCells maps old[i] to new[(i+d+n)%n]', () => {
    expect(rotateCells('ABCD', [0, 1, 2, 3], 1)).toBe('DABC');
    expect(rotateCells('ABCD', [0, 1, 2, 3], -1)).toBe('BCDA');
  });
});

describe('properties over random seeds', () => {
  it('every move is inverted by its inverse and preserves the multiset and holes', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = createRng(seed);
      const moves = allMoves(mask);
      let b = board;
      for (let k = 0; k < 30; k++) {
        const m: Move = rng.pick(moves);
        const next = applyMove(mask, b, m).board;
        expect(applyMove(mask, next, inverseMove(m)).board).toBe(b);
        expect(baseCounts(next)).toEqual(baseCounts(board));
        expect(maskOf(next)).toBe(mask);
        b = next;
      }
    }
  });
  it('rotating a segment n times returns to the start', () => {
    const seg = segmentCells(mask, cellAt(7, 0), 'row');
    let b = board;
    for (let i = 0; i < seg.length; i++) b = applyMove(mask, b, { origin: cellAt(7, 0), axis: 'row', direction: 1 }).board;
    expect(b).toBe(board);
  });
});
