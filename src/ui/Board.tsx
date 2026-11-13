import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { SIZE, cellAt, colOf, rowOf, segmentCells } from '../engine/grid.ts';
import type { Axis, Board as BoardString, Cell, Direction, LevelDefinition, Move } from '../engine/types.ts';

export interface MoveAnimation {
  nonce: number;
  segment: Cell[];
  axis: Axis;
  direction: Direction;
}

interface Props {
  def: LevelDefinition;
  board: BoardString;
  matches: boolean[][];
  selected: Cell;
  hint: Move | null;
  hintCell: Cell | null;
  showGestureCue: boolean;
  locked: boolean;
  reducedMotion: boolean;
  animation: MoveAnimation | null;
  onMove: (move: Move) => void;
  onSelect: (cell: Cell) => void;
}

const SWIPE_THRESHOLD = 16;
export const SLIDE_MS = 150;

const dirName = (m: Move): string => (m.axis === 'row' ? (m.direction === 1 ? 'right' : 'left') : m.direction === 1 ? 'down' : 'up');
const arrow = (m: Move): string => ({ right: '→', left: '←', down: '↓', up: '↑' })[dirName(m)]!;

export function Board({ def, board, matches, selected, hint, hintCell, showGestureCue, locked, reducedMotion, animation, onMove, onSelect }: Props) {
  const boardRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; cell: Cell; id: number; done: boolean } | null>(null);
  const busyUntil = useRef(0);

  const trackInfo = new Map<Cell, { group: number; pos: number; ok: boolean }>();
  def.tracks.forEach((t, ti) => t.cells.forEach((c, i) => trackInfo.set(c, { group: t.group, pos: i, ok: matches[ti]?.[i] ?? false })));
  const hintSegment = new Set(hint ? segmentCells(def.mask, hint.origin, hint.axis) : []);

  const tryMove = useCallback(
    (move: Move) => {
      // Input is ignored (not queued) while a slide animation plays.
      if (locked || performance.now() < busyUntil.current) return;
      onMove(move);
    },
    [locked, onMove],
  );

  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el || !animation || reducedMotion) return;
    const tiles = el.querySelectorAll<HTMLElement>('[data-cell]');
    const byCell = new Map<number, HTMLElement>();
    tiles.forEach((t) => byCell.set(Number(t.dataset.cell), t));
    const first = el.querySelector<HTMLElement>('.cell:nth-child(1)')?.getBoundingClientRect();
    const second = el.querySelector<HTMLElement>('.cell:nth-child(2)')?.getBoundingClientRect();
    const pitch = first && second ? second.left - first.left : el.clientWidth / 9;
    const { segment, axis, direction } = animation;
    const n = segment.length;
    busyUntil.current = performance.now() + SLIDE_MS;
    segment.forEach((cell, i) => {
      const tile = byCell.get(cell);
      if (!tile) return;
      const dx = axis === 'row' ? -direction * pitch : 0;
      const dy = axis === 'col' ? -direction * pitch : 0;
      const wrapped = direction === 1 ? i === 0 : i === n - 1;
      tile.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)`, opacity: wrapped ? 0.1 : 1 },
          { transform: 'translate(0, 0)', opacity: 1 },
        ],
        { duration: SLIDE_MS, easing: 'cubic-bezier(.2,.8,.3,1)' },
      );
    });
  }, [animation, reducedMotion]);

  useEffect(() => {
    // Keep keyboard focus on the selected tile when the board has focus.
    const el = boardRef.current;
    if (el && el.contains(document.activeElement)) el.querySelector<HTMLElement>(`[data-cell="${selected}"]`)?.focus();
  }, [selected, board]);

  const onPointerDown = (e: React.PointerEvent) => {
    const tile = (e.target as HTMLElement).closest<HTMLElement>('[data-cell]');
    if (!tile) return;
    start.current = { x: e.clientX, y: e.clientY, cell: Number(tile.dataset.cell), id: e.pointerId, done: false };
    boardRef.current?.setPointerCapture?.(e.pointerId);
  };
  const commit = (e: React.PointerEvent): boolean => {
    const s = start.current;
    if (!s || s.id !== e.pointerId || s.done) return false;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return false;
    s.done = true;
    const horizontal = Math.abs(dx) > Math.abs(dy);
    onSelect(s.cell);
    tryMove({ origin: s.cell, axis: horizontal ? 'row' : 'col', direction: (horizontal ? dx : dy) > 0 ? 1 : -1 });
    return true;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    commit(e);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    if (!s.done && !commit(e)) onSelect(s.cell);
    start.current = null;
  };

  const moveSelection = (dr: number, dc: number) => {
    let r = rowOf(selected) + dr;
    let c = colOf(selected) + dc;
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE) {
      if (def.mask[cellAt(r, c)] === '#') return onSelect(cellAt(r, c));
      r += dr;
      c += dc;
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const keys: Record<string, [number, number]> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
    const k = keys[e.key];
    if (!k) return;
    e.preventDefault();
    if (e.shiftKey) return moveSelection(k[0], k[1]);
    tryMove({ origin: selected, axis: k[1] !== 0 ? 'row' : 'col', direction: (k[0] + k[1]) as Direction });
  };

  return (
    <div
      ref={boardRef}
      className="board"
      role="group"
      aria-label="Nine by nine DNA board. Swipe a tile, or use arrow keys to slide the selected tile's segment; Shift plus arrows moves the selection."
      data-testid="board"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (start.current = null)}
      onKeyDown={onKeyDown}
    >
      {Array.from({ length: SIZE * SIZE }, (_, cell) => {
        const ch = board[cell]!;
        const r = rowOf(cell);
        const c = colOf(cell);
        const style = { gridRow: r + 1, gridColumn: c + 1 };
        if (ch === '.') return <div key={cell} className="cell hole" style={style} aria-hidden="true" />;
        const t = trackInfo.get(cell);
        const classes = ['cell', 'tile', `b-${ch}`];
        if (t) classes.push('goal', t.ok ? 'ok' : 'off');
        if (cell === selected) classes.push('selected');
        if (hintSegment.has(cell)) classes.push('hinted');
        const label = `${ch}, row ${r + 1}, column ${c + 1}${t ? `, target ${t.group} position ${t.pos + 1}, ${t.ok ? 'correct' : 'not yet correct'}` : ''}`;
        return (
          <button key={cell} type="button" data-cell={cell} data-base={ch} className={classes.join(' ')} style={style} tabIndex={cell === selected ? 0 : -1} aria-label={label} aria-pressed={cell === selected}>
            <span className="letter">{ch}</span>
            {t?.ok && <span className="tick" aria-hidden="true" />}
          </button>
        );
      })}
      {def.tracks.map((t) => {
        const r0 = rowOf(t.cells[0]!);
        const c0 = colOf(t.cells[0]!);
        const r1 = rowOf(t.cells[t.cells.length - 1]!);
        const c1 = colOf(t.cells[t.cells.length - 1]!);
        return (
          <div key={t.group} className={`track-outline ${t.orientation}`} style={{ gridRow: `${r0 + 1} / ${r1 + 2}`, gridColumn: `${c0 + 1} / ${c1 + 2}` }} aria-hidden="true">
            <span className="track-badge">{t.group}</span>
          </div>
        );
      })}
      {hint && hintCell !== null && (
        <div className={`hint-cue ${showGestureCue ? 'gesture' : ''} dir-${dirName(hint)}`} style={{ gridRow: rowOf(hintCell) + 1, gridColumn: colOf(hintCell) + 1 }} aria-hidden="true" data-testid="hint-cue">
          <span>{arrow(hint)}</span>
        </div>
      )}
    </div>
  );
}

export { dirName, arrow };
