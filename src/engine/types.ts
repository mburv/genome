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
  expected: Base;
  /** CDS offset of the restored base (counted exactly once). */
  sourceOffset: number;
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
}
