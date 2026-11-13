import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { SIZE, cellAt, colOf, normaliseSteps, rowOf, segmentCells } from '../engine/grid.ts';
import { easeOutCubic, lockAxis, nearestStep, releaseVelocity, resolveSteps, SNAP_MS, wrapOffset } from './dragMath.ts';
import type { Axis, Board as BoardString, Cell, Direction, LevelDefinition, Move, Slide } from '../engine/types.ts';
import { slideArrow, slideDir } from './hintCell.ts';

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
  hint: Slide | null;
  hintCell: Cell | null;
  /** Show the restored repair base (only after a win). */
  repaired: boolean;
  showGestureCue: boolean;
  locked: boolean;
  reducedMotion: boolean;
  animation: MoveAnimation | null;
  onMove: (move: Move) => void;
  /** Commit a continuous drag of `steps` cells. Returns false if the engine rejected it. */
  onSlide: (origin: Cell, axis: Axis, steps: number) => boolean;
  /** Live whole-cell preview while dragging (null = none). */
  onPreview: (preview: SlidePreview | null) => void;
  onSelect: (cell: Cell) => void;
}

interface DragState {
  id: number;
  startX: number;
  startY: number;
  cell: Cell;
  axis: Axis | null;
  segment: Cell[];
  pitch: number;
  delta: number;
  samples: { t: number; d: number }[];
  clip: HTMLDivElement | null;
  clones: HTMLElement[][];
  originals: HTMLElement[];
  raf: number;
  previewStep: number;
  /** True for a programmatic step animation (arrows/keyboard): no preview, no commit. */
  anim?: boolean;
  phase: 'pending' | 'dead' | 'dragging' | 'settling' | 'committing';
}

export interface SlidePreview {
  origin: Cell;
  axis: Axis;
  steps: number;
}
export const SLIDE_MS = 150;


export function Board({ def, board, matches, selected, hint, hintCell, repaired, showGestureCue, locked, reducedMotion, animation, onMove, onSlide, onPreview, onSelect }: Props) {
  const boardRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    // Keep keyboard focus on the selected tile when the board has focus.
    const el = boardRef.current;
    if (el && el.contains(document.activeElement)) el.querySelector<HTMLElement>(`[data-cell="${selected}"]`)?.focus();
  }, [selected, board]);

  // ---- Continuous drag -------------------------------------------------------------------
  // Imperative, transform-only rendering via rAF; React state is touched only on whole-cell
  // preview changes and on commit, so the drag stays at display frame rate.
  const drag = useRef<DragState | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  const teardown = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    if (d.raf) cancelAnimationFrame(d.raf);
    d.clip?.remove();
    d.originals.forEach((o) => (o.style.visibility = ''));
    boardRef.current?.classList.remove('is-dragging');
    drag.current = null;
  }, []);

  // Once the engine commits (board changes) swap the clones back for the real, updated tiles before paint.
  useLayoutEffect(() => {
    if (drag.current?.phase === 'committing') teardown();
  }, [board, teardown]);
  useEffect(() => () => teardown(), [teardown]);

  const renderDrag = () => {
    const d = drag.current;
    if (!d || !d.clip) return;
    d.raf = 0;
    const n = d.segment.length;
    const length = n * d.pitch;
    d.clones.forEach((pair, i) => {
      const base = wrapOffset(i * d.pitch + d.delta, length);
      pair.forEach((clone, copy) => {
        const p = base - copy * length;
        clone.style.transform = d.axis === 'row' ? `translate3d(${p}px,0,0)` : `translate3d(0,${p}px,0)`;
      });
    });
    const step = normaliseSteps(nearestStep(d.delta, d.pitch), n);
    if (!d.anim && step !== d.previewStep) {
      d.previewStep = step;
      onPreview(step === 0 ? null : { origin: d.cell, axis: d.axis!, steps: step });
    }
  };
  const schedule = () => {
    const d = drag.current;
    if (d && !d.raf) d.raf = requestAnimationFrame(renderDrag);
  };

  const beginDrag = (d: DragState): boolean => {
    const el = boardRef.current;
    const layer = layerRef.current;
    if (!el || !layer || !d.axis) return false;
    const originals = d.segment.map((c) => el.querySelector<HTMLElement>(`[data-cell="${c}"]`)!);
    if (originals.some((o) => !o)) return false;
    const [a, b] = originals as [HTMLElement, HTMLElement];
    const pitch = d.axis === 'row' ? b.offsetLeft - a.offsetLeft : b.offsetTop - a.offsetTop;
    const w = a.offsetWidth;
    const h = a.offsetHeight;
    const n = d.segment.length;
    const clip = document.createElement('div');
    clip.className = `drag-clip ${d.axis}`;
    Object.assign(clip.style, {
      left: `${a.offsetLeft}px`,
      top: `${a.offsetTop}px`,
      width: `${d.axis === 'row' ? n * pitch - (pitch - w) : w}px`,
      height: `${d.axis === 'col' ? n * pitch - (pitch - h) : h}px`,
    });
    const clones = originals.map((o) =>
      [0, 1].map(() => {
        const c = o.cloneNode(true) as HTMLElement;
        c.removeAttribute('data-cell');
        c.removeAttribute('tabindex');
        c.setAttribute('aria-hidden', 'true');
        c.dataset.clone = 'true';
        c.classList.remove('selected', 'hinted', 'ok', 'off');
        c.querySelector('.tick')?.remove();
        Object.assign(c.style, { position: 'absolute', left: '0', top: '0', width: `${w}px`, height: `${h}px`, gridRow: '', gridColumn: '', visibility: '' });
        clip.appendChild(c);
        return c;
      }),
    );
    layer.appendChild(clip);
    originals.forEach((o) => (o.style.visibility = 'hidden'));
    el.classList.add('is-dragging');
    Object.assign(d, { pitch, clip, clones, originals, phase: 'dragging' as const });
    renderDrag();
    return true;
  };

  const settle = (target: number, then: () => void) => {
    const d = drag.current;
    if (!d) return;
    d.phase = 'settling';
    const from = d.delta;
    const to = target * d.pitch;
    const duration = reducedMotion ? 0 : SNAP_MS;
    busyUntil.current = performance.now() + duration + 30;
    const t0 = performance.now();
    const tick = () => {
      const cur = drag.current;
      if (!cur) return;
      const t = duration === 0 ? 1 : Math.min(1, (performance.now() - t0) / duration);
      cur.delta = from + (to - from) * easeOutCubic(t);
      renderDrag();
      if (t < 1) cur.raf = requestAnimationFrame(tick);
      else then();
    };
    if (d.raf) cancelAnimationFrame(d.raf);
    d.raf = requestAnimationFrame(tick);
  };

  // Arrow/keyboard steps reuse the drag strip: the new tiles slide in from one cell back, and the
  // wrapped tile enters from the opposite end of its segment (clipped, never crossing holes).
  const lastAnim = useRef(0);
  useLayoutEffect(() => {
    if (!animation || animation.nonce === lastAnim.current) return;
    lastAnim.current = animation.nonce;
    if (reducedMotion || drag.current) return;
    const d: DragState = {
      id: -1, startX: 0, startY: 0, cell: animation.segment[0]!, axis: animation.axis, segment: animation.segment,
      pitch: 0, delta: 0, samples: [], clip: null, clones: [], originals: [], raf: 0, previewStep: 0, anim: true, phase: 'pending',
    };
    drag.current = d;
    if (!beginDrag(d)) { drag.current = null; return; }
    d.delta = -animation.direction * d.pitch;
    renderDrag();
    settle(0, teardown);
  });

  const finishDrag = (cancelled: boolean) => {
    const d = drag.current;
    if (!d || d.phase !== 'dragging') return;
    const n = d.segment.length;
    const k = cancelled ? 0 : resolveSteps(d.delta, d.pitch, releaseVelocity(d.samples));
    settle(k, () => {
      const cur = drag.current;
      if (!cur) return;
      onPreview(null);
      if (normaliseSteps(k, n) === 0) return teardown();
      cur.phase = 'committing';
      // A rejected slide (e.g. identical letters) leaves the board unchanged, so tear down here.
      if (!onSlide(cur.cell, cur.axis!, k)) teardown();
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const tile = (e.target as HTMLElement).closest<HTMLElement>('[data-cell]');
    if (!tile || drag.current || performance.now() < busyUntil.current) return;
    drag.current = {
      id: e.pointerId, startX: e.clientX, startY: e.clientY, cell: Number(tile.dataset.cell), axis: null, segment: [],
      pitch: 0, delta: 0, samples: [], clip: null, clones: [], originals: [], raf: 0, previewStep: 0, phase: 'pending',
    };
    boardRef.current?.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (d.phase === 'pending') {
      const axis = lockAxis(dx, dy);
      if (!axis) return;
      onSelect(d.cell);
      d.axis = axis;
      d.segment = segmentCells(def.mask, d.cell, axis);
      if (locked || d.segment.length < 2 || !beginDrag(d)) {
        d.phase = 'dead'; // single-cell segment (or solved board): nothing can move on this axis
        return;
      }
    }
    if (d.phase !== 'dragging') return;
    d.delta = d.axis === 'row' ? dx : dy;
    d.samples.push({ t: e.timeStamp, d: d.delta });
    if (d.samples.length > 12) d.samples.shift();
    schedule();
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (d.phase === 'pending') {
      drag.current = null;
      onSelect(d.cell);
    } else if (d.phase === 'dead') {
      drag.current = null;
    } else {
      onPointerMove(e);
      finishDrag(false);
    }
  };
  const onPointerCancel = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (d.phase === 'dragging') finishDrag(true);
    else if (d.phase === 'pending' || d.phase === 'dead') drag.current = null;
    // 'settling'/'committing' finish on their own (lostpointercapture also fires after a normal pointerup).
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
      className={`board ${locked ? 'solved' : ''}`}
      role="group"
      aria-label="Nine by nine DNA board. Drag a tile to slide its whole row or column segment, or use arrow keys to slide the selected tile's segment; Shift plus arrows moves the selection."
      data-testid="board"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
      onKeyDown={onKeyDown}
    >
      {Array.from({ length: SIZE * SIZE }, (_, cell) => {
        const ch = board[cell]!;
        const r = rowOf(cell);
        const c = colOf(cell);
        const style = { gridRow: r + 1, gridColumn: c + 1 };
        if (ch === '.') {
          if (def.repair?.cell === cell) {
            return repaired ? (
              <div key={cell} className={`cell tile restored b-${def.repair.expected}`} style={style} data-testid="repair-cell" aria-label={`Restored ${def.repair.expected}`}>
                <span className="letter">{def.repair.expected}</span>
              </div>
            ) : (
              <div key={cell} className="cell hole repair-gap" style={style} data-testid="repair-cell" aria-label="Missing base, restored on win">
                <span>?</span>
              </div>
            );
          }
          return <div key={cell} className="cell hole" style={style} aria-hidden="true" />;
        }
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
          <div key={t.group} className={`track-outline ${t.orientation} strand-${t.strand} ${matches[t.group - 1]?.every(Boolean) ? 'all-ok' : ''}`} data-testid={`track-${t.group}`} style={{ gridRow: `${r0 + 1} / ${r1 + 2}`, gridColumn: `${c0 + 1} / ${c1 + 2}` }} aria-hidden="true">
            <span className="track-badge">{t.group}</span>
          </div>
        );
      })}
      <div ref={layerRef} className="drag-layer" aria-hidden="true" />
      {hint && hintCell !== null && (
        <div className={`hint-cue ${showGestureCue ? 'gesture' : ''} dir-${slideDir(hint)}`} style={{ gridRow: rowOf(hintCell) + 1, gridColumn: colOf(hintCell) + 1 }} aria-hidden="true" data-testid="hint-cue">
          <span>{slideArrow(hint)}{Math.abs(hint.steps) > 1 ? <sup>{Math.abs(hint.steps)}</sup> : null}</span>
        </div>
      )}
    </div>
  );
}

