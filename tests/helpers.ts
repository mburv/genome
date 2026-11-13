import type { LevelDefinition, Mask } from '../src/engine/types.ts';

/** Build a mask/board from 9 row strings ('.' = hole). */
export const grid = (rows: string[]): string => {
  if (rows.length !== 9 || rows.some((r) => r.length !== 9)) throw new Error('need 9x9');
  return rows.join('');
};
export const maskOf = (board: string): Mask => board.replace(/[ATCG]/g, '#');

/** Small synthetic level for engine tests (synthetic letters, NOT reference DNA). */
export function syntheticLevel(rows: string[], solvedRows: string[], trackCells: number[], expected: string): LevelDefinition {
  const initial = grid(rows);
  const solved = grid(solvedRows);
  return {
    id: 'synthetic', index: 0, title: 'synthetic', mode: 'sequence', tutorial: false,
    geneId: 'SYNTHETIC', symbol: 'SYN', transcript: 'synthetic', datasetId: 'synthetic-fixture', sequenceSha256: '',
    seed: 0, generatorVersion: 'test', mask: maskOf(initial), maskCanonical: '',
    tracks: [{ group: 1, cells: trackCells, expected, orientation: 'horizontal', strand: 'coding', readDirection: '5to3', source: { start: 0, end: expected.length } }],
    sourceIntervals: [{ start: 0, end: expected.length }], solved, initial, scramble: [], certificate: [], certificateSlides: [],
    metrics: { active: 0, holes: 0, deadEnds: 0, wrongTargetCells: 0, certificateLength: 0, axesUsed: [], difficulty: 'estimated',
      certificateDrags: 0, solver: { status: 'unknown', lowerBound: 0, nodes: 0, budget: 0 }, rating: 'gentle', score: 0 },
  };
}
