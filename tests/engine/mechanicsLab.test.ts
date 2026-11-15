import { describe, expect, test } from 'vitest';
import { applyLab, createLab, traceHintCell, connectionHint, findCrushSwap, DEFAULT_LAB_SPEC, LAB_IDS, TRACE_PATH, TRACE_TARGET, CRUSH_SWAPS, CRUSH_TARGETS, READ_STARTS, ASSEMBLY_CELLS, ASSEMBLY_TARGET, MUTATIONS, mutationExpected, mutationCount, CONNECTION_ROUTES, CUT_SITES, CUT_SOLUTION, CUT_STRANDS, CUT_SEQUENCES, CUT_TARGET, type LabAction, type LabState } from '../../src/engine/mechanicsLab.ts';
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
    expect(start.trace).toEqual(TRACE_PATH.slice(0,2));
    expect(start.moves).toBe(0);
    expect(applyLab(start, { type: 'trace', cell: TRACE_PATH[0] }).state).toBe(start);
    expect(applyLab(start, { type: 'trace', cell: TRACE_PATH[1] }).state).toBe(start);
    expect(applyLab(start, { type: 'trace', cell: 80 }).state).toBe(start);
    const third = applyLab(start, { type: 'trace', cell: TRACE_PATH[2] }).state;
    expect(third.trace).toEqual(TRACE_PATH.slice(0,3));
    expect(applyLab(third, { type: 'trace', cell: TRACE_PATH[1] }).state.trace).toEqual(start.trace);
    const solved = run('trace', TRACE_PATH.slice(2).map(cell => ({ type: 'trace', cell })));
    expect(solved.won).toBe(true);
    expect(solved.moves).toBe(TRACE_PATH.length-2);
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
    const wrong = applyLab(createLab('trace', spec, false),{type:'trace',cell:9}).state;
    expect(traceHintCell(wrong)).toBe(9);
    const cleared = applyLab(wrong,{type:'trace',cell:9}).state;
    expect(cleared.trace).toEqual([]);
    expect(traceHintCell(cleared)).toBe(10);
    expect(traceHintCell(start)).toBe(12);
    expect(applyLab(wrong,{type:'trace',cell:80}).state).toBe(wrong);
  });
});


describe('graphical connection hints', () => {
  const route = (state: LabState, pair: number, cells: number[]) => cells.reduce((s,cell)=>applyLab(s,{type:'route',pair,cell}).state,state);
  const follow = (initial: LabState, selected: number | null = null) => {
    let state=initial;
    for(let i=0;i<100&&!state.won;i++){
      const hint=connectionHint(state,selected);
      expect(hint).not.toBeNull();
      const next=applyLab(state,{type:'route',...hint!}).state;
      expect(next).not.toBe(state);
      expect(next.routes).not.toEqual(state.routes);
      state=next;selected=hint!.pair;
    }
    expect(state.won).toBe(true);
    expect(connectionHint(state)).toBeNull();
    return state;
  };
  test('starts a pair, follows the current route, and advances to the next pair',()=>{
    const start=createLab('connections');
    expect(connectionHint(start)).toEqual({pair:0,cell:1});
    const second=route(start,1,[27,28]);
    expect(connectionHint(second,1)).toEqual({pair:1,cell:29});
    expect(connectionHint(route(start,0,[...CONNECTION_ROUTES[0]]),0)).toEqual({pair:1,cell:27});
    follow(start);follow(second,1);
  });
  test('continues a viable alternate path, backtracks a dead end and frees a blocked corridor',()=>{
    const start=createLab('connections');
    const alternate=route(start,0,[1,2,3,4,5,6,15,24]);
    expect(connectionHint(alternate,0)).toEqual({pair:0,cell:25});
    follow(alternate,0);
    const dead=route(start,1,[27,28,29,38,37,36]);
    expect(dead.routes[1]!.at(-1)).toBe(36);
    expect(connectionHint(dead,1)).toEqual({pair:1,cell:37});
    follow(dead,1);
    const blocked=route(start,0,[1,2,3,4,5,6,7,8,17,26,35,44]);
    expect(blocked.routes[0]!.at(-1)).toBe(44);
    expect(connectionHint(blocked,0)).toEqual({pair:0,cell:1});
    follow(blocked,0);
  });
});


describe('graphical Codon Crush hints',()=>{
  test('hints suggest certified swaps that finish the exact target',()=>{
    const spec={...DEFAULT_LAB_SPEC,CRUSH_TARGETS:INS.sequence.slice(33,42).match(/.{3}/g)!,crushHoles:[...DEFAULT_LAB_SPEC.crushHoles,54]};
    for(const s of [DEFAULT_LAB_SPEC,spec]){
      let state=createLab('crush',s);
      for(const [a,b] of CRUSH_SWAPS){
        expect(findCrushSwap(state)).toEqual([a,b]);
        state=applyLab(state,{type:'swap',a,b}).state;
      }
      expect(state.won).toBe(true);
      expect(findCrushSwap(state)).toBeNull();
    }
  });
  test('never suggests a stale or nonmatching swap on a dead board',()=>{
    const state=createLab('crush');
    const dead={...state,board:state.board.map(b=>b==='.'?'.':'A')};
    expect(findCrushSwap(dead)).toBeNull();
  });
  test('a different accepted first swap is followed by a legal solution or recovery',()=>{
    const start=createLab('crush');
    let alternate:LabState|null=null;
    for(let a=0;a<81&&!alternate;a++)for(const b of [a+1,a+9]){
      if(a===12&&b===13)continue;
      const result=applyLab(start,{type:'swap',a,b}).state;
      if(result!==start){alternate=result;break;}
    }
    expect(alternate).not.toBeNull();
    let state=alternate!;
    for(let i=0;i<2&&!state.won;i++){
      const next=findCrushSwap(state);
      if(!next)break;
      const result=applyLab(state,{type:'swap',a:next[0],b:next[1]}).state;
      expect(result.collected).toBe(state.collected+1);
      state=result;
    }
    expect(state.won||findCrushSwap(state)===null).toBe(true);
  });
});
