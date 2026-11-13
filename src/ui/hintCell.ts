import { segmentCells } from '../engine/grid.ts';
import type { Board, Cell, LevelDefinition, Move } from '../engine/types.ts';

/**
 * Where to draw a hint cue: the tile that the hinted move will carry into the first currently-wrong
 * target cell of that segment (the most intuitive tile to swipe). Any tile in the segment performs
 * the same canonical move, so this only affects presentation.
 */
export function hintDisplayCell(def: LevelDefinition, board: Board, hint: Move): Cell {
  const seg = segmentCells(def.mask, hint.origin, hint.axis);
  const n = seg.length;
  for (const t of def.tracks) {
    for (let k = 0; k < t.cells.length; k++) {
      const idx = seg.indexOf(t.cells[k]!);
      if (idx < 0 || board[t.cells[k]!] === t.expected[k]) continue;
      return seg[(idx - hint.direction + n) % n]!;
    }
  }
  return hint.origin;
}
