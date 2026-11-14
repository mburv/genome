import { describe, expect, it } from 'vitest';
import { applyCommand, createInitialState } from '../../src/engine/engine.ts';
import { LEVEL_PACK, LEVELS } from '../../src/campaign/campaign.ts';
import {
  createMemoryAdapter, isBetterResult, loadSave, newSave, recordBest, recordCompletion,
  serializeSave, solvedDisplayState,
} from '../../src/persistence/save.ts';
import { parMoves, starsFor } from '../../src/persistence/score.ts';

const def = LEVELS[0]!;

function solvedAttempt() {
  let s = createInitialState(def);
  for (const slide of def.certificateSlides) s = applyCommand(def, s, { type: 'slide', ...slide }).state;
  if (s.status !== 'solved') throw new Error('certificate did not solve');
  return s;
}

describe('best score', () => {
  it('recordBest keeps the lower move count and never drops a previous best', () => {
    let save = recordBest(newSave(LEVEL_PACK), def.id, { moves: 5, powersUsed: 1 });
    expect(save.best[def.id]).toEqual({ moves: 5, powersUsed: 1 });
    save = recordBest(save, def.id, { moves: 8, powersUsed: 0 });
    expect(save.best[def.id]).toEqual({ moves: 5, powersUsed: 1 });
    save = recordBest(save, def.id, { moves: 3, powersUsed: 2 });
    expect(save.best[def.id]).toEqual({ moves: 3, powersUsed: 2 });
  });

  it('same moves with fewer powers replaces the best; a worse or unknown power count does not', () => {
    let save = recordBest(newSave(LEVEL_PACK), def.id, { moves: 4, powersUsed: 2 });
    save = recordBest(save, def.id, { moves: 4, powersUsed: 1 });
    expect(save.best[def.id]).toEqual({ moves: 4, powersUsed: 1 });
    save = recordBest(save, def.id, { moves: 4, powersUsed: 3 });
    expect(save.best[def.id]).toEqual({ moves: 4, powersUsed: 1 });
    save = recordBest(save, def.id, { moves: 4 });
    expect(save.best[def.id]).toEqual({ moves: 4, powersUsed: 1 });
  });

  it('fills in powersUsed on a legacy backfill with the same move count', () => {
    let save = recordBest(newSave(LEVEL_PACK), def.id, { moves: 3 });
    expect(save.best[def.id]).toEqual({ moves: 3 });
    save = recordBest(save, def.id, { moves: 3, powersUsed: 0 });
    expect(save.best[def.id]).toEqual({ moves: 3, powersUsed: 0 });
  });

  it('isBetterResult prefers fewer moves, then fewer powers', () => {
    expect(isBetterResult({ moves: 2 }, { moves: 3 })).toBe(true);
    expect(isBetterResult({ moves: 3 }, { moves: 2 })).toBe(false);
    expect(isBetterResult({ moves: 3, powersUsed: 0 }, { moves: 3, powersUsed: 1 })).toBe(true);
    expect(isBetterResult({ moves: 3, powersUsed: 1 }, { moves: 3 })).toBe(false);
  });

  it('recordCompletion stays idempotent and is independent of recordBest', () => {
    let save = recordCompletion(newSave(LEVEL_PACK), def.id);
    save = recordBest(save, def.id, { moves: 4, powersUsed: 0 });
    save = recordCompletion(save, def.id);
    save = recordBest(save, def.id, { moves: 6, powersUsed: 0 });
    expect(save.completed).toEqual([def.id]);
    expect(save.best[def.id]).toEqual({ moves: 4, powersUsed: 0 });
  });

  it('a v4 save without a best field loads as {} and is backfilled from a solved attempt', () => {
    const attempt = solvedAttempt();
    const raw = { ...newSave(LEVEL_PACK), completed: [def.id], attempts: { [def.id]: attempt } };
    const withoutBest = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
    delete withoutBest.best;
    const loaded = loadSave(createMemoryAdapter(JSON.stringify(withoutBest)), LEVEL_PACK).save;
    expect(loaded.completed).toEqual([def.id]);
    expect(loaded.best[def.id]).toEqual({ moves: attempt.moves });
  });

  it('stored best survives reload and is not replaced by a worse solved attempt', () => {
    const attempt = { ...solvedAttempt(), moves: 6 };
    let save = recordCompletion(newSave(LEVEL_PACK), def.id);
    save = recordBest(save, def.id, { moves: 2, powersUsed: 0 });
    save = { ...save, attempts: { [def.id]: attempt } };
    const loaded = loadSave(createMemoryAdapter(serializeSave(save)), LEVEL_PACK).save;
    expect(loaded.best[def.id]).toEqual({ moves: 2, powersUsed: 0 });
  });

  it('invalid and unknown best entries are dropped; a restart does not clear a stored best', () => {
    const save = {
      ...newSave(LEVEL_PACK),
      completed: [def.id],
      best: { [def.id]: { moves: 3, powersUsed: 0 }, bogus: { moves: 1 }, [LEVELS[1]!.id]: { moves: -1 } },
    };
    const loaded = loadSave(createMemoryAdapter(JSON.stringify(save)), LEVEL_PACK).save;
    expect(loaded.best).toEqual({ [def.id]: { moves: 3, powersUsed: 0 } });
  });

  it('solvedDisplayState shows the solved board without inventing a stored attempt', () => {
    const state = solvedDisplayState(def, { moves: 4, powersUsed: 0 });
    expect(state.status).toBe('solved');
    expect(state.board).toBe(def.solved);
    expect(state.moves).toBe(4);
    expect(state.history).toEqual([]);
  });
});

describe('stars and par', () => {
  it('uses the proven optimum when the solver found one, otherwise the certificate length', () => {
    const optimal = { ...def, metrics: { ...def.metrics, certificateDrags: 5, solver: { ...def.metrics.solver, status: 'optimal' as const, optimal: 2, lowerBound: 2 } } };
    const unknownSolver = { status: 'unknown' as const, lowerBound: 0, nodes: 0, budget: def.metrics.solver.budget };
    const unknown = { ...def, metrics: { ...def.metrics, certificateDrags: 5, solver: unknownSolver } };
    expect(parMoves(optimal)).toBe(2);
    expect(parMoves(unknown)).toBe(5);
  });

  it('awards 3 / 2 / 1 stars from par', () => {
    expect(starsFor(1, 1)).toBe(3);
    expect(starsFor(3, 3)).toBe(3);
    expect(starsFor(5, 3)).toBe(2);
    expect(starsFor(6, 4)).toBe(2);
    expect(starsFor(7, 4)).toBe(1);
    expect(starsFor(10, 2)).toBe(1);
  });
});
