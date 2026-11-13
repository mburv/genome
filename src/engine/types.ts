/** Core domain types. Pure data — no DOM, React, time, network or randomness. */
export type Base = 'A' | 'T' | 'C' | 'G';
export const BASES: readonly Base[] = ['A', 'T', 'C', 'G'];
export type Axis = 'row' | 'col';
export type Direction = -1 | 1;
/** Board coordinate 0..80, row-major. */
export type Cell = number;
/**
 * Board encoded as an 81-character string: 'A' | 'T' | 'C' | 'G' for a tile, '.' for a hole.
 * M1 uses single-base tokens only, so a string is an exact, cheap, comparable representation.
 */
export type Board = string;
/** Mask encoded as 81 characters: '#' playable, '.' hole. */
export type Mask = string;

/** CDS offsets, zero-based half-open. */
export interface Interval {
  start: number;
  end: number;
}

export interface Move {
  origin: Cell;
  axis: Axis;
  direction: Direction;
}

export interface Track {
  group: number;
  /** Ordered cells: left→right for horizontal, top→bottom for vertical. */
  cells: Cell[];
  expected: string;
  orientation: 'horizontal' | 'vertical';
  strand: 'coding';
  source: Interval;
}

export interface LevelMetrics {
  active: number;
  holes: number;
  deadEnds: number;
  wrongTargetCells: number;
  certificateLength: number;
  axesUsed: Axis[];
  /** Always 'estimated' in M1: certificate length is an upper bound, not an optimum. */
  difficulty: 'estimated';
}

export interface LevelDefinition {
  id: string;
  index: number;
  title: string;
  mode: 'sequence';
  tutorial: boolean;
  geneId: string;
  symbol: string;
  transcript: string;
  datasetId: string;
  sequenceSha256: string;
  seed: number;
  generatorVersion: string;
  mask: Mask;
  maskCanonical: string;
  tracks: Track[];
  sourceIntervals: Interval[];
  /** The generated solved board (one of possibly many winning boards). */
  solved: Board;
  initial: Board;
  /** Scramble moves applied to `solved` to produce `initial`. */
  scramble: Move[];
  /** Replayable solution: inverse scramble in reverse order. Not claimed optimal. */
  certificate: Move[];
  metrics: LevelMetrics;
}
