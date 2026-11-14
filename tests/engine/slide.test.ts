import { describe, expect, it } from 'vitest';
import { applyMove, applySlide, normaliseSteps, slideToMoves, cellAt, segmentCells } from '../../src/engine/grid.ts';
import { applyCommand, createInitialState, recoveryHint, replayCertificate } from '../../src/engine/engine.ts';
import { RETIRED_SAMPLE_LEVELS as LEVELS } from '../../src/campaign/campaign.ts';
import { createRng } from '../../src/generator/rng.ts';
import { grid, maskOf } from '../helpers.ts';

const board = grid([
  'ATCG.GATC',
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

describe('k-step slide helpers', () => {
  it('normalises to the shortest signed equivalent', () => {
    expect(normaliseSteps(0, 4)).toBe(0);
    expect(normaliseSteps(4, 4)).toBe(0);
    expect(normaliseSteps(-8, 4)).toBe(0);
    expect(normaliseSteps(3, 4)).toBe(-1);
    expect(normaliseSteps(2, 4)).toBe(2);
    expect(normaliseSteps(-2, 4)).toBe(2);
    expect(normaliseSteps(5, 9)).toBe(-4);
    expect(normaliseSteps(4, 9)).toBe(4);
    expect(normaliseSteps(3, 1)).toBe(0);
    expect(normaliseSteps(1.5, 4)).toBe(0);
  });
  it('k steps equals k single moves, wrapping inside the hole-bounded segment', () => {
    expect(applySlide(mask, board, 1, 'row', 2).board.slice(0, 9)).toBe('CGAT.GATC');
    expect(applySlide(mask, board, 1, 'row', -1).board.slice(0, 9)).toBe('TCGA.GATC');
    expect(applySlide(mask, board, 1, 'row', 3).board.slice(0, 9)).toBe('TCGA.GATC');
    expect(applySlide(mask, board, 8, 'row', 1).board.slice(0, 9)).toBe('ATCG.CGAT');
  });
  it('a full-length slide or zero steps is a no-op', () => {
    expect(applySlide(mask, board, 0, 'row', 4).changed).toBe(false);
    expect(applySlide(mask, board, 0, 'row', 0).changed).toBe(false);
  });
  it('single-cell segments never move', () => {
    expect(segmentCells(mask, cellAt(2, 0), 'row')).toEqual([cellAt(2, 0)]);
    expect(applySlide(mask, board, cellAt(2, 0), 'row', 3).changed).toBe(false);
  });
  it('vertical slides respect holes', () => {
    const r = applySlide(mask, board, cellAt(0, 1), 'col', 1);
    expect(r.segment).toEqual([1, 10]);
    expect(r.board[1]).toBe('G');
    expect(r.board[10]).toBe('T');
  });
  it('matches repeated single moves for random k (property)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 200; i++) {
      const origin = rng.int(81);
      const axis = rng.int(2) === 0 ? 'row' : 'col';
      const k = rng.range(-20, 20);
      let b = board;
      for (let j = 0; j < Math.abs(k); j++) b = applyMove(mask, b, { origin, axis, direction: k > 0 ? 1 : -1 }).board;
      expect(applySlide(mask, board, origin, axis, k).board).toBe(b);
      expect(slideToMoves(mask, origin, axis, k).length).toBeLessThanOrEqual(4);
    }
  });
});

describe('slide command', () => {
  const def = LEVELS[2]!;
  const track = def.tracks[0]!;

  it('one drag = one undoable action and one counted move, regardless of steps', () => {
    const s0 = createInitialState(def);
    const r = applyCommand(def, s0, { type: 'slide', origin: track.cells[0]!, axis: 'col', steps: 3 });
    expect(r.accepted).toBe(true);
    expect(r.state.moves).toBe(1);
    expect(r.state.history).toHaveLength(1);
    expect(r.state.board).toBe(applySlide(def.mask, s0.board, track.cells[0]!, 'col', 3).board);
    expect(r.events[0]).toMatchObject({ type: 'slid', steps: 3 });
    const u = applyCommand(def, r.state, { type: 'undo' });
    expect(u.state.board).toBe(s0.board);
    expect(u.state.moves).toBe(0);
    expect(u.state.recovery).toEqual(s0.recovery);
  });
  it('net-zero drag (full turn) is rejected as a no-op and not counted', () => {
    const s0 = createInitialState(def);
    const r = applyCommand(def, s0, { type: 'slide', origin: track.cells[0]!, axis: 'col', steps: 9 });
    expect(r.accepted).toBe(false);
    expect(r.reason).toBe('no-op');
    expect(r.state).toBe(s0);
  });
  it('holes are immobile for slides', () => {
    const r = applyCommand(def, createInitialState(def), { type: 'slide', origin: def.mask.indexOf('.'), axis: 'row', steps: 2 });
    expect(r.reason).toBe('immobile');
  });
  it('hints stay valid after multi-step drags and still lead to a win', () => {
    for (const lvl of LEVELS) {
      let s = createInitialState(lvl);
      const rng = createRng(lvl.seed);
      for (let i = 0; i < 4 && s.status === 'playing'; i++) {
        const t = lvl.tracks[0]!;
        const r = applyCommand(lvl, s, { type: 'slide', origin: rng.pick(t.cells), axis: rng.int(2) ? 'row' : 'col', steps: rng.range(-4, 4) });
        if (r.accepted) s = r.state;
      }
      for (let i = 0; i < 100 && s.status === 'playing'; i++) {
        const h = recoveryHint(lvl, s);
        expect(h).not.toBeNull();
        s = applyCommand(lvl, s, { type: 'rotate', move: h! }).state;
      }
      expect(s.status).toBe('solved');
    }
  });
  it('a certificate collapsed into multi-step slides still solves', () => {
    for (const lvl of LEVELS) {
      let s = createInitialState(lvl);
      // Group consecutive identical certificate moves into one slide.
      const cert = lvl.certificate;
      for (let i = 0; i < cert.length; ) {
        let j = i;
        while (j + 1 < cert.length && cert[j + 1]!.origin === cert[i]!.origin && cert[j + 1]!.axis === cert[i]!.axis && cert[j + 1]!.direction === cert[i]!.direction) j++;
        const m = cert[i]!;
        s = applyCommand(lvl, s, { type: 'slide', origin: m.origin, axis: m.axis, steps: (j - i + 1) * m.direction }).state;
        i = j + 1;
      }
      expect(s.status).toBe('solved');
      expect(replayCertificate(lvl).solved).toBe(true);
    }
  });
});
