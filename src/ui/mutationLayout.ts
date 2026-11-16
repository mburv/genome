import type { LabSpec } from '../engine/mechanicsLab.ts';

/**
 * Mutation Correction has nine visible columns:
 *   1–7 DNA strand, 8 clear separation, 9 replacement rail.
 *
 * Keep the original logical cell indices so completed levels, stored action logs,
 * correction targets, hints and seeded certificates remain compatible. When a
 * strand starts at logical column 1 it already fits: leave that row alone. All
 * other rows rotate the empty first cell to visible column 8 and slide the
 * remaining cells one square left. The rightmost rail never moves.
 */
export function mutationDisplayCell(cell: number, rows: LabSpec['MUTATION_ROWS']): number {
  const col = cell % 9;
  if (col === 8) return cell;

  const row = Math.floor(cell / 9);
  const beginsAtLeftEdge = rows.some(({ top, bottom }) =>
    (Math.floor(top / 9) === row || Math.floor(bottom / 9) === row) && top % 9 === 0);

  return beginsAtLeftEdge ? cell : row * 9 + (col + 7) % 8;
}
