import { describe, expect, it } from 'vitest';
import { applyCommand, createInitialState, isSolved, recoveryHint, replayCertificate, HISTORY_CAP, type PuzzleState } from '../../src/engine/engine.ts';
import { applyMove, cellAt } from '../../src/engine/grid.ts';
import type { LevelDefinition, Move } from '../../src/engine/types.ts';
import { LEVELS } from '../../src/campaign/campaign.ts';
import { syntheticLevel } from '../helpers.ts';

const rotate = (move: Move) => ({ type: 'rotate' as const, move });

function play(def: LevelDefinition, moves: Move[], state: PuzzleState = createInitialState(def)): PuzzleState {
  return moves.reduce((s, m) => applyCommand(def, s, rotate(m)).state, state);
}

describe('applyCommand', () => {
  const def = LEVELS[1]!;

  it('rejects holes without changing state, score or history', () => {
    const hole = def.mask.indexOf('.');
    const s0 = createInitialState(def);
    const r = applyCommand(def, s0, rotate({ origin: hole, axis: 'row', direction: 1 }));
    expect(r.accepted).toBe(false);
    expect(r.reason).toBe('immobile');
    expect(r.state).toBe(s0);
  });

  it('rejects no-op rotations (identical letters) without counting a move', () => {
    const syn = syntheticLevel(
      ['AAA.CGTAC', ...Array(8).fill('CGTACGTAC')],
      ['AAA.GCTAC', ...Array(8).fill('CGTACGTAC')],
      [4, 5],
      'GC',
    );
    const s0 = createInitialState(syn);
    const r = applyCommand(syn, s0, rotate({ origin: 0, axis: 'row', direction: 1 }));
    expect(r.accepted).toBe(false);
    expect(r.reason).toBe('no-op');
    expect(r.state.moves).toBe(0);
    expect(r.state.history).toHaveLength(0);
  });

  it('a move followed by its inverse restores the board; undo restores the exact previous state', () => {
    const s0 = createInitialState(def);
    const m: Move = { origin: def.tracks[0]!.cells[0]!, axis: 'row', direction: 1 };
    const s1 = applyCommand(def, s0, rotate(m)).state;
    expect(s1.moves).toBe(1);
    const back = applyCommand(def, s1, rotate({ ...m, direction: -1 })).state;
    expect(back.board).toBe(s0.board);
    const undone = applyCommand(def, s1, { type: 'undo' });
    expect(undone.accepted).toBe(true);
    expect(undone.state.board).toBe(s0.board);
    expect(undone.state.moves).toBe(0);
    expect(undone.state.recovery).toEqual(s0.recovery);
    expect(applyCommand(def, undone.state, { type: 'undo' }).reason).toBe('no-history');
  });

  it('restart returns to the immutable initial board', () => {
    const s = play(def, [{ origin: def.tracks[0]!.cells[0]!, axis: 'row', direction: 1 }, { origin: def.tracks[0]!.cells[3]!, axis: 'col', direction: -1 }]);
    const r = applyCommand(def, s, { type: 'restart' });
    expect(r.state).toEqual(createInitialState(def));
  });

  it('caps undo history', () => {
    const m: Move = { origin: def.tracks[0]!.cells[0]!, axis: 'row', direction: 1 };
    const s = play(def, Array(HISTORY_CAP + 20).fill(m));
    expect(s.history.length).toBe(HISTORY_CAP);
  });

  it('target match completes the level, emits solved once, and makes it read-only', () => {
    const s0 = createInitialState(def);
    let s = s0;
    const events: string[] = [];
    for (const m of def.certificate) {
      const r = applyCommand(def, s, rotate(m));
      expect(r.accepted).toBe(true);
      events.push(...r.events.map((e) => e.type));
      s = r.state;
    }
    expect(s.status).toBe('solved');
    expect(events.filter((e) => e === 'solved')).toHaveLength(1);
    expect(applyCommand(def, s, rotate(def.certificate[0]!)).reason).toBe('solved');
    expect(applyCommand(def, s, { type: 'undo' }).reason).toBe('solved');
    expect(applyCommand(def, s, { type: 'restart' }).state.status).toBe('playing');
  });

  it('rejects commands for a different level', () => {
    expect(applyCommand(LEVELS[0]!, createInitialState(def), { type: 'undo' }).reason).toBe('wrong-level');
  });
});

describe('certified recovery hint', () => {
  it.each(LEVELS.map((l) => [l.id, l] as const))('%s: following hints from the start solves the level', (_id, def) => {
    let s = createInitialState(def);
    for (let i = 0; i < 50 && s.status === 'playing'; i++) {
      const h = recoveryHint(def, s);
      expect(h).not.toBeNull();
      s = applyCommand(def, s, rotate(h!)).state;
    }
    expect(s.status).toBe('solved');
  });

  it('after arbitrary detours, hints still lead to a solution and are legal in the current state', () => {
    for (const def of LEVELS) {
      let s = createInitialState(def);
      const detour: Move[] = [
        { origin: def.tracks[0]!.cells[2]!, axis: 'row', direction: 1 },
        { origin: def.tracks[0]!.cells[4]!, axis: 'col', direction: -1 },
        { origin: def.tracks[0]!.cells[2]!, axis: 'row', direction: 1 },
      ];
      for (const m of detour) {
        const r = applyCommand(def, s, rotate(m));
        if (r.accepted) s = r.state;
        if (s.status === 'solved') break;
      }
      for (let i = 0; i < 80 && s.status === 'playing'; i++) {
        const h = recoveryHint(def, s)!;
        expect(applyMove(def.mask, s.board, h).changed).toBe(true);
        s = applyCommand(def, s, rotate(h)).state;
      }
      expect(s.status).toBe('solved');
    }
  });

  it('cycles collapse: rotating a segment full circle returns the recovery path to its prior length', () => {
    const def = LEVELS[2]!;
    const s0 = createInitialState(def);
    const origin = def.tracks[0]!.cells[0]!;
    const axis = def.tracks[0]!.orientation === 'vertical' ? 'col' : 'row';
    let s = s0;
    for (let i = 0; i < 9; i++) s = applyCommand(def, s, rotate({ origin, axis, direction: 1 })).state;
    if (s.status === 'playing') expect(s.recovery).toEqual(s0.recovery);
  });

  it('no hint once solved', () => {
    const def = LEVELS[0]!;
    const s = play(def, def.certificate);
    expect(recoveryHint(def, s)).toBeNull();
  });
});

describe('certificates', () => {
  it.each(LEVELS.map((l) => [l.id, l] as const))('%s: certificate replays to a win without powers', (_id, def) => {
    const r = replayCertificate(def);
    expect(r.valid).toBe(true);
    expect(r.solved).toBe(true);
    expect(isSolved(def, def.initial)).toBe(false);
  });
  it('a corrupted certificate is detected', () => {
    const def = LEVELS[1]!;
    const bad = def.certificate.slice(0, -1);
    expect(replayCertificate(def, bad).solved).toBe(false);
    expect(replayCertificate(def, [{ origin: def.mask.indexOf('.'), axis: 'row', direction: 1 }]).valid).toBe(false);
    expect(cellAt(0, 0)).toBe(0);
  });
});

describe('recoverySlideHint (M2)', () => {
  it('following slide hints from the start solves every pinned level in exactly its drag certificate length', async () => {
    const { LEVELS } = await import('../../src/campaign/campaign.ts');
    const { recoverySlideHint, applyCommand: apply, createInitialState: init } = await import('../../src/engine/engine.ts');
    for (const def of LEVELS) {
      let s = init(def);
      let drags = 0;
      while (s.status === 'playing' && drags < 20) {
        const h = recoverySlideHint(def, s)!;
        expect(h).not.toBeNull();
        s = apply(def, s, { type: 'slide', ...h }).state;
        drags++;
      }
      expect(s.status).toBe('solved');
      expect(drags).toBe(def.certificateSlides.length);
    }
  });
  it('after a wrong drag the hint undoes it, then resumes the certificate', async () => {
    const { LEVELS } = await import('../../src/campaign/campaign.ts');
    const { recoverySlideHint, applyCommand: apply, createInitialState: init } = await import('../../src/engine/engine.ts');
    const def = LEVELS[4]!;
    const first = recoverySlideHint(def, init(def))!;
    const wrongAxis = first.axis === 'row' ? 'col' : 'row';
    let origin = -1;
    for (let c = 0; c < 81 && origin < 0; c++) if (def.mask[c] === '#' && apply(def, init(def), { type: 'slide', origin: c, axis: wrongAxis, steps: 1 }).accepted) origin = c;
    const s = apply(def, init(def), { type: 'slide', origin, axis: wrongAxis, steps: 1 }).state;
    const h = recoverySlideHint(def, s)!;
    expect(h.axis).toBe(wrongAxis);
    expect(h.steps).toBe(-1);
    const back = apply(def, s, { type: 'slide', ...h }).state;
    expect(back.board).toBe(def.initial);
    expect(recoverySlideHint(def, back)).toEqual(first);
  });
  it('returns null once solved', async () => {
    const { LEVELS } = await import('../../src/campaign/campaign.ts');
    const { recoverySlideHint, createInitialState: init } = await import('../../src/engine/engine.ts');
    const def = LEVELS[0]!;
    expect(recoverySlideHint(def, { ...init(def), board: def.solved, status: 'solved', recovery: [] })).toBeNull();
  });
});
