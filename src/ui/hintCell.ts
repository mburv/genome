import { segmentCells } from '../engine/grid.ts';
import type { Board, Cell, LevelDefinition, Slide } from '../engine/types.ts';

/**
 * Where to draw a hint cue: the tile that the hinted drag will carry into the first currently-wrong
 * target cell of that segment (the most intuitive tile to grab). Any tile in the segment performs
 * the same drag, so this only affects presentation.
 */
export function hintDisplayCell(def: LevelDefinition, board: Board, hint: Slide): Cell {
  const seg = segmentCells(def.mask, hint.origin, hint.axis);
  const n = seg.length;
  for (const t of def.tracks) {
    for (let k = 0; k < t.cells.length; k++) {
      const idx = seg.indexOf(t.cells[k]!);
      if (idx < 0 || board[t.cells[k]!] === t.expected[k]) continue;
      return seg[(((idx - hint.steps) % n) + n) % n]!;
    }
  }
  return hint.origin;
}

export const slideDir = (s: Pick<Slide, 'axis' | 'steps'>): 'left' | 'right' | 'up' | 'down' =>
  s.axis === 'row' ? (s.steps > 0 ? 'right' : 'left') : s.steps > 0 ? 'down' : 'up';

export const slideArrow = (s: Pick<Slide, 'axis' | 'steps'>): string => ({ right: '→', left: '←', down: '↓', up: '↑' })[slideDir(s)];

export function describeSlide(s: Slide): string {
  const line = s.axis === 'row' ? `row ${Math.floor(s.origin / 9) + 1}` : `column ${(s.origin % 9) + 1}`;
  const k = Math.abs(s.steps);
  return `drag ${line} ${slideDir(s)} ${k} ${k === 1 ? 'cell' : 'cells'}`;
}
