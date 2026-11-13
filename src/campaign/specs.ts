import type { LevelSpec } from '../generator/level.ts';

/**
 * M1 vertical slice: three sequencing levels on consecutive INS CDS intervals.
 * Intervals [0,9), [9,18), [18,27) are an M1-only choice (see docs/DECISIONS.md D-M1-02);
 * the M2 12-level table re-maps modes to intervals.
 */
export const CAMPAIGN_ID = 'genome-m1-ins';

export const M1_SPECS: readonly LevelSpec[] = [
  {
    id: 'm1-ins-01',
    index: 0,
    title: 'First swipe',
    seed: 1101,
    source: { start: 0, end: 9 },
    orientation: 'horizontal',
    line: 4,
    tutorial: true,
    scrambleLength: 1,
    minWrongCells: 1,
    mask: { minActive: 70, maxActive: 78, maxDeadEnds: 2, operations: 4, weights: { edgeBite: 3, cornerCut: 3, cavity: 0, channel: 0, island: 0 } },
  },
  {
    id: 'm1-ins-02',
    index: 1,
    title: 'Around the gaps',
    seed: 2202,
    source: { start: 9, end: 18 },
    orientation: 'horizontal',
    line: null,
    tutorial: false,
    scrambleLength: 4,
    minWrongCells: 4,
    mask: { minActive: 58, maxActive: 70, maxDeadEnds: 4, operations: 9, weights: { edgeBite: 2, cornerCut: 2, cavity: 3, channel: 2, island: 1 } },
  },
  {
    id: 'm1-ins-03',
    index: 2,
    title: 'Vertical strand',
    seed: 3303,
    source: { start: 18, end: 27 },
    orientation: 'vertical',
    line: null,
    tutorial: false,
    scrambleLength: 6,
    minWrongCells: 5,
    mask: { minActive: 56, maxActive: 68, maxDeadEnds: 4, operations: 11, weights: { edgeBite: 2, cornerCut: 1, cavity: 2, channel: 3, island: 2 } },
  },
];
