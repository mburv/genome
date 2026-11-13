/**
 * Bounded in-game hint search (drag metric) under the CURRENT topology: bond locks stay fixed, a
 * scaffold ticks down one per drag and expires. Pure and synchronous; only run when the player asks
 * for a hint and the certified path is unavailable (after CRISPR, or while a scaffold changes the
 * board's segments). Breadth-first, so a found solution is shortest within the explored depth.
 * Limits: maxNodes generated states (default 40k ≈ all 1-drag and most 2-drag positions on a busy
 * board, a few tens of ms); deeper solutions are not found and the caller falls back to undo/restart.
 */
import { normaliseSteps } from './grid.ts';
import { effectiveSegment, type Scaffold } from './powers.ts';
import type { Axis, Board, Cell, LevelDefinition, Slide } from './types.ts';

export interface SearchStart {
  board: Board;
  locks: readonly Cell[];
  scaffold: Scaffold | null;
}

export interface SearchResult {
  /** Drags to a win, [] if already solved, null if none found within the limits. */
  slides: Slide[] | null;
  nodes: number;
  /** Every position up to this many drags was examined. */
  exhaustedDepth: number;
}

interface Seg {
  origin: Cell;
  axis: Axis;
  cells: Cell[];
}

function segments(def: LevelDefinition, locks: readonly Cell[], scaffold: Scaffold | null): Seg[] {
  const out: Seg[] = [];
  const seen = new Set<string>();
  for (let c = 0; c < 81; c++) {
    if (def.mask[c] !== '#') continue;
    for (const axis of ['row', 'col'] as const) {
      const cells = effectiveSegment(def.mask, locks, scaffold, c, axis);
      if (cells.length < 2) continue;
      const key = `${axis}:${cells.join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ origin: c, axis, cells });
    }
  }
  return out;
}

const solvedBy = (def: LevelDefinition, b: Board): boolean => def.tracks.every((t) => t.cells.every((c, i) => b[c] === t.expected[i]));

function rotate(board: Board, cells: readonly Cell[], k: number): Board {
  const n = cells.length;
  const out = board.split('');
  for (let i = 0; i < n; i++) out[cells[(((i + k) % n) + n) % n]!] = board[cells[i]!]!;
  return out.join('');
}

export function searchSolution(def: LevelDefinition, start: SearchStart, opts: { maxDepth: number; maxNodes: number }): SearchResult {
  if (solvedBy(def, start.board)) return { slides: [], nodes: 1, exhaustedDepth: 0 };
  const plain = segments(def, start.locks, null);
  const withScaffold = start.scaffold ? segments(def, start.locks, start.scaffold) : plain;
  type Node = { board: Board; rem: number; key: string };
  const parent = new Map<string, { prev: string; slide: Slide } | null>();
  const k0 = `${start.board}|${start.scaffold?.remaining ?? 0}`;
  parent.set(k0, null);
  let frontier: Node[] = [{ board: start.board, rem: start.scaffold?.remaining ?? 0, key: k0 }];
  let nodes = 1;
  for (let depth = 1; depth <= opts.maxDepth; depth++) {
    const next: Node[] = [];
    for (const node of frontier) {
      const segs = node.rem > 0 ? withScaffold : plain;
      for (const seg of segs) {
        const n = seg.cells.length;
        for (let k = -Math.floor((n - 1) / 2); k <= Math.floor(n / 2); k++) {
          if (k === 0) continue;
          const board = rotate(node.board, seg.cells, k);
          if (board === node.board) continue;
          const rem = node.rem > 0 ? node.rem - 1 : 0;
          const key = `${board}|${rem}`;
          if (parent.has(key)) continue;
          parent.set(key, { prev: node.key, slide: { origin: seg.origin, axis: seg.axis, steps: normaliseSteps(k, n) } });
          nodes++;
          if (solvedBy(def, board)) {
            const slides: Slide[] = [];
            let cur: string | undefined = key;
            while (cur) {
              const p = parent.get(cur);
              if (!p) break;
              slides.unshift(p.slide);
              cur = p.prev;
            }
            return { slides, nodes, exhaustedDepth: depth - 1 };
          }
          if (nodes >= opts.maxNodes) return { slides: null, nodes, exhaustedDepth: depth - 1 };
          next.push({ board, rem, key });
        }
      }
    }
    frontier = next;
    if (!frontier.length) return { slides: null, nodes, exhaustedDepth: depth };
  }
  return { slides: null, nodes, exhaustedDepth: opts.maxDepth };
}
