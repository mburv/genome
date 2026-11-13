import type { LevelSpec } from '../generator/level.ts';

/**
 * M2 sample campaign (docs/GAME_DESIGN.md §4): six challenges per gene on the first 51 CDS bases,
 * split 9 / 9 / 6 / 9 / 9 / 9. Difficulty ramps through scramble drags and a shallow proof that no
 * shorter solution exists (see docs/DECISIONS.md D-M2-*).
 */
export const CAMPAIGN_ID = 'genome-m2-sample';

const base = { edgeBite: 0, cornerCut: 0, cavity: 0, channel: 0, island: 0, diagonal: 0, branch: 0 };

export const M2_SPECS: readonly LevelSpec[] = [
  {
    id: 'ins-01', index: 0, gene: 'INS', title: 'First drag', mode: 'sequence', seed: 1101, source: { start: 0, end: 9 },
    layout: { kind: 'sequence', orientation: 'horizontal', line: 4 }, tutorial: true, scrambleDrags: 1, minDrags: 1, minWrongCells: 1,
    mask: { minActive: 70, maxActive: 78, maxDeadEnds: 2, operations: 4, weights: { ...base, edgeBite: 3, cornerCut: 3 } },
  },
  {
    id: 'ins-02', index: 1, gene: 'INS', title: 'Three pieces', mode: 'splice', seed: 2202, source: { start: 9, end: 18 },
    layout: { kind: 'splice', parts: [{ length: 3, orientation: 'horizontal' }, { length: 3, orientation: 'horizontal' }, { length: 3, orientation: 'horizontal' }] },
    tutorial: false, scrambleDrags: 2, minDrags: 2, minWrongCells: 3,
    mask: { minActive: 60, maxActive: 72, maxDeadEnds: 3, operations: 8, weights: { ...base, cavity: 4, edgeBite: 1, cornerCut: 1, channel: 1 } },
  },
  {
    id: 'ins-03', index: 2, gene: 'INS', title: 'Copy the strand', mode: 'replicate', seed: 3303, source: { start: 18, end: 24 },
    layout: { kind: 'replicate', orientation: 'horizontal' }, tutorial: false, scrambleDrags: 3, minDrags: 2, minWrongCells: 4,
    mask: { minActive: 60, maxActive: 72, maxDeadEnds: 3, operations: 8, weights: { ...base, edgeBite: 2, cornerCut: 2, cavity: 2, channel: 1, diagonal: 1 } },
  },
  {
    id: 'ins-04', index: 3, gene: 'INS', title: 'Mind the gap', mode: 'repair', seed: 4404, source: { start: 24, end: 33 },
    layout: { kind: 'repair', orientation: 'horizontal', gapIndex: 4 }, tutorial: false, scrambleDrags: 3, minDrags: 3, minWrongCells: 4,
    mask: { minActive: 58, maxActive: 70, maxDeadEnds: 3, operations: 8, weights: { ...base, cavity: 3, edgeBite: 2, cornerCut: 1, diagonal: 1 } },
  },
  {
    id: 'ins-05', index: 4, gene: 'INS', title: 'Narrow passage', mode: 'sequence', seed: 5505, source: { start: 33, end: 42 },
    layout: { kind: 'sequence', orientation: 'vertical' }, tutorial: false, scrambleDrags: 4, minDrags: 3, minWrongCells: 5,
    mask: { minActive: 54, maxActive: 66, maxDeadEnds: 4, operations: 10, weights: { ...base, channel: 4, branch: 2, edgeBite: 1, cornerCut: 1 } },
  },
  {
    id: 'ins-06', index: 5, gene: 'INS', title: 'Crossing exons', mode: 'splice', seed: 6606, source: { start: 42, end: 51 },
    layout: { kind: 'splice', parts: [{ length: 5, orientation: 'horizontal' }, { length: 4, orientation: 'vertical' }] },
    tutorial: false, scrambleDrags: 4, minDrags: 3, minWrongCells: 5,
    mask: { minActive: 56, maxActive: 68, maxDeadEnds: 4, operations: 10, weights: { ...base, island: 2, cavity: 2, edgeBite: 2, cornerCut: 1, channel: 1 } },
  },
  {
    id: 'hbb-01', index: 6, gene: 'HBB', title: 'Lopsided', mode: 'sequence', seed: 7707, source: { start: 0, end: 9 },
    layout: { kind: 'sequence', orientation: 'horizontal' }, tutorial: false, scrambleDrags: 4, minDrags: 3, minWrongCells: 5,
    mask: { minActive: 56, maxActive: 68, maxDeadEnds: 4, operations: 9, requireAsymmetric: true, weights: { ...base, cornerCut: 3, edgeBite: 3, cavity: 1 } },
  },
  {
    id: 'hbb-02', index: 7, gene: 'HBB', title: 'Offset cavities', mode: 'splice', seed: 8808, source: { start: 9, end: 18 },
    layout: { kind: 'splice', parts: [{ length: 3, orientation: 'vertical' }, { length: 3, orientation: 'horizontal' }, { length: 3, orientation: 'vertical' }] },
    tutorial: false, scrambleDrags: 5, minDrags: 3, minWrongCells: 6,
    mask: { minActive: 56, maxActive: 68, maxDeadEnds: 4, operations: 10, weights: { ...base, cavity: 4, island: 2, edgeBite: 1, diagonal: 1 } },
  },
  {
    id: 'hbb-03', index: 8, gene: 'HBB', title: 'Paired columns', mode: 'replicate', seed: 9909, source: { start: 18, end: 24 },
    layout: { kind: 'replicate', orientation: 'vertical' }, tutorial: false, scrambleDrags: 5, minDrags: 3, minWrongCells: 6,
    mask: { minActive: 56, maxActive: 68, maxDeadEnds: 4, operations: 10, weights: { ...base, edgeBite: 2, cornerCut: 2, channel: 2, diagonal: 2 } },
  },
  {
    id: 'hbb-04', index: 9, gene: 'HBB', title: 'Column repair', mode: 'repair', seed: 10110, source: { start: 24, end: 33 },
    layout: { kind: 'repair', orientation: 'vertical', gapIndex: 5 }, tutorial: false, scrambleDrags: 5, minDrags: 3, minWrongCells: 5,
    mask: { minActive: 54, maxActive: 66, maxDeadEnds: 4, operations: 10, weights: { ...base, cavity: 2, branch: 2, edgeBite: 2, diagonal: 1 } },
  },
  {
    id: 'hbb-05', index: 10, gene: 'HBB', title: 'Branching corridor', mode: 'sequence', seed: 11211, source: { start: 33, end: 42 },
    layout: { kind: 'sequence', orientation: 'horizontal' }, tutorial: false, scrambleDrags: 6, minDrags: 3, minWrongCells: 6, deepCheck: { depth: 3, budget: 1_500_000 },
    mask: { minActive: 52, maxActive: 62, maxDeadEnds: 5, operations: 12, weights: { ...base, branch: 4, channel: 3, island: 1 } },
  },
  {
    id: 'hbb-06', index: 11, gene: 'HBB', title: 'Grand splice', mode: 'splice', seed: 12312, source: { start: 42, end: 51 },
    layout: { kind: 'splice', parts: [{ length: 3, orientation: 'horizontal' }, { length: 3, orientation: 'vertical' }, { length: 3, orientation: 'horizontal' }] },
    tutorial: false, scrambleDrags: 6, minDrags: 3, minWrongCells: 7, deepCheck: { depth: 3, budget: 1_500_000 },
    mask: { minActive: 54, maxActive: 66, maxDeadEnds: 5, operations: 12, weights: { ...base, island: 3, cavity: 2, branch: 2, diagonal: 1, edgeBite: 1 } },
  },
];
