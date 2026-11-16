import { describe, expect, it } from 'vitest';
import { CAMPAIGN_LEVELS } from '../campaign/campaign.ts';
import { genomeStage } from '../campaign/bonus.ts';
import { mechanicOf, mixedStage } from '../campaign/mixed.ts';
import { createLab, DEFAULT_LAB_SPEC, type LabSpec } from '../engine/mechanicsLab.ts';
import { mutationDisplayCell } from './mutationLayout.ts';

const verifyGap = (spec: LabSpec, id: string) => {
  const board = createLab('mutation', spec).board;
  const visibleCells = board.map((_, c) => mutationDisplayCell(c, spec.MUTATION_ROWS));

  // Each logical square has one visible square, and the four replacement
  // buttons remain in column 9 at their existing save/action coordinates.
  expect(new Set(visibleCells).size, id).toBe(81);
  for (let c = 0; c < 81; c++) {
    const visible = visibleCells[c]!;
    expect(visible >= 0 && visible < 81, id).toBe(true);
    expect(Math.floor(visible / 9), id).toBe(Math.floor(c / 9));
    if (c % 9 === 8) expect(visible, id).toBe(c);
    if (visible % 9 === 7) expect(board[c], id).toBe('.');
  }

  // The DNA strands visually use columns 1–7. Existing source coordinates
  // remain unchanged for action-log replay and saved mid-level attempts.
  for (const strand of spec.MUTATION_ROWS) {
    const originalCol = strand.top % 9;
    const displayedCol = Math.max(0, originalCol - 1);
    for (let i = 0; i < strand.seq.length; i++) {
      expect(mutationDisplayCell(strand.top + i, spec.MUTATION_ROWS) % 9, id).toBe(displayedCol + i);
      expect(mutationDisplayCell(strand.bottom + i, spec.MUTATION_ROWS) % 9, id).toBe(displayedCol + i);
    }
  }
};

describe('Mutation Correction visual spacer', () => {
  it('leaves a clear eighth column in the practice board', () => {
    verifyGap(DEFAULT_LAB_SPEC, 'practice');
    expect(mutationDisplayCell(20, DEFAULT_LAB_SPEC.MUTATION_ROWS)).toBe(19);
  });

  it('preserves all seeded and legacy main-campaign correction coordinates', () => {
    const levels = CAMPAIGN_LEVELS.filter(def => mechanicOf(def) === 'mutation');
    expect(levels.length).toBeGreaterThan(10);
    for (const def of levels) for (const legacy of [false, true]) {
      verifyGap(mixedStage(def, legacy)!.spec, def.id + (legacy ? ' legacy' : ' varied'));
    }
  });

  it('keeps the gap and replacement rail on downloaded chromosome bonus levels', () => {
    for (const length of [18, 27]) {
      const sequence = 'ACGT'.repeat(7).slice(0, length);
      const stage = genomeStage('chr1', [0, length], sequence);
      expect(stage.mechanic).toBe('mutation');
      verifyGap(stage.spec, stage.id);
    }
  });
});
