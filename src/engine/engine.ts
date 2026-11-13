import { applyMove, inverseMove, moveKey, normaliseSteps, segmentCells } from './grid.ts';
import {
  availableEnergy, codonComplete, effectiveSegment, ENERGY_CAP, levelCodons as codonsOf, POWER_COST, powersEnabled, SCAFFOLD_TURNS, scaffoldTrack,
  START_ENERGY, type Codon, type Scaffold,
} from './powers.ts';
import { searchSolution } from './search.ts';
import { isCustomSymbol, symbolFor, symbolSequence, type CustomTokens } from './tokens.ts';
import { BASES, type Axis, type Base, type Board, type Cell, type LevelDefinition, type Move, type Power, type Slide } from './types.ts';

export const HISTORY_CAP = 100;

/** Everything an undo restores. The energy *ledger* (earned + credited codons) is deliberately absent. */
export interface Snapshot {
  board: Board;
  moves: number;
  /**
   * Certified path from the level's solved board to `board` (forward single steps, normal topology), or
   * null once a power changed the board or a move used a topology the path cannot express.
   */
  recovery: Move[] | null;
  /** Cells of the active Ligase bond (empty = none). Locked cells stop rotation on both axes. */
  locks: Cell[];
  scaffold: Scaffold | null;
  /** Net energy spent in this attempt (reversible). */
  spent: number;
  /** Remaining free tutorial uses (enzyme-lab loans). */
  freeUses: Power[];
  /** CRISPR edits applied on this board's lineage (bounds how far the base multiset may differ). */
  edits: number;
  /** M4: sequences created by CRISPR edits on long tokens (symbol → sequence); {} otherwise. */
  custom: CustomTokens;
}

/**
 * Per-attempt, non-reversible energy ledger: codon keys already credited (or ineligible because they
 * were correct at the start / completed by a power) and the energy actually awarded. Undo keeps it, so
 * energy cannot be farmed; restart starts a new attempt with a fresh ledger.
 */
export interface Ledger {
  earned: number;
  credited: string[];
}

export interface PuzzleState extends Snapshot {
  levelId: string;
  status: 'playing' | 'solved';
  /** Undo snapshots, newest last, capped at HISTORY_CAP. */
  history: Snapshot[];
  ledger: Ledger;
}

/**
 * `rotate` = one step (arrows, keyboard). `slide` = one continuous drag of `steps` cells. Both are
 * "normal rotations": one undoable action, one move, one scaffold tick, may earn codon energy.
 */
export type Command =
  | { type: 'rotate'; move: Move }
  | { type: 'slide'; origin: Cell; axis: Axis; steps: number }
  /** CRISPR: set base `base` at position `pos` (0-based) of the tile's sequence (pos 0 on single-base levels). */
  | { type: 'edit'; cell: Cell; base: Base; pos?: number }
  | { type: 'bond'; cell: Cell }
  | { type: 'release' }
  | { type: 'scaffold'; axis: Axis; gap: Cell[] }
  | { type: 'undo' }
  | { type: 'restart' };

export type GameEvent =
  | { type: 'moved'; move: Move; segment: Cell[] }
  | { type: 'slid'; origin: Cell; axis: Axis; steps: number; segment: Cell[] }
  | { type: 'edited'; cell: Cell; from: string; to: string; pos: number; fromBase: Base; toBase: Base }
  | { type: 'bonded'; cells: Cell[] }
  | { type: 'released'; cells: Cell[] }
  | { type: 'scaffolded'; axis: Axis; gap: Cell[]; cells: Cell[] }
  | { type: 'scaffold-expired' }
  | { type: 'spent'; power: Power; cost: number; free: boolean }
  | { type: 'energy'; gained: number; codons: number }
  | { type: 'undone' }
  | { type: 'restarted' }
  | { type: 'solved'; levelId: string };

export type RejectReason =
  | 'solved' | 'immobile' | 'no-op' | 'no-history' | 'wrong-level' | 'locked' | 'powers-unavailable' | 'energy'
  | 'invalid-target' | 'same-base' | 'not-a-codon' | 'codon-incomplete' | 'bond-active' | 'scaffold-active'
  | 'scaffold-conflict' | 'no-bond';

export interface CommandResult {
  state: PuzzleState;
  events: GameEvent[];
  accepted: boolean;
  reason?: RejectReason;
}

const codonCache = new WeakMap<LevelDefinition, Codon[]>();
export function levelCodons(def: LevelDefinition): Codon[] {
  let c = codonCache.get(def);
  if (!c) codonCache.set(def, (c = codonsOf(def)));
  return c;
}

export function createInitialState(def: LevelDefinition): PuzzleState {
  return {
    levelId: def.id,
    board: def.initial,
    moves: 0,
    status: 'playing',
    recovery: [...def.scramble],
    history: [],
    locks: [],
    scaffold: null,
    spent: 0,
    freeUses: def.lab ? [def.lab] : [],
    edits: 0,
    custom: {},
    // Codons already correct at the start are ineligible for energy.
    ledger: { earned: 0, credited: levelCodons(def).filter((c) => codonComplete(def.initial, c)).map((c) => c.key) },
  };
}

export const energyOf = (s: Pick<PuzzleState, 'ledger' | 'spent'>): number => availableEnergy(s.ledger.earned, s.spent);

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

/** Rotate tiles along an arbitrary ordered cell list by k: old[i] → new[(i + k) mod n]. */
export function rotateBy(board: Board, cells: readonly Cell[], k: number): Board {
  const n = cells.length;
  if (n < 2 || k % n === 0) return board;
  const out = board.split('');
  for (let i = 0; i < n; i++) out[cells[(((i + k) % n) + n) % n]!] = board[cells[i]!]!;
  return out.join('');
}

/** The segment that would rotate for (origin, axis) in this state (locks and scaffold applied). */
export const segmentIn = (def: LevelDefinition, s: Pick<Snapshot, 'locks' | 'scaffold'>, origin: Cell, axis: Axis): Cell[] =>
  effectiveSegment(def.mask, s.locks, s.scaffold, origin, axis);

const sameCells = (a: readonly Cell[], b: readonly Cell[]): boolean => a.length === b.length && a.every((c, i) => c === b[i]);

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

const snapshotOf = (s: PuzzleState): Snapshot => ({
  board: s.board, moves: s.moves, recovery: s.recovery, locks: s.locks, scaffold: s.scaffold, spent: s.spent, freeUses: s.freeUses, edits: s.edits, custom: s.custom,
});
const pushHistory = (s: PuzzleState): Snapshot[] => [...s.history, snapshotOf(s)].slice(-HISTORY_CAP);

/** Pay for a power: a tutorial loan first, else energy. Spending is computed from the capped balance. */
function pay(state: PuzzleState, power: Power): { spent: number; freeUses: Power[]; cost: number; free: boolean } | null {
  const loan = state.freeUses.indexOf(power);
  if (loan >= 0) return { spent: state.spent, freeUses: state.freeUses.filter((_, i) => i !== loan), cost: 0, free: true };
  const cost = POWER_COST[power];
  const avail = energyOf(state);
  if (avail < cost) return null;
  // New balance = capped balance − cost (so banked-over-cap energy never pays for anything); undo restores `spent`.
  return { spent: START_ENERGY + state.ledger.earned - (avail - cost), freeUses: state.freeUses, cost, free: false };
}

/** Credit newly complete eligible codons after a normal rotation (cap discards the excess). */
function award(def: LevelDefinition, state: PuzzleState, board: Board, spent: number): { ledger: Ledger; event: GameEvent | null } {
  const fresh = levelCodons(def).filter((c) => c.rewardable && !state.ledger.credited.includes(c.key) && codonComplete(board, c));
  if (!fresh.length) return { ledger: state.ledger, event: null };
  const gained = Math.max(0, Math.min(fresh.length, ENERGY_CAP - availableEnergy(state.ledger.earned, spent)));
  return {
    ledger: { earned: state.ledger.earned + gained, credited: [...state.ledger.credited, ...fresh.map((c) => c.key)] },
    event: { type: 'energy', gained, codons: fresh.length },
  };
}

function rotation(def: LevelDefinition, state: PuzzleState, origin: Cell, axis: Axis, steps: number, kind: 'rotate' | 'slide'): CommandResult {
  if (state.status === 'solved') return reject(state, 'solved');
  if (state.locks.includes(origin)) return reject(state, 'locked');
  const seg = segmentIn(def, state, origin, axis);
  if (seg.length < 2) return reject(state, 'immobile');
  const k = normaliseSteps(steps, seg.length);
  const board = rotateBy(state.board, seg, k);
  if (k === 0 || board === state.board) return reject(state, 'no-op');
  // The certified path stays valid only for moves identical to normal-topology moves.
  let recovery: Move[] | null = null;
  if (state.recovery && sameCells(seg, segmentCells(def.mask, origin, axis))) {
    recovery = state.recovery;
    let b = state.board;
    const direction = k > 0 ? 1 : -1;
    for (let i = 0; i < Math.abs(k); i++) {
      const m: Move = { origin, axis, direction };
      b = applyMove(def.mask, b, m).board;
      recovery = extendRecovery(def, recovery, b, m);
    }
  }
  const events: GameEvent[] = [kind === 'rotate' ? { type: 'moved', move: { origin, axis, direction: k > 0 ? 1 : -1 }, segment: seg } : { type: 'slid', origin, axis, steps: k, segment: seg }];
  let scaffold = state.scaffold;
  if (scaffold) {
    scaffold = scaffold.remaining > 1 ? { ...scaffold, remaining: scaffold.remaining - 1 } : null;
    if (!scaffold) events.push({ type: 'scaffold-expired' });
  }
  const { ledger, event } = award(def, state, board, state.spent);
  if (event) events.push(event);
  const solved = isSolved(def, board);
  if (solved) events.push({ type: 'solved', levelId: def.id });
  return {
    state: { ...state, board, moves: state.moves + 1, status: solved ? 'solved' : 'playing', recovery, scaffold, ledger, history: pushHistory(state) },
    events,
    accepted: true,
  };
}

function powerGuard(def: LevelDefinition, state: PuzzleState): RejectReason | null {
  if (state.status === 'solved') return 'solved';
  if (!powersEnabled(def)) return 'powers-unavailable';
  return null;
}

export function applyCommand(def: LevelDefinition, state: PuzzleState, command: Command): CommandResult {
  if (state.levelId !== def.id) return reject(state, 'wrong-level');
  switch (command.type) {
    case 'rotate':
      return rotation(def, state, command.move.origin, command.move.axis, command.move.direction, 'rotate');
    case 'slide':
      return rotation(def, state, command.origin, command.axis, command.steps, 'slide');
    case 'edit': {
      const g = powerGuard(def, state);
      if (g) return reject(state, g);
      const { cell, base } = command;
      const pos = command.pos ?? 0;
      if (!Number.isInteger(cell) || def.mask[cell] !== '#' || !BASES.includes(base)) return reject(state, 'invalid-target');
      if (state.locks.includes(cell)) return reject(state, 'locked');
      const from = state.board[cell]!;
      const fromSeq = symbolSequence(def, state.custom, from);
      if (!Number.isInteger(pos) || pos < 0 || pos >= fromSeq.length) return reject(state, 'invalid-target');
      if (fromSeq[pos] === base) return reject(state, 'same-base');
      // Sequence-based identity: the edited piece becomes whichever token carries the new sequence.
      const target = symbolFor(def, state.custom, fromSeq.slice(0, pos) + base + fromSeq.slice(pos + 1));
      if (!target) return reject(state, 'invalid-target');
      const paid = pay(state, 'crispr');
      if (!paid) return reject(state, 'energy');
      const board = state.board.slice(0, cell) + target.symbol + state.board.slice(cell + 1);
      // Codons completed by a power are never rewarded (mark them ineligible).
      const done = levelCodons(def).filter((c) => !state.ledger.credited.includes(c.key) && codonComplete(board, c)).map((c) => c.key);
      const solved = isSolved(def, board);
      const events: GameEvent[] = [{ type: 'spent', power: 'crispr', cost: paid.cost, free: paid.free }, { type: 'edited', cell, from, to: target.symbol, pos, fromBase: fromSeq[pos] as Base, toBase: base }];
      if (solved) events.push({ type: 'solved', levelId: def.id });
      return {
        state: {
          ...state, board, moves: state.moves + 1, status: solved ? 'solved' : 'playing', recovery: null, edits: state.edits + 1, custom: target.custom,
          spent: paid.spent, freeUses: paid.freeUses, ledger: { ...state.ledger, credited: [...state.ledger.credited, ...done] }, history: pushHistory(state),
        },
        events,
        accepted: true,
      };
    }
    case 'bond': {
      const g = powerGuard(def, state);
      if (g) return reject(state, g);
      const codon = levelCodons(def).find((c) => c.cells.includes(command.cell));
      if (!codon) return reject(state, 'not-a-codon');
      if (!codonComplete(state.board, codon)) return reject(state, 'codon-incomplete');
      if (state.locks.length) return reject(state, 'bond-active');
      if (state.scaffold?.cells.some((c) => codon.cells.includes(c))) return reject(state, 'scaffold-conflict');
      const paid = pay(state, 'ligase');
      if (!paid) return reject(state, 'energy');
      return {
        state: { ...state, locks: [...codon.cells], moves: state.moves + 1, spent: paid.spent, freeUses: paid.freeUses, history: pushHistory(state) },
        events: [{ type: 'spent', power: 'ligase', cost: paid.cost, free: paid.free }, { type: 'bonded', cells: [...codon.cells] }],
        accepted: true,
      };
    }
    case 'release': {
      if (state.status === 'solved') return reject(state, 'solved');
      if (!state.locks.length) return reject(state, 'no-bond');
      // Free and undoable; not a move.
      return { state: { ...state, locks: [], history: pushHistory(state) }, events: [{ type: 'released', cells: state.locks }], accepted: true };
    }
    case 'scaffold': {
      const g = powerGuard(def, state);
      if (g) return reject(state, g);
      if (state.scaffold) return reject(state, 'scaffold-active');
      const t = scaffoldTrack(def.mask, state.locks, command.axis, command.gap);
      if (!('cells' in t)) return reject(state, 'invalid-target');
      const paid = pay(state, 'scaffold');
      if (!paid) return reject(state, 'energy');
      const scaffold: Scaffold = { axis: command.axis, gap: [...command.gap].sort((a, b) => a - b), cells: t.cells, remaining: SCAFFOLD_TURNS };
      return {
        state: { ...state, scaffold, moves: state.moves + 1, spent: paid.spent, freeUses: paid.freeUses, history: pushHistory(state) },
        events: [{ type: 'spent', power: 'scaffold', cost: paid.cost, free: paid.free }, { type: 'scaffolded', axis: scaffold.axis, gap: scaffold.gap, cells: scaffold.cells }],
        accepted: true,
      };
    }
    case 'undo': {
      if (state.status === 'solved') return reject(state, 'solved');
      const last = state.history[state.history.length - 1];
      if (!last) return reject(state, 'no-history');
      // Restores board, locks, scaffold and the energy transaction; the codon ledger is kept.
      return { state: { ...state, ...last, history: state.history.slice(0, -1) }, events: [{ type: 'undone' }], accepted: true };
    }
    case 'restart':
      // New attempt: fresh energy and ledger. Also acts as "replay" for a solved level.
      return { state: createInitialState(def), events: [{ type: 'restarted' }], accepted: true };
  }
}

// ---- Hints ----------------------------------------------------------------------------------

/**
 * Certified recovery hint: a legal single step back along a replay-verified path to the solved board.
 * Not necessarily the shortest solution. Null if solved, uncertified or blocked by a power.
 */
export function recoveryHint(def: LevelDefinition, state: PuzzleState): Move | null {
  if (state.status === 'solved' || !state.recovery || state.recovery.length === 0) return null;
  const states = recoveryStates(def, state.recovery);
  if (states[states.length - 1] !== state.board) return null;
  const hint = inverseMove(state.recovery[state.recovery.length - 1]!);
  if (!sameCells(segmentIn(def, state, hint.origin, hint.axis), segmentCells(def.mask, hint.origin, hint.axis))) return null;
  const outcome = applyMove(def.mask, state.board, hint);
  return outcome.changed && outcome.board === states[states.length - 2] ? hint : null;
}

export type Hint =
  | { kind: 'drag'; slide: Slide; segment: Cell[]; source: 'certified' | 'search' }
  /** The certified path is blocked by the bond: release it (free). */
  | { kind: 'release' }
  /** No verified move from here: undo this many times to a certified position. */
  | { kind: 'undo'; count: number }
  | { kind: 'restart' };

/** Cheap certified hint (no search): a whole drag along the certified path, or "release the bond". */
export function certifiedHint(def: LevelDefinition, state: PuzzleState): Hint | null {
  if (state.status === 'solved' || !state.recovery || state.recovery.length === 0) return null;
  const states = recoveryStates(def, state.recovery);
  if (states[states.length - 1] !== state.board) return null;
  const last = state.recovery[state.recovery.length - 1]!;
  const base = segmentCells(def.mask, last.origin, last.axis);
  if (!sameCells(segmentIn(def, state, last.origin, last.axis), base)) {
    return base.some((c) => state.locks.includes(c)) ? { kind: 'release' } : null;
  }
  const key = moveKey(def.mask, last);
  let k = 0;
  for (let i = state.recovery.length - 1; i >= 0 && moveKey(def.mask, state.recovery[i]!) === key; i--) k++;
  const steps = normaliseSteps(-last.direction * k, base.length);
  if (steps === 0) return null;
  return rotateBy(state.board, base, steps) === states[states.length - 1 - k]
    ? { kind: 'drag', slide: { origin: last.origin, axis: last.axis, steps }, segment: base, source: 'certified' }
    : null;
}

/** Certified recovery hint as a single drag (normal topology only). */
export function recoverySlideHint(def: LevelDefinition, state: PuzzleState): Slide | null {
  const h = certifiedHint(def, state);
  return h?.kind === 'drag' ? h.slide : null;
}

/** Default node budget for the in-game hint search (runs only when the player asks; see D-M3-07). */
export const HINT_SEARCH_NODES = 40_000;

/**
 * Full hint, never invalid: certified drag → (bond release) → bounded search under the current
 * locks/scaffold → undo back to the newest certified position → free restart.
 */
export function fullHint(def: LevelDefinition, state: PuzzleState, maxNodes = HINT_SEARCH_NODES): Hint | null {
  if (state.status === 'solved') return null;
  const certified = certifiedHint(def, state);
  if (certified) return certified;
  const found = searchSolution(def, state, { maxDepth: 3, maxNodes });
  if (found.slides && found.slides.length) {
    const s = found.slides[0]!;
    const r = applyCommand(def, state, { type: 'slide', origin: s.origin, axis: s.axis, steps: s.steps });
    if (r.accepted) return { kind: 'drag', slide: s, segment: segmentIn(def, state, s.origin, s.axis), source: 'search' };
  }
  let count = 0;
  for (let i = state.history.length - 1; i >= 0; i--) {
    count++;
    const snap = state.history[i]!;
    if (snap.recovery && snap.scaffold === null && recoveryStates(def, snap.recovery).at(-1) === snap.board) return { kind: 'undo', count };
  }
  return { kind: 'restart' };
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

/**
 * Validate that a board fits this level: same holes, only this level's symbols (plus the attempt's
 * custom CRISPR symbols), and a symbol multiset that differs from the initial board by at most `edits`
 * substitutions (0 without CRISPR).
 */
export function isCompatibleBoard(def: LevelDefinition, board: unknown, edits = 0, custom: CustomTokens = {}): board is Board {
  if (typeof board !== 'string' || board.length !== def.initial.length) return false;
  const known = (ch: string): boolean => (def.tokens ? def.tokens[ch] !== undefined || (isCustomSymbol(ch) && custom[ch] !== undefined) : 'ATCG'.includes(ch));
  const counts = new Map<string, number>();
  for (let i = 0; i < board.length; i++) {
    const a = board[i]!;
    if ((a === '.') !== (def.mask[i] === '.')) return false;
    if (a === '.') continue;
    if (!known(a)) return false;
    counts.set(a, (counts.get(a) ?? 0) + 1);
    const b = def.initial[i]!;
    counts.set(b, (counts.get(b) ?? 0) - 1);
  }
  let diff = 0;
  for (const v of counts.values()) diff += Math.abs(v);
  return diff / 2 <= edits;
}

export { moveKey };
