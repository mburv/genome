import { describe, expect, it } from 'vitest';
import { applyCommand, createInitialState, isCompatibleBoard, isSolved } from '../../src/engine/engine.ts';
import { CHAPTER_LEVELS } from '../../src/campaign/campaign.ts';
import { CUSTOM_SYMBOL_BASE, defaultLabel, isCustomSymbol, symbolFor, symbolLabel, symbolSequence, tokenSymbol } from '../../src/engine/tokens.ts';
import type { LevelDefinition } from '../../src/engine/types.ts';
import type { PuzzleState } from '../../src/engine/engine.ts';

const rich = (s: PuzzleState): PuzzleState => ({ ...s, ledger: { ...s.ledger, earned: 7 } });
const longLevel = CHAPTER_LEVELS.find((l) => l.tier! >= 12 && l.mode === 'sequence')!;

function offTarget(def: LevelDefinition, board: string) {
  for (const t of def.tracks) for (const [i, c] of t.cells.entries()) if (board[c] !== t.expected[i]) return { cell: c, want: t.expected[i]! };
  throw new Error('no wrong cell');
}

describe('token model', () => {
  it('one symbol per distinct sequence: symbol equality is sequence equality', () => {
    for (const def of CHAPTER_LEVELS) {
      const seqs = Object.values(def.tokens!).map((t) => t.seq);
      expect(new Set(seqs).size).toBe(seqs.length);
      for (const sym of Object.keys(def.tokens!)) expect(sym.codePointAt(0)!).toBeLessThan(CUSTOM_SYMBOL_BASE);
    }
    expect(tokenSymbol(0)).toBe('\u0100');
  });
  it('labels: full bases up to 6, first…last codon beyond; colliding labels are disambiguated', () => {
    expect(defaultLabel('ATGGCC')).toBe('ATGGCC');
    expect(defaultLabel('ATGAAACCCGGC')).toBe('ATG…GGC');
    for (const def of CHAPTER_LEVELS) {
      const labels = Object.values(def.tokens!).map((t) => t.label);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
  it('CRISPR on a long token edits the chosen base, creates a custom (non-reference) sequence, and undo restores it', () => {
    const def = longLevel;
    const s = rich(createInitialState(def));
    const { cell } = offTarget(def, s.board);
    const sym = s.board[cell]!;
    const seq = symbolSequence(def, s.custom, sym);
    const pos = seq.length - 1;
    const base = (['A', 'C', 'G', 'T'] as const).find((b) => b !== seq[pos])!;
    const r = applyCommand(def, s, { type: 'edit', cell, base, pos });
    expect(r.accepted).toBe(true);
    const to = r.state.board[cell]!;
    const after = symbolSequence(def, r.state.custom, to);
    expect(after).toBe(seq.slice(0, pos) + base);
    expect(after).toHaveLength(seq.length);
    const reused = Object.entries(def.tokens!).find(([, t]) => t.seq === after);
    if (reused) expect(to).toBe(reused[0]);
    else { expect(isCustomSymbol(to)).toBe(true); expect(symbolLabel(def, r.state.custom, to)).toMatch(/^✎/); }
    expect(isCompatibleBoard(def, r.state.board, r.state.edits, r.state.custom)).toBe(true);
    const u = applyCommand(def, r.state, { type: 'undo' }).state;
    expect(u.board).toBe(s.board);
    expect(u.custom).toEqual(s.custom);
    // Same base is a free no-op; out-of-range positions are rejected.
    expect(applyCommand(def, s, { type: 'edit', cell, base: seq[pos] as 'A', pos }).reason).toBe('same-base');
    expect(applyCommand(def, s, { type: 'edit', cell, base, pos: seq.length }).reason).toBe('invalid-target');
  });
  it('an edit that spells a target sequence reuses that target symbol and counts by sequence', () => {
    // Find a wrong cell whose tile differs from the wanted piece in exactly one base.
    for (const def of CHAPTER_LEVELS) {
      const s0 = rich(createInitialState(def));
      for (const t of def.tracks) for (const [i, cell] of t.cells.entries()) {
        const want = symbolSequence(def, {}, t.expected[i]!);
        const have = symbolSequence(def, {}, s0.board[cell]!);
        if (have.length !== want.length) continue;
        const diff = [...have].map((b, j) => (b !== want[j] ? j : -1)).filter((j) => j >= 0);
        if (diff.length !== 1) continue;
        const pos = diff[0]!;
        const r = applyCommand(def, s0, { type: 'edit', cell, base: want[pos] as 'A', pos });
        expect(r.accepted).toBe(true);
        expect(r.state.board[cell]).toBe(t.expected[i]);
        expect(r.state.custom).toEqual({});
        return;
      }
    }
    throw new Error('no one-base-away tile found in any chapter');
  });
  it('symbolFor reuses an existing custom symbol for the same sequence', () => {
    const def = longLevel;
    const seq = 'A'.repeat(def.tier!);
    const a = symbolFor(def, {}, seq)!;
    const b = symbolFor(def, a.custom, seq)!;
    expect(b.symbol).toBe(a.symbol);
    expect(b.custom).toEqual(a.custom);
  });
  it('every chapter puzzle is solved by its certificate and the win is decided by symbols = sequences', () => {
    for (const def of CHAPTER_LEVELS.slice(0, 20)) {
      let s = createInitialState(def);
      for (const sl of def.certificateSlides) s = applyCommand(def, s, { type: 'slide', ...sl }).state;
      expect(isSolved(def, s.board)).toBe(true);
    }
  });
  it('Ligase bonds a single placed piece on token levels', () => {
    const def = longLevel;
    let s = rich(createInitialState(def));
    for (const sl of def.certificateSlides.slice(0, -1)) s = applyCommand(def, s, { type: 'slide', ...sl }).state;
    const t = def.tracks[0]!;
    const cell = t.cells.find((c, i) => s.board[c] === t.expected[i]);
    if (cell === undefined) return;
    const r = applyCommand(def, s, { type: 'bond', cell });
    expect(r.accepted).toBe(true);
    expect(r.state.locks).toEqual([cell]);
  });
});
