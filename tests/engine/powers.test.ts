import { describe, expect, it } from 'vitest';
import { applyCommand, createInitialState, energyOf, fullHint, certifiedHint, isSolved, levelCodons, segmentIn, type Command, type PuzzleState } from '../../src/engine/engine.ts';
import { ENERGY_CAP, POWER_COST, powersEnabled, scaffoldCandidates, scaffoldTrack, SCAFFOLD_TURNS, START_ENERGY } from '../../src/engine/powers.ts';
import { searchSolution } from '../../src/engine/search.ts';
import { ALL_LEVELS, LAB_LEVELS, INTRO_LEVELS as LEVELS, CAMPAIGN_LEVELS, CHAPTER_LEVELS, OPENING_LEVEL_ID } from '../../src/campaign/campaign.ts';
import { createRng } from '../../src/generator/rng.ts';
import type { Base, LevelDefinition } from '../../src/engine/types.ts';
import { syntheticLevel } from '../helpers.ts';

/** Synthetic lab bench (synthetic letters, NOT reference DNA). Row 0 has a one-hole gap at column 5. */
const ROWS = [
  'ACGTA.CGT',
  'TTTTTTTTT',
  'GGGGGGGGG',
  'GATGCCCTG',
  'CCCCCCCCC',
  'AAAAAAAAA',
  'TTTTTTTTT',
  'GCGCGCGCG',
  'ACGTACGTA',
];
function bench(over: Partial<LevelDefinition> = {}, rows = ROWS): LevelDefinition {
  const base = syntheticLevel(rows, rows, [27, 28, 29, 30, 31, 32], 'ATGCCC');
  return {
    ...base,
    index: 5,
    tracks: [
      base.tracks[0]!,
      { group: 2, cells: [63, 64, 65], expected: 'TTT', orientation: 'horizontal', strand: 'coding', readDirection: '5to3', source: { start: 6, end: 9 } },
    ],
    ...over,
  };
}
const run = (def: LevelDefinition, s: PuzzleState, c: Command) => applyCommand(def, s, c);
const ok = (def: LevelDefinition, s: PuzzleState, c: Command): PuzzleState => {
  const r = run(def, s, c);
  expect(r.accepted, `${c.type} rejected: ${r.reason}`).toBe(true);
  return r.state;
};
const rejected = (def: LevelDefinition, s: PuzzleState, c: Command, reason: string) => {
  const r = run(def, s, c);
  expect(r.accepted).toBe(false);
  expect(r.reason).toBe(reason);
  expect(r.state).toBe(s); // invalid actions are free: identical state object
  expect(r.events).toEqual([]);
};
const rowLeft = { type: 'rotate', move: { origin: 27, axis: 'row', direction: -1 } } as const;

describe('availability and costs', () => {
  it('powers are off only on the opening 1-base puzzle, and on for every later intro, chapter and lab', () => {
    const opening = CAMPAIGN_LEVELS.find((l) => l.id === OPENING_LEVEL_ID)!;
    expect(opening.id).toBe('ins-01');
    expect(powersEnabled(opening)).toBe(false);
    expect(CAMPAIGN_LEVELS.filter((l) => l.id !== OPENING_LEVEL_ID).every(powersEnabled)).toBe(true);
    expect(CHAPTER_LEVELS.every(powersEnabled)).toBe(true);
    expect(LAB_LEVELS.map((l) => l.lab)).toEqual(['crispr', 'ligase', 'scaffold']);
    expect(LAB_LEVELS.every(powersEnabled)).toBe(true);
    const s = createInitialState(opening);
    rejected(opening, s, { type: 'edit', cell: opening.mask.indexOf('#'), base: 'A' }, 'powers-unavailable');
  });
  it('uses the GDD costs, start energy and cap', () => {
    expect(POWER_COST).toEqual({ crispr: 4, ligase: 2, scaffold: 3 });
    expect(START_ENERGY).toBe(2);
    expect(ENERGY_CAP).toBe(9);
    expect(SCAFFOLD_TURNS).toBe(3);
    expect(energyOf(createInitialState(bench()))).toBe(2);
  });
  it('an unaffordable power is rejected and costs nothing', () => {
    const def = bench();
    const s = createInitialState(def);
    rejected(def, s, { type: 'edit', cell: 63, base: 'T' }, 'energy');
    rejected(def, s, { type: 'scaffold', axis: 'row', gap: [5] }, 'energy');
  });
  it('lab levels lend exactly one free use of their power', () => {
    const def = bench({ lab: 'crispr' });
    let s = createInitialState(def);
    expect(s.freeUses).toEqual(['crispr']);
    s = ok(def, s, { type: 'edit', cell: 63, base: 'T' });
    expect(energyOf(s)).toBe(2);
    expect(s.freeUses).toEqual([]);
    rejected(def, s, { type: 'edit', cell: 64, base: 'T' }, 'energy');
  });
});

describe('energy ledger (non-farmable)', () => {
  it('earns +1 per reference codon first completed by a normal move; initial matches are ineligible', () => {
    const def = bench();
    const s0 = createInitialState(def);
    const r = run(def, s0, rowLeft);
    expect(r.state.board.slice(27, 33)).toBe('ATGCCC');
    expect(r.events).toContainEqual({ type: 'energy', gained: 2, codons: 2 });
    expect(energyOf(r.state)).toBe(4);
    const rows = [...ROWS];
    rows[3] = 'ATGCCCCTG'; // both codons already correct at the start
    const def2 = bench({}, rows);
    expect(createInitialState(def2).ledger.credited.sort()).toEqual(['c0', 'c3']);
  });
  it('undo keeps earned energy but the same codon can never pay twice', () => {
    const def = bench();
    let s = ok(def, createInitialState(def), rowLeft);
    s = ok(def, s, { type: 'undo' });
    expect(s.board).toBe(def.initial);
    expect(energyOf(s)).toBe(4);
    const again = run(def, s, rowLeft);
    expect(again.events.some((e) => e.type === 'energy')).toBe(false);
    expect(energyOf(again.state)).toBe(4);
    // break and re-complete repeatedly: still nothing
    let t = again.state;
    for (let i = 0; i < 4; i++) {
      t = ok(def, t, { type: 'rotate', move: { origin: 27, axis: 'row', direction: 1 } });
      t = ok(def, t, rowLeft);
    }
    expect(t.ledger.earned).toBe(2);
  });
  it('undo of a power refunds it exactly; restart is a fresh attempt with a fresh ledger', () => {
    const def = bench();
    let s = ok(def, createInitialState(def), rowLeft); // 4 energy
    s = ok(def, s, { type: 'bond', cell: 27 });
    expect(energyOf(s)).toBe(2);
    s = ok(def, s, { type: 'undo' });
    expect(energyOf(s)).toBe(4);
    expect(s.locks).toEqual([]);
    s = ok(def, s, { type: 'restart' });
    expect(energyOf(s)).toBe(2);
    expect(s.ledger.earned).toBe(0);
    expect(s.history).toEqual([]);
  });
  it('the complementary strand never earns energy', () => {
    const def = bench();
    const comp = { ...def, tracks: [{ ...def.tracks[0]!, strand: 'complement' as const, readDirection: '3to5' as const }, def.tracks[1]!] };
    const r = run(comp, createInitialState(comp), rowLeft);
    expect(r.events.some((e) => e.type === 'energy' && e.gained > 0)).toBe(false);
    expect(levelCodons(comp).filter((c) => c.rewardable).map((c) => c.key)).toEqual(['c6']);
  });
  it('the cap at 9 discards excess energy', () => {
    const rows = [...ROWS];
    rows[3] = 'GATGCCCTG';
    const def = bench({ tracks: [{ group: 1, cells: [27, 28, 29, 30, 31, 32, 33, 34, 35], expected: 'ATGCCCTGG', orientation: 'horizontal', strand: 'coding', readDirection: '5to3', source: { start: 0, end: 9 } }] }, rows);
    const s = createInitialState(def);
    const forced = { ...s, ledger: { earned: 6, credited: s.ledger.credited } }; // 8 available
    const r = run(def, forced, rowLeft);
    expect(r.events).toContainEqual({ type: 'energy', gained: 1, codons: 3 });
    expect(energyOf(r.state)).toBe(9);
  });
});

describe('CRISPR (cost 4)', () => {
  const funded = (def: LevelDefinition) => ({ ...createInitialState(def), ledger: { earned: 2, credited: createInitialState(def).ledger.credited } });
  it('replaces exactly one unlocked tile; a same-base edit is a free no-op', () => {
    const def = bench();
    const s = funded(def);
    rejected(def, s, { type: 'edit', cell: 63, base: 'G' }, 'same-base');
    rejected(def, s, { type: 'edit', cell: 5, base: 'A' }, 'invalid-target'); // hole
    rejected(def, s, { type: 'edit', cell: 63, base: 'X' as Base }, 'invalid-target');
    const r = run(def, s, { type: 'edit', cell: 63, base: 'T' });
    expect(r.accepted).toBe(true);
    const diff = [...r.state.board].filter((ch, i) => ch !== s.board[i]);
    expect(diff).toEqual(['T']);
    expect(energyOf(r.state)).toBe(0);
    expect(r.state.moves).toBe(1);
    expect(r.state.recovery).toBeNull();
    expect(r.state.edits).toBe(1);
  });
  it('a codon completed by CRISPR is never rewarded later', () => {
    const rows = [...ROWS];
    rows[7] = 'TTGCGCGCG';
    const def = bench({ lab: 'crispr' }, rows);
    let s = ok(def, createInitialState(def), { type: 'edit', cell: 65, base: 'T' });
    expect(s.ledger.credited).toContain('c6');
    s = ok(def, s, { type: 'rotate', move: { origin: 63, axis: 'row', direction: 1 } });
    s = ok(def, s, { type: 'rotate', move: { origin: 63, axis: 'row', direction: -1 } });
    expect(s.ledger.earned).toBe(0);
  });
  it('cannot edit a bonded tile', () => {
    const def = bench();
    let s = ok(def, funded(def), rowLeft);
    s = ok(def, s, { type: 'bond', cell: 28 });
    rejected(def, s, { type: 'edit', cell: 27, base: 'C' }, 'locked');
  });
  it('recovery from a bad edit: undo restores the certified hint; hints alone then reach the win', () => {
    const def = LAB_LEVELS.find((l) => l.lab === 'crispr')!;
    const s0 = createInitialState(def);
    // Sabotage: overwrite an already-correct target tile, or any target tile, with a wrong base.
    const t = def.tracks[0]!;
    const i = t.cells.findIndex((c, k) => s0.board[c] === t.expected[k]);
    const cell = t.cells[i >= 0 ? i : 0]!;
    const wrong = (['A', 'C', 'G', 'T'] as Base[]).find((b) => b !== s0.board[cell] && b !== t.expected[i >= 0 ? i : 0])!;
    const bad = ok(def, s0, { type: 'edit', cell, base: wrong });
    expect(certifiedHint(def, bad)).toBeNull();
    const h = fullHint(def, bad)!;
    expect(['drag', 'undo']).toContain(h.kind);
    const undone = ok(def, bad, { type: 'undo' });
    expect(certifiedHint(def, undone)?.kind).toBe('drag');
    expect(followHints(def, bad)).toBe(true);
  });
});

describe('Ligase (cost 2): locks block both axes; release and undo restore movement', () => {
  const bonded = () => {
    const def = bench();
    let s = ok(def, createInitialState(def), rowLeft);
    s = ok(def, s, { type: 'bond', cell: 28 });
    return { def, s };
  };
  it('only a complete codon can be bonded', () => {
    const def = bench();
    const s = createInitialState(def);
    rejected(def, s, { type: 'bond', cell: 27 }, 'codon-incomplete');
    rejected(def, s, { type: 'bond', cell: 0 }, 'not-a-codon');
  });
  it('bonds the whole codon, costs 2 and one move', () => {
    const { s } = bonded();
    expect(s.locks).toEqual([27, 28, 29]);
    expect(energyOf(s)).toBe(2);
    expect(s.moves).toBe(2);
  });
  it('a locked tile cannot move on either axis; segments through it split at the lock', () => {
    const { def, s } = bonded();
    for (const c of [27, 28, 29]) {
      rejected(def, s, { type: 'rotate', move: { origin: c, axis: 'row', direction: 1 } }, 'locked');
      rejected(def, s, { type: 'rotate', move: { origin: c, axis: 'col', direction: 1 } }, 'locked');
      rejected(def, s, { type: 'slide', origin: c, axis: 'col', steps: 2 }, 'locked');
    }
    expect(segmentIn(def, s, 30, 'row')).toEqual([30, 31, 32, 33, 34, 35]);
    expect(segmentIn(def, s, 9, 'col')).toEqual([0, 9, 18]);
    expect(segmentIn(def, s, 45, 'col')).toEqual([36, 45, 54, 63, 72]);
    const r = run(def, s, { type: 'slide', origin: 33, axis: 'row', steps: 1 });
    expect(r.state.board.slice(27, 30)).toBe('ATG');
    const c = run(def, s, { type: 'rotate', move: { origin: 0, axis: 'col', direction: 1 } });
    expect(c.state.board[27]).toBe('A');
  });
  it('only one bond at a time', () => {
    const { def, s } = bonded();
    const funded = { ...s, ledger: { ...s.ledger, earned: 9 } };
    rejected(def, funded, { type: 'bond', cell: 31 }, 'bond-active');
  });
  it('release is free (no energy, no move) and restores movement; undo re-applies then removes the bond', () => {
    const { def, s } = bonded();
    const r = ok(def, s, { type: 'release' });
    expect(r.locks).toEqual([]);
    expect(energyOf(r)).toBe(energyOf(s));
    expect(r.moves).toBe(s.moves);
    expect(segmentIn(def, r, 30, 'row')).toHaveLength(9);
    rejected(def, r, { type: 'release' }, 'no-bond');
    const back = ok(def, r, { type: 'undo' });
    expect(back.locks).toEqual([27, 28, 29]);
    const unbond = ok(def, back, { type: 'undo' });
    expect(unbond.locks).toEqual([]);
    expect(energyOf(unbond)).toBe(4);
    expect(segmentIn(def, unbond, 28, 'col')).toHaveLength(9);
  });
});

describe('Scaffold (cost 3): bridges a 1–2 hole gap for exactly three successful rotations', () => {
  const start = () => {
    const def = bench({ lab: 'scaffold' });
    return { def, s: ok(def, createInitialState(def), { type: 'scaffold', axis: 'row', gap: [5] }) };
  };
  it('lists legal placements and validates gaps', () => {
    const def = bench();
    expect(scaffoldCandidates(def.mask)).toEqual([{ axis: 'row', gap: [5], cells: [0, 1, 2, 3, 4, 6, 7, 8] }]);
    expect('reason' in scaffoldTrack(def.mask, [], 'row', [4])).toBe(true); // not a hole
    expect('reason' in scaffoldTrack(def.mask, [4], 'row', [5])).toBe(true); // cannot cross a bonded cell
    expect('reason' in scaffoldTrack(def.mask, [], 'col', [5])).toBe(true); // board edge
  });
  it('activation costs a move but does not tick the duration', () => {
    const { s } = start();
    expect(s.scaffold).toMatchObject({ axis: 'row', gap: [5], remaining: 3 });
    expect(s.moves).toBe(1);
  });
  it('the bridged segments rotate as one cyclic track, skipping the hole', () => {
    const { def, s } = start();
    expect(segmentIn(def, s, 7, 'row')).toEqual([0, 1, 2, 3, 4, 6, 7, 8]);
    expect(segmentIn(def, s, 7, 'col')).toEqual([7, 16, 25, 34, 43, 52, 61, 70, 79]);
    const r = ok(def, s, { type: 'rotate', move: { origin: 0, axis: 'row', direction: 1 } });
    expect(r.board.slice(0, 9)).toBe('TACGT.ACG');
    expect(r.board[5]).toBe('.');
  });
  it('expires after exactly three successful normal rotations (anywhere); rejected moves do not tick', () => {
    const { def, s } = start();
    let t = ok(def, s, { type: 'rotate', move: { origin: 0, axis: 'row', direction: 1 } });
    expect(t.scaffold?.remaining).toBe(2);
    rejected(def, t, { type: 'rotate', move: { origin: 9, axis: 'row', direction: 1 } }, 'no-op');
    t = ok(def, t, { type: 'slide', origin: 72, axis: 'row', steps: 2 });
    expect(t.scaffold?.remaining).toBe(1);
    const third = run(def, t, { type: 'rotate', move: { origin: 1, axis: 'col', direction: 1 } });
    expect(third.events).toContainEqual({ type: 'scaffold-expired' });
    expect(third.state.scaffold).toBeNull();
    expect(segmentIn(def, third.state, 0, 'row')).toEqual([0, 1, 2, 3, 4]);
  });
  it('powers do not tick it; only one scaffold at a time; undo restores the remaining turns', () => {
    const { def, s } = start();
    const rich = { ...s, ledger: { ...s.ledger, earned: 7 } };
    rejected(def, rich, { type: 'scaffold', axis: 'row', gap: [5] }, 'scaffold-active');
    const edited = ok(def, rich, { type: 'edit', cell: 40, base: 'G' });
    expect(edited.scaffold?.remaining).toBe(3);
    const moved = ok(def, edited, { type: 'rotate', move: { origin: 0, axis: 'row', direction: 1 } });
    expect(ok(def, moved, { type: 'undo' }).scaffold?.remaining).toBe(3);
  });
  it('a bond cannot overlap the scaffold track', () => {
    const def = bench();
    const s0 = createInitialState(def);
    const s = { ...s0, board: s0.board.slice(0, 27) + 'ATGCCC' + s0.board.slice(33), scaffold: { axis: 'row' as const, gap: [5], cells: [27, 28, 29, 30], remaining: 2 } };
    rejected(def, s, { type: 'bond', cell: 27 }, 'scaffold-conflict');
  });
});

/** Apply hints until solved; true if solved within the step limit. Every hint must be legal. */
function followHints(def: LevelDefinition, start: PuzzleState, limit = 60): boolean {
  let s = start;
  for (let i = 0; i < limit && s.status === 'playing'; i++) {
    const h = fullHint(def, s, 8_000);
    expect(h).not.toBeNull();
    if (h!.kind === 'drag') s = ok(def, s, { type: 'slide', ...h!.slide });
    else if (h!.kind === 'release') s = ok(def, s, { type: 'release' });
    else if (h!.kind === 'undo') {
      expect(h!.count).toBeLessThanOrEqual(s.history.length);
      for (let k = 0; k < h!.count; k++) s = ok(def, s, { type: 'undo' });
    } else s = ok(def, s, { type: 'restart' });
  }
  return s.status === 'solved';
}

describe('hints are never invalid (randomised play with powers)', () => {
  it('after random drags, edits, bonds, releases and scaffolds, every hint is legal and hints reach the win', () => {
    const levels = ALL_LEVELS.filter(powersEnabled);
    const rng = createRng(20261113);
    for (let trial = 0; trial < 36; trial++) {
      const def = levels[trial % levels.length]!;
      let s: PuzzleState = { ...createInitialState(def), ledger: { earned: 30, credited: createInitialState(def).ledger.credited } };
      const active = [...def.mask].map((ch, i) => (ch === '#' ? i : -1)).filter((i) => i >= 0);
      for (let step = 0; step < 6 && s.status === 'playing'; step++) {
        const roll = rng.next();
        const cell = active[Math.floor(rng.next() * active.length)]!;
        let cmd: Command;
        if (roll < 0.55) cmd = { type: 'slide', origin: cell, axis: rng.next() < 0.5 ? 'row' : 'col', steps: 1 + Math.floor(rng.next() * 3) };
        else if (roll < 0.7) cmd = { type: 'edit', cell, base: (['A', 'C', 'G', 'T'] as Base[])[Math.floor(rng.next() * 4)]! };
        else if (roll < 0.82) cmd = { type: 'bond', cell: levelCodons(def)[Math.floor(rng.next() * levelCodons(def).length)]?.cells[0] ?? cell };
        else if (roll < 0.9) cmd = { type: 'release' };
        else {
          const cands = scaffoldCandidates(def.mask, s.locks);
          const c = cands[Math.floor(rng.next() * cands.length)];
          cmd = c ? { type: 'scaffold', axis: c.axis, gap: c.gap } : { type: 'undo' };
        }
        const r = run(def, s, cmd);
        if (!r.accepted) expect(r.state).toBe(s);
        s = r.state;
        if (s.status === 'playing') {
          const h = fullHint(def, s, 3_000)!;
          if (h.kind === 'drag') expect(run(def, s, { type: 'slide', ...h.slide }).accepted).toBe(true);
          if (h.kind === 'release') expect(s.locks.length).toBeGreaterThan(0);
          if (h.kind === 'undo') expect(h.count).toBeLessThanOrEqual(s.history.length);
        }
      }
      expect(followHints(def, s), `${def.id} trial ${trial}`).toBe(true);
    }
  }, 120_000);
  it('a level stays solvable without powers: the certified hint alone solves every level from the start', () => {
    for (const def of ALL_LEVELS) {
      let s = createInitialState(def);
      for (let i = 0; i < 20 && s.status === 'playing'; i++) {
        const h = certifiedHint(def, s);
        expect(h?.kind).toBe('drag');
        if (h?.kind === 'drag') s = ok(def, s, { type: 'slide', ...h.slide });
      }
      expect(isSolved(def, s.board)).toBe(true);
    }
  });
});

describe('bounded hint search', () => {
  it('searches under the current topology: a scaffold enables a one-drag win that plain moves cannot', () => {
    const def = bench({ tracks: [{ group: 1, cells: [6, 7, 8], expected: 'ACG', orientation: 'horizontal', strand: 'coding', readDirection: '5to3', source: { start: 0, end: 3 } }] });
    const s0 = createInitialState(def);
    expect(searchSolution(def, s0, { maxDepth: 1, maxNodes: 50_000 }).slides).toBeNull();
    const scaffold = { axis: 'row' as const, gap: [5], cells: [0, 1, 2, 3, 4, 6, 7, 8], remaining: 3 };
    const r = searchSolution(def, { ...s0, scaffold }, { maxDepth: 1, maxNodes: 50_000 });
    expect(r.slides).toHaveLength(1);
    const st = ok(def, { ...s0, scaffold }, { type: 'slide', ...r.slides![0]! });
    expect(st.status).toBe('solved');
  });
  it('respects the node budget and never claims more than it explored', () => {
    const def = LEVELS[11]!;
    const r = searchSolution(def, createInitialState(def), { maxDepth: 3, maxNodes: 500 });
    expect(r.slides).toBeNull();
    expect(r.nodes).toBeLessThanOrEqual(500);
    expect(r.exhaustedDepth).toBeLessThanOrEqual(1);
  });
  it('the default hint budget stays fast on the largest board', () => {
    const def = LEVELS[11]!;
    const s = { ...createInitialState(def), recovery: null };
    const t0 = performance.now();
    const h = fullHint(def, s);
    expect(h).not.toBeNull();
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});
