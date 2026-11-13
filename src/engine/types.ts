/** Core domain types. Pure data — no DOM, React, time, network or randomness. */
import type { TokenDef } from './tokens.ts';
export type Base = 'A' | 'T' | 'C' | 'G';
export const BASES: readonly Base[] = ['A', 'T', 'C', 'G'];
export type Axis = 'row' | 'col';
export type Direction = -1 | 1;
/** Board coordinate 0..80, row-major. */
export type Cell = number;
/**
 * Board encoded as an 81-character string: one symbol per cell, '.' for a hole. On single-base levels
 * the symbols are 'A' | 'T' | 'C' | 'G'; on M4 token levels each symbol maps to an exact DNA sequence
 * via `LevelDefinition.tokens` (see tokens.ts). A string stays an exact, cheap, comparable representation.
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

/** A k-cell rotation of one segment: one continuous drag. */
export interface Slide {
  origin: Cell;
  axis: Axis;
  /** Signed, normalised to (−n/2, n/2] for the segment length n. */
  steps: number;
}

export type LevelMode = 'sequence' | 'splice' | 'replicate' | 'repair';
/** M3 enzyme power-ups. */
export type Power = 'crispr' | 'ligase' | 'scaffold';

export interface Track {
  /** Display label: 1, 2, 3… Splicing joins groups in ascending order. */
  group: number;
  /** Ordered cells: left→right for horizontal, top→bottom for vertical. */
  cells: Cell[];
  expected: string;
  orientation: 'horizontal' | 'vertical';
  /**
   * 'coding' tracks spell the reference CDS slice `source`. A 'complement' track (replication) is the
   * aligned complementary strand of the same slice: expected[i] = complement(cds[source.start + i]),
   * read 3′→5′ in the same visual direction. Only coding tracks count toward coverage.
   */
  strand: 'coding' | 'complement';
  readDirection: '5to3' | '3to5';
  source: Interval;
}

export interface RepairSpec {
  /** A hole in the mask between two coding tracks; filled with `expected` only on win. */
  cell: Cell;
  /** The restored symbol: a base, or a token symbol on token levels. */
  expected: string;
  /** CDS offset of the restored piece's first base (counted exactly once). */
  sourceOffset: number;
  /** Bases in the restored piece (1 on single-base levels). */
  length?: number;
}

export interface SolverSummary {
  /** 'optimal' = BFS found the minimum number of drags; 'unknown' = budget hit before a solution. */
  status: 'optimal' | 'unknown';
  /** Proven minimum drags (= optimum when status is 'optimal'). */
  lowerBound: number;
  optimal?: number;
  nodes: number;
  budget: number;
}

export interface LevelMetrics {
  active: number;
  holes: number;
  deadEnds: number;
  wrongTargetCells: number;
  /** Certificate length in single-cell steps. */
  certificateLength: number;
  /** Certificate length in drags (one drag = one move). Upper bound on the optimum. */
  certificateDrags: number;
  axesUsed: Axis[];
  solver: SolverSummary;
  /** Estimated rating from bounds and layout; never claimed exact unless solver.status is 'optimal'. */
  rating: 'tutorial' | 'gentle' | 'moderate' | 'tricky' | 'hard';
  score: number;
  difficulty: 'estimated';
}

export interface LevelDefinition {
  id: string;
  index: number;
  title: string;
  mode: LevelMode;
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
  repair?: RepairSpec;
  sourceIntervals: Interval[];
  /** The generated solved board (one of possibly many winning boards). */
  solved: Board;
  initial: Board;
  /** Scramble applied to `solved` to produce `initial`, as single-cell steps. */
  scramble: Move[];
  /** Replayable solution as single-cell steps: inverse scramble in reverse order. Not claimed optimal. */
  certificate: Move[];
  /** The same certificate grouped into drags. */
  certificateSlides: Slide[];
  metrics: LevelMetrics;
  /** Enzyme-lab tutorial level: grants one free use of this power. Not part of the 12-level campaign or coverage. */
  lab?: Power;
  /** M4 token level: symbol → token (sequence, kind, label). Absent = single-base level. */
  tokens?: Record<string, TokenDef>;
  /** M4 nominal token size in bases (3, 6, 12, 24…); the last piece of a level may be shorter. */
  tier?: number;
  /** M4 assembly chapter membership: this is puzzle `part` of `of` for gene `symbol`. */
  chapter?: { part: number; of: number };
}
