import { applyMove, applySlide, inverseMove, moveKey, baseCounts, slideToMoves } from './grid.ts';
import type { Axis, Board, Cell, LevelDefinition, Move } from './types.ts';

export const HISTORY_CAP = 100;

export interface Snapshot {
  board: Board;
  moves: number;
  recovery: Move[];
}

export interface PuzzleState {
  levelId: string;
  board: Board;
  moves: number;
  status: 'playing' | 'solved';
  /**
   * Certified path from the level's solved board to the current board (forward moves).
   * The recovery hint is the inverse of the last entry.
   */
  recovery: Move[];
  /** Undo snapshots, newest last, capped at HISTORY_CAP. */
  history: Snapshot[];
}

/**
 * `rotate` = one step (arrows, keyboard, hints). `slide` = one continuous drag of `steps` cells
 * (any integer; wraps mod segment length). A slide is ONE undoable action and counts as ONE move.
 */
export type Command =
  | { type: 'rotate'; move: Move }
  | { type: 'slide'; origin: Cell; axis: Axis; steps: number }
  | { type: 'undo' }
  | { type: 'restart' };

export type GameEvent =
  | { type: 'moved'; move: Move; segment: Cell[] }
  | { type: 'slid'; origin: Cell; axis: Axis; steps: number; segment: Cell[] }
  | { type: 'undone' }
  | { type: 'restarted' }
  | { type: 'solved'; levelId: string };

export type RejectReason = 'solved' | 'immobile' | 'no-op' | 'no-history' | 'wrong-level';

export interface CommandResult {
  state: PuzzleState;
  events: GameEvent[];
  accepted: boolean;
  reason?: RejectReason;
}

export function createInitialState(def: LevelDefinition): PuzzleState {
  return { levelId: def.id, board: def.initial, moves: 0, status: 'playing', recovery: [...def.scramble], history: [] };
}

export function trackMatches(def: LevelDefinition, board: Board): boolean[][] {
  return def.tracks.map((t) => t.cells.map((cell, i) => board[cell] === t.expected[i]));
}

/** A level is complete only when every track matches simultaneously. */
export function isSolved(def: LevelDefinition, board: Board): boolean {
  return def.tracks.every((t) => t.cells.every((cell, i) => board[cell] === t.expected[i]));
}

export function trackSequence(board: Board, cells: readonly Cell[]): string {
  return cells.map((c) => board[c]).join('');
}

/** States along the recovery path, from the solved board (index 0) to the current board. */
function recoveryStates(def: LevelDefinition, recovery: readonly Move[]): Board[] {
  const states = [def.solved];
  let b = def.solved;
  for (const m of recovery) {
    b = applyMove(def.mask, b, m).board;
    states.push(b);
  }
  return states;
}

/** Update the certified path after the board moved to `next` via `move`. Cycles collapse. */
function extendRecovery(def: LevelDefinition, recovery: readonly Move[], next: Board, move: Move): Move[] {
  const states = recoveryStates(def, recovery);
  const idx = states.indexOf(next);
  if (idx >= 0) return recovery.slice(0, idx);
  return [...recovery, move];
}

const reject = (state: PuzzleState, reason: RejectReason): CommandResult => ({ state, events: [], accepted: false, reason });

export function applyCommand(def: LevelDefinition, state: PuzzleState, command: Command): CommandResult {
  if (state.levelId !== def.id) return reject(state, 'wrong-level');
  switch (command.type) {
    case 'rotate': {
      if (state.status === 'solved') return reject(state, 'solved');
      const outcome = applyMove(def.mask, state.board, command.move);
      if (outcome.segment.length < 2) return reject(state, 'immobile');
      if (!outcome.changed) return reject(state, 'no-op');
      const snapshot: Snapshot = { board: state.board, moves: state.moves, recovery: state.recovery };
      const history = [...state.history, snapshot].slice(-HISTORY_CAP);
      const solved = isSolved(def, outcome.board);
      const next: PuzzleState = {
        levelId: state.levelId,
        board: outcome.board,
        moves: state.moves + 1,
        status: solved ? 'solved' : 'playing',
        recovery: extendRecovery(def, state.recovery, outcome.board, command.move),
        history,
      };
      const events: GameEvent[] = [{ type: 'moved', move: command.move, segment: outcome.segment }];
      if (solved) events.push({ type: 'solved', levelId: def.id });
      return { state: next, events, accepted: true };
    }
    case 'slide': {
      if (state.status === 'solved') return reject(state, 'solved');
      const outcome = applySlide(def.mask, state.board, command.origin, command.axis, command.steps);
      if (outcome.segment.length < 2) return reject(state, 'immobile');
      if (!outcome.changed) return reject(state, 'no-op');
      const steps = slideToMoves(def.mask, command.origin, command.axis, command.steps);
      // Keep the recovery path certified by extending it one single-step move at a time.
      let recovery = state.recovery;
      let b = state.board;
      for (const m of steps) {
        b = applyMove(def.mask, b, m).board;
        recovery = extendRecovery(def, recovery, b, m);
      }
      const solved = isSolved(def, outcome.board);
      const next: PuzzleState = {
        levelId: state.levelId,
        board: outcome.board,
        moves: state.moves + 1,
        status: solved ? 'solved' : 'playing',
        recovery,
        history: [...state.history, { board: state.board, moves: state.moves, recovery: state.recovery }].slice(-HISTORY_CAP),
      };
      const net = steps.length * (steps[0]?.direction ?? 1);
      const events: GameEvent[] = [{ type: 'slid', origin: command.origin, axis: command.axis, steps: net, segment: outcome.segment }];
      if (solved) events.push({ type: 'solved', levelId: def.id });
      return { state: next, events, accepted: true };
    }
    case 'undo': {
      if (state.status === 'solved') return reject(state, 'solved');
      const last = state.history[state.history.length - 1];
      if (!last) return reject(state, 'no-history');
      return {
        state: { ...state, board: last.board, moves: last.moves, recovery: last.recovery, history: state.history.slice(0, -1) },
        events: [{ type: 'undone' }],
        accepted: true,
      };
    }
    case 'restart':
      // Also acts as "replay" for a solved level. Completion credit lives outside the puzzle state.
      return { state: createInitialState(def), events: [{ type: 'restarted' }], accepted: true };
  }
}

/**
 * Certified recovery hint: a legal move that steps back along a replay-verified path to the
 * solved board. Not necessarily the shortest solution. Returns null if solved or unverifiable.
 */
export function recoveryHint(def: LevelDefinition, state: PuzzleState): Move | null {
  if (state.status === 'solved' || state.recovery.length === 0) return null;
  const states = recoveryStates(def, state.recovery);
  if (states[states.length - 1] !== state.board) return null;
  const hint = inverseMove(state.recovery[state.recovery.length - 1]!);
  const outcome = applyMove(def.mask, state.board, hint);
  return outcome.changed && outcome.board === states[states.length - 2] ? hint : null;
}

/** Replay a certificate from the initial board without powers. */
export function replayCertificate(def: LevelDefinition, moves: readonly Move[] = def.certificate): { board: Board; solved: boolean; valid: boolean } {
  let board = def.initial;
  for (const m of moves) {
    const o = applyMove(def.mask, board, m);
    if (!o.changed) return { board, solved: false, valid: false };
    board = o.board;
  }
  return { board, solved: isSolved(def, board), valid: true };
}

/** Validate that a board is reachable-shaped for this level: same holes, same base multiset. */
export function isCompatibleBoard(def: LevelDefinition, board: unknown): board is Board {
  if (typeof board !== 'string' || board.length !== def.initial.length || !/^[ATCG.]+$/.test(board)) return false;
  for (let i = 0; i < board.length; i++) if ((board[i] === '.') !== (def.mask[i] === '.')) return false;
  const a = baseCounts(board);
  const b = baseCounts(def.initial);
  return a.A === b.A && a.T === b.T && a.C === b.C && a.G === b.G;
}

export { moveKey };
