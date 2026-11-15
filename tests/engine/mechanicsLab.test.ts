import { describe, expect, test } from 'vitest';
import { applyLab, createLab, traceHintCell, DEFAULT_LAB_SPEC, LAB_IDS, TRACE_PATH, TRACE_TARGET, CRUSH_SWAPS, CRUSH_TARGETS, READ_STARTS, ASSEMBLY_CELLS, ASSEMBLY_TARGET, MUTATIONS, mutationExpected, mutationCount, CONNECTION_ROUTES, CUT_SITES, CUT_SOLUTION, CUT_STRANDS, CUT_SEQUENCES, CUT_TARGET, type LabAction, type LabState } from '../../src/engine/mechanicsLab.ts';
import { INS } from '../../src/genomics/genes.ts';

const run = (id: typeof LAB_IDS[number], actions: LabAction[]): LabState => actions.reduce((state, action) => applyLab(state, action).state, createLab(id));

describe('Mechanics Lab', () => {
  test('all six unique 9×9 masks start unsolved and use verified INS DNA', () => {
    const masks = LAB_IDS.map(id => {
      const state = createLab(id);
      expect(state.board).toHaveLength(81);
      expect(state.won).toBe(false);
      return state.board.map(b => b === '.' ? '.' : '#').join('');
    });
    expect(new Set(masks).size).toBe(6);
    expect(TRACE_TARGET).toBe(INS.sequence.slice(0, 9));
    expect(CRUSH_TARGETS.join('')).toBe(TRACE_TARGET);
    expect(CUT_TARGET).toBe(INS.sequence.slice(212, 241));
  });
  test('tracing rejects holes, wrong starts and reused cells; a real path wins', () => {
    const start = createLab('trace');
    expect(applyLab(start, { type: 'trace', cell: 0 }).state).toBe(start);
    const first = applyLab(start, { type: 'trace', cell: TRACE_PATH[0] }).state;
    expect(applyLab(first, { type: 'trace', cell: 80 }).state).toBe(first);
    const second = applyLab(first, { type: 'trace', cell: TRACE_PATH[1] }).state;
    expect(applyLab(second, { type: 'trace', cell: TRACE_PATH[0] }).state.trace).toEqual([TRACE_PATH[0]]);
    expect(run('trace', TRACE_PATH.map(cell => ({ type: 'trace', cell }))).won).toBe(true);
  });
  test('codon swaps are adjacent, clear three cells, refill deterministically and preserve holes', () => {
    let state = createLab('crush');
    expect(applyLab(state, { type: 'swap', a: 0, b: 1 }).state).toBe(state);
    expect(applyLab(state, { type: 'swap', a: 10, b: 40 }).state).toBe(state);
    const mask = state.board.map(b => b === '.');
    CRUSH_SWAPS.forEach(([a, b], i) => {
      const result = applyLab(state, { type: 'swap', a, b });
      const next = result.state;
      const frame = result.crush!;
      expect(frame.matched.map(c => frame.swapped[c]).join('')).toBe(CRUSH_TARGETS[i]);
      expect(frame.falls.filter(f => f.from === null).map(f => f.to)).toEqual(next.fresh);
      for (const fall of frame.falls) {
        if (fall.from !== null) {
          expect(next.board[fall.to]).toBe(frame.swapped[fall.from]);
          expect(fall.to - fall.from).toBe(fall.rows * 9);
          for (let c = fall.from; c <= fall.to; c += 9) expect(state.board[c]).not.toBe('.');
        }
      }
      expect(next.collected).toBe(i + 1);
      expect(next.refill).toBe(3 * (i + 1));
      expect(next.board.map(b => b === '.')).toEqual(mask);
      expect(next.board.filter(b => b !== '.').every(b => /^[ACGT]$/.test(b))).toBe(true);
      state = next;
    });
    expect(state.won).toBe(true);
  });
  test('assembly checks overlaps and the exact reference before completing', () => {
    let state = createLab('assembly');
    state = applyLab(state, { type: 'place', read: 1, offset: 0 }).state;
    expect(applyLab(state, { type: 'place', read: 0, offset: 0 }).state).toBe(state);
    expect(applyLab(state, { type: 'place', read: 0, offset: 8 }).state).toBe(state);
    state = run('assembly', READ_STARTS.map((offset, read) => ({ type: 'place', read, offset })));
    expect(state.won).toBe(true);
    expect(ASSEMBLY_CELLS.map(c => state.board[c]).join('')).toBe(ASSEMBLY_TARGET);
  });
  test('mutation edits only lower strands and all five reference mismatches can be repaired', () => {
    const start = createLab('mutation');
    expect(mutationCount(start.board)).toBe(MUTATIONS.length);
    expect(applyLab(start, { type: 'edit', cell: 10, base: 'A' }).state).toBe(start);
    const state = run('mutation', MUTATIONS.map(cell => ({ type: 'edit', cell, base: mutationExpected(cell)! })));
    expect(mutationCount(state.board)).toBe(0);
    expect(state.won).toBe(true);
  });
  test('connections reject crossing paths and route all complementary pairs', () => {
    let state = createLab('connections');
    state = applyLab(state, { type: 'route', pair: 0, cell: 1 }).state;
    expect(applyLab(state, { type: 'route', pair: 0, cell: 9 }).state).toBe(state);
    state = run('connections', CONNECTION_ROUTES.flatMap((route, pair) => route.map(cell => ({ type: 'route', pair, cell }))));
    expect(state.won).toBe(true);
    expect(new Set(state.routes.flat()).size).toBe(state.routes.flat().length);
    const partial = run('connections', [{ type: 'route', pair: 1, cell: 27 }, { type: 'route', pair: 1, cell: 28 }, { type: 'route', pair: 1, cell: 29 }, { type: 'route', pair: 0, cell: 1 }, { type: 'route', pair: 0, cell: 2 }]);
    expect(applyLab(partial, { type: 'route', pair: 0, cell: 29 }).state).toBe(partial);
  });
  test('restriction cuts only at GG|CC, with an exact isolated reference fragment', () => {
    const start = createLab('restriction');
    expect(CUT_SITES).toHaveLength(3);
    expect(applyLab(start, { type: 'cut', cell: CUT_STRANDS[0]![0]! }).state).toBe(start);
    const decoy = CUT_SITES.find(c => !CUT_SOLUTION.includes(c))!;
    const wrong = run('restriction', [{ type: 'cut', cell: decoy }, { type: 'cut', cell: CUT_SOLUTION[0]! }]);
    expect(wrong.won).toBe(false);
    expect(applyLab(wrong, { type: 'cut', cell: CUT_SOLUTION[1]! }).state).toBe(wrong);
    const state = run('restriction', CUT_SOLUTION.map(cell => ({ type: 'cut', cell })));
    expect(state.won).toBe(true);
    const strand = CUT_STRANDS[0]!;
    expect(CUT_SEQUENCES[0]!.slice(strand.indexOf(CUT_SOLUTION[0]!) + 1, strand.indexOf(CUT_SOLUTION[1]!) + 1)).toBe(CUT_TARGET);
  });
});

describe('graphical tracing recovery', () => {
  const spec = { ...DEFAULT_LAB_SPEC, TRACE_TARGET: INS.sequence.slice(9,18), traceHoles: [0,8,18,28,52,72,79,80] };
  const start = createLab('trace', spec);
  const trace = (cells: number[]) => cells.reduce((s,cell)=>applyLab(s,{type:'trace',cell}).state,start);
  test('hints follow an alternate valid prefix and complete without backtracking', () => {
    let state = trace([10,11,20]);
    expect(traceHintCell(state)).not.toBeNull();
    while (!state.won) {
      const cell = traceHintCell(state)!;
      const next = applyLab(state,{type:'trace',cell}).state;
      expect(next.trace.length).toBe(state.trace.length+1);
      state = next;
    }
    expect(traceHintCell(state)).toBeNull();
  });
  test('dead-end hint backtracks to a viable prefix and singleton hint clears the wrong start', () => {
    const dead = trace([10,11,12,13]);
    expect(traceHintCell(dead)).toBe(12);
    const recovered = applyLab(dead,{type:'trace',cell:12}).state;
    expect(traceHintCell(recovered)).toBe(21);
    const wrong = trace([9]);
    expect(traceHintCell(wrong)).toBe(9);
    const cleared = applyLab(wrong,{type:'trace',cell:9}).state;
    expect(cleared.trace).toEqual([]);
    expect(traceHintCell(cleared)).toBe(10);
    expect(applyLab(wrong,{type:'trace',cell:80}).state).toBe(wrong);
  });
});
