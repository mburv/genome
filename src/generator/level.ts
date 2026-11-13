import { allMoves, applyMove, applySlide, cellAt, inBounds, colOf, inverseMove, moveKey, normaliseSteps, rowOf, segmentCells, slideToMoves } from '../engine/grid.ts';
import { isSolved, replayCertificate } from '../engine/engine.ts';
import type { Axis, Board, Cell, Interval, LevelDefinition, LevelMetrics, LevelMode, Mask, Move, Power, RepairSpec, Slide, Track } from '../engine/types.ts';
import { scaffoldCandidates } from '../engine/powers.ts';
import { defaultLabel, MAX_LEVEL_TOKENS, tokenSymbol, type TokenDef } from '../engine/tokens.ts';
import { BASES } from '../engine/types.ts';
import { alignedComplement } from '../genomics/dna.ts';
import { canonicalMask, isConnected, maskErrors, maskMetrics, proposeMask, symmetricDistance, tidyMask, type MaskOptions } from './mask.ts';
import { createRng, type Rng } from './rng.ts';
import { solveBounded } from './solver.ts';

export const GENERATOR_VERSION = 'm2-gen-1';
export const MIN_MASK_DISTANCE = 8;
const MAX_ATTEMPTS = 3000;
/** Exhaustive shallow proof used for every candidate (cheap: ≤ ~25k states). */
export const SHALLOW_PROOF_DEPTH = 2;
/** Deeper bounded search used once per accepted level for its published metrics. */
export const PUBLISH_SOLVER_BUDGET = 400_000;

export interface GeneSource {
  geneId: string;
  symbol: string;
  transcript: string;
  datasetId: string;
  sequence: string;
  sequenceSha256: string;
}

export type TrackLayout =
  | { kind: 'sequence'; orientation: Track['orientation']; line?: number }
  | { kind: 'splice'; parts: { length: number; orientation: Track['orientation'] }[] }
  | { kind: 'replicate'; orientation: Track['orientation'] }
  | { kind: 'repair'; orientation: Track['orientation']; gapIndex: number };

export interface LevelSpec {
  id: string;
  index: number;
  gene: string;
  title: string;
  mode: LevelMode;
  seed: number;
  source: Interval;
  layout: TrackLayout;
  tutorial: boolean;
  /** Drags in the scramble (tutorial: exactly one single-cell step). */
  scrambleDrags: number;
  /** Require a proof that no solution shorter than this exists (capped at SHALLOW_PROOF_DEPTH + 1). */
  minDrags: number;
  minWrongCells: number;
  mask: Omit<MaskOptions, 'protect' | 'forceHoles'>;
  /**
   * Optional deeper check for late levels: reject a candidate if a bounded search finds a solution
   * with ≤ depth drags. If the budget runs out first the candidate is kept (bound stays unproven).
   */
  deepCheck?: { depth: number; budget: number };
  /** Enzyme-lab tutorial level (M3): grants one free use of this power; excluded from coverage. */
  lab?: Power;
  /** Require at least one legal scaffold placement whose bridged track contains a target cell. */
  requireScaffoldGap?: boolean;
  /**
   * M4 token level: nominal bases per tile (multiple of 3). The source interval is cut into pieces of
   * this size in coding order (the last piece may be shorter); layout lengths then count tiles.
   */
  tokenSize?: number;
  /** M4 assembly chapter position. */
  chapter?: { part: number; of: number };
  /** Bounded-solver budget for the published metrics (defaults to the campaign budget). */
  solverBudget?: number;
}

export type RejectReason =
  | 'tracks'
  | 'mask-connectivity'
  | 'mask-active'
  | 'mask-dead-ends'
  | 'mask-immobile'
  | 'mask-sparse-line'
  | 'mask-symmetric'
  | 'mask-other'
  | 'track-immobile'
  | 'duplicate'
  | 'near-duplicate'
  | 'scramble'
  | 'pre-solved'
  | 'too-few-wrong'
  | 'certificate-short'
  | 'shallow-solvable'
  | 'no-scaffold-gap'
  | 'invalid';

export type Candidate = { ok: true; def: LevelDefinition } | { ok: false; reason: RejectReason };

const across = (o: Track['orientation']): Axis => (o === 'horizontal' ? 'col' : 'row');

export function lineCells(orientation: Track['orientation'], row: number, col: number, length: number): Cell[] {
  return Array.from({ length }, (_, i) => (orientation === 'horizontal' ? cellAt(row, col + i) : cellAt(row + i, col)));
}

const neighbours4 = (c: Cell): Cell[] =>
  [[-1, 0], [1, 0], [0, -1], [0, 1]].filter(([dr, dc]) => inBounds(rowOf(c) + dr!, colOf(c) + dc!)).map(([dr, dc]) => cellAt(rowOf(c) + dr!, colOf(c) + dc!));

interface Placement {
  tracks: Track[];
  repair?: RepairSpec;
  forceHoles: Cell[];
  /** Token levels: symbol table built so far (targets; decoys are added when filling). */
  tokens?: TokenTable;
}

/** One target unit: a base (single-base levels) or a piece of `tokenSize` bases (token levels). */
interface Unit {
  seq: string;
  start: number;
  end: number;
}

/** Sequence → symbol table for a token level (one symbol per distinct sequence). */
export class TokenTable {
  readonly bySeq = new Map<string, string>();
  readonly defs: Record<string, TokenDef> = {};
  add(seq: string, kind: TokenDef['kind'], source: Interval, strand?: TokenDef['strand']): string {
    const have = this.bySeq.get(seq);
    if (have) return have;
    const n = this.bySeq.size;
    if (n >= MAX_LEVEL_TOKENS) throw new Error('too many distinct tokens');
    const sym = tokenSymbol(n);
    this.bySeq.set(seq, sym);
    this.defs[sym] = { seq, kind, label: '', source: { ...source }, ...(strand ? { strand } : {}) };
    return sym;
  }
  /** Final labels: equal sequences share one symbol; different sequences with equal labels get a suffix. */
  finish(): Record<string, TokenDef> {
    const seen = new Map<string, number>();
    for (const sym of Object.keys(this.defs)) {
      const d = this.defs[sym]!;
      const base = defaultLabel(d.seq);
      const k = seen.get(base) ?? 0;
      seen.set(base, k + 1);
      d.label = k === 0 ? base : `${base}·${k + 1}`;
    }
    return this.defs;
  }
}

function unitsOf(spec: LevelSpec, cds: string): Unit[] {
  const { start, end } = spec.source;
  const k = spec.tokenSize ?? 1;
  const out: Unit[] = [];
  for (let s = start; s < end; s += k) out.push({ seq: cds.slice(s, Math.min(end, s + k)), start: s, end: Math.min(end, s + k) });
  return out;
}

/** Place target tracks for the level's mode. Pure given the RNG. */
export function placeTracks(rng: Rng, spec: LevelSpec, cds: string): Placement | null {
  const { start, end } = spec.source;
  const units = unitsOf(spec, cds);
  const table = spec.tokenSize ? new TokenTable() : null;
  // Single-base levels: the symbol is the base. Token levels: one symbol per distinct sequence.
  const sym = (u: Unit, strand: 'coding' | 'complement' = 'coding'): string =>
    table ? table.add(strand === 'coding' ? u.seq : alignedComplement(u.seq), 'target', { start: u.start, end: u.end }, strand) : strand === 'coding' ? u.seq : alignedComplement(u.seq);
  const L = spec.layout;
  const coding = (group: number, cells: Cell[], orientation: Track['orientation'], a: number, b: number): Track => ({
    group, cells, expected: units.slice(a, b).map((u) => sym(u)).join(''), orientation, strand: 'coding', readDirection: '5to3', source: { start: units[a]!.start, end: units[b - 1]!.end },
  });
  const done = (p: Placement): Placement => (table ? { ...p, tokens: table } : p);
  if (L.kind === 'sequence') {
    const line = L.line ?? rng.range(1, 7);
    const len = units.length;
    if (len > 9) return null;
    const off = rng.range(0, 9 - len);
    const cells = L.orientation === 'horizontal' ? lineCells('horizontal', line, off, len) : lineCells('vertical', off, line, len);
    return done({ tracks: [coding(1, cells, L.orientation, 0, len)], forceHoles: [] });
  }
  if (L.kind === 'replicate') {
    const len = units.length;
    if (len > 9) return null;
    const a = rng.range(1, 6);
    const b = rng.range(0, 9 - len);
    const [c1, c2] = L.orientation === 'horizontal'
      ? [lineCells('horizontal', a, b, len), lineCells('horizontal', a + 1, b, len)]
      : [lineCells('vertical', b, a, len), lineCells('vertical', b, a + 1, len)];
    const src = coding(1, c1, L.orientation, 0, len);
    const comp: Track = { group: 2, cells: c2, expected: units.map((u) => sym(u, 'complement')).join(''), orientation: L.orientation, strand: 'complement', readDirection: '3to5', source: { start, end } };
    return done({ tracks: [src, comp], forceHoles: [] });
  }
  if (L.kind === 'repair') {
    const line = rng.range(1, 7);
    const all = L.orientation === 'horizontal' ? lineCells('horizontal', line, 0, 9) : lineCells('vertical', 0, line, 9);
    const g = L.gapIndex;
    if (units.length !== 9) return null;
    const gap = units[g]!;
    return done({
      tracks: [coding(1, all.slice(0, g), L.orientation, 0, g), coding(2, all.slice(g + 1), L.orientation, g + 1, 9)],
      repair: { cell: all[g]!, expected: sym(gap), sourceOffset: gap.start, ...(table ? { length: gap.end - gap.start } : {}) },
      forceHoles: [all[g]!],
    });
  }
  // splice: separate tracks, joined in group order; keep a one-cell margin between tracks
  const tracks: Track[] = [];
  const used = new Set<Cell>();
  let offset = 0;
  for (const [i, part] of L.parts.entries()) {
    let placed: Cell[] | null = null;
    for (let tries = 0; tries < 200 && !placed; tries++) {
      const r = part.orientation === 'horizontal' ? rng.range(0, 8) : rng.range(0, 9 - part.length);
      const c = part.orientation === 'horizontal' ? rng.range(0, 9 - part.length) : rng.range(0, 8);
      const cells = lineCells(part.orientation, r, c, part.length);
      if (cells.some((x) => used.has(x) || neighbours4(x).some((n) => used.has(n)))) continue;
      placed = cells;
    }
    if (!placed) return null;
    if (offset + part.length > units.length) return null;
    placed.forEach((x) => used.add(x));
    tracks.push(coding(i + 1, placed, part.orientation, offset, offset + part.length));
    offset += part.length;
  }
  return offset === units.length ? done({ tracks, forceHoles: [] }) : null;
}

/**
 * Token levels: every non-target cell gets a decoy — a real slice of the same CDS from outside this
 * level's interval, in frame, never equal to a target piece (so decoys are clearly separate and are
 * never counted as reference coverage). No invented sequence.
 */
function fillTokens(rng: Rng, mask: Mask, tracks: readonly Track[], table: TokenTable, spec: LevelSpec, cds: string): Board | null {
  const k = spec.tokenSize!;
  const { start, end } = spec.source;
  const targets = new Set(table.bySeq.keys());
  const positions: number[] = [];
  for (let p = 0; p + k <= cds.length; p += 3) if (p + k <= start || p >= end) positions.push(p);
  const usable = positions.filter((p) => !targets.has(cds.slice(p, p + k)));
  if (usable.length < 4) return null;
  const out: string[] = mask.split('').map((ch) => (ch === '#' ? '' : '.'));
  for (const t of tracks) t.cells.forEach((cell, i) => { out[cell] = t.expected[i]!; });
  for (let c = 0; c < out.length; c++) {
    if (out[c] !== '') continue;
    const p = rng.pick(usable);
    out[c] = table.add(cds.slice(p, p + k), 'decoy', { start: p, end: p + k });
  }
  return out.join('');
}

function fillSolved(rng: Rng, mask: Mask, tracks: readonly Track[]): Board {
  const out: string[] = mask.split('').map((ch) => (ch === '#' ? rng.pick(BASES) : '.'));
  for (const t of tracks) t.cells.forEach((cell, i) => { out[cell] = t.expected[i]!; });
  return out.join('');
}

const segKey = (mask: Mask, origin: Cell, axis: Axis): string => {
  const seg = segmentCells(mask, origin, axis);
  return `${axis}:${seg[0]}`;
};

/** Scramble with whole drags (random k), weighted toward segments that touch targets. */
function scramble(rng: Rng, mask: Mask, solved: Board, tracks: readonly Track[], spec: LevelSpec): Slide[] | null {
  const targetCells = new Set(tracks.flatMap((t) => t.cells));
  const touches = (origin: Cell, axis: Axis): boolean => segmentCells(mask, origin, axis).some((c) => targetCells.has(c));
  const segs = allMoves(mask).filter((m) => m.direction === 1);
  if (spec.tutorial) {
    const t = tracks[0]!;
    const options = segs.filter((m) => m.axis === across(t.orientation) && touches(m.origin, m.axis));
    for (let tries = 0; tries < 50; tries++) {
      const m = rng.pick(options);
      const slide: Slide = { origin: m.origin, axis: m.axis, steps: rng.int(2) === 0 ? 1 : -1 };
      if (applySlide(mask, solved, slide.origin, slide.axis, slide.steps).changed) return [slide];
    }
    return null;
  }
  const weighted = segs.flatMap((m) => (touches(m.origin, m.axis) ? [m, m, m, m] : [m]));
  const slides: Slide[] = [];
  const visited = new Set<Board>([solved]);
  let board = solved;
  for (let guard = 0; slides.length < spec.scrambleDrags && guard < 400; guard++) {
    const m = rng.pick(weighted);
    const prev = slides[slides.length - 1];
    if (prev && segKey(mask, prev.origin, prev.axis) === segKey(mask, m.origin, m.axis)) continue;
    // Alternate axes more often than not, so crossings matter.
    if (prev && prev.axis === m.axis && rng.next() < 0.5) continue;
    const n = segmentCells(mask, m.origin, m.axis).length;
    const steps = normaliseSteps(rng.range(1, n - 1), n);
    const out = applySlide(mask, board, m.origin, m.axis, steps);
    if (!out.changed || visited.has(out.board)) continue;
    visited.add(out.board);
    slides.push({ origin: m.origin, axis: m.axis, steps });
    board = out.board;
  }
  return slides.length === spec.scrambleDrags ? slides : null;
}

const expand = (mask: Mask, slides: readonly Slide[]): Move[] => slides.flatMap((s) => slideToMoves(mask, s.origin, s.axis, s.steps));
const invertSlides = (slides: readonly Slide[]): Slide[] => [...slides].reverse().map((s) => ({ ...s, steps: -s.steps }));

/** Greedily remove drags whose removal still yields a valid, winning replay from `initial`. */
export function pruneSlides(mask: Mask, initial: Board, slides: readonly Slide[], wins: (b: Board) => boolean): Slide[] {
  let cert = [...slides];
  const replayWins = (c: readonly Slide[]): boolean => {
    let b = initial;
    for (const s of c) {
      const o = applySlide(mask, b, s.origin, s.axis, s.steps);
      if (!o.changed) return false;
      b = o.board;
    }
    return wins(b);
  };
  for (let i = 0; i < cert.length; ) {
    const candidate = [...cert.slice(0, i), ...cert.slice(i + 1)];
    if (candidate.length > 0 && replayWins(candidate)) cert = candidate;
    else i++;
  }
  return cert;
}

/** Single-step pruning (kept for compatibility with step certificates). */
export function pruneCertificate(mask: Mask, initial: Board, certificate: readonly Move[], wins: (b: Board) => boolean): Move[] {
  return pruneSlides(mask, initial, certificate.map((m) => ({ origin: m.origin, axis: m.axis, steps: m.direction })), wins).map((s) => ({
    origin: s.origin, axis: s.axis, direction: s.steps > 0 ? 1 : -1,
  }));
}

function maskReason(errors: string[]): RejectReason {
  const e = errors[0] ?? '';
  if (e.startsWith('not connected')) return 'mask-connectivity';
  if (e.startsWith('active') || e.startsWith('full')) return 'mask-active';
  if (e.startsWith('dead')) return 'mask-dead-ends';
  if (e.startsWith('immobile')) return 'mask-immobile';
  if (e.startsWith('a row')) return 'mask-sparse-line';
  if (e.startsWith('symmetric')) return 'mask-symmetric';
  return 'mask-other';
}

export const RATING_THRESHOLDS = { gentle: 10.5, moderate: 12.5, tricky: 15 } as const;

/**
 * Estimated difficulty (not measured from players). The drag count dominates: the proven optimum when
 * known, otherwise the midpoint of [lower bound, certificate]. Extra targets, wrong cells and open space
 * add a little.
 */
export function rateLevel(m: Pick<LevelMetrics, 'certificateDrags' | 'wrongTargetCells' | 'active'> & { tracks: number; lowerBound: number; optimal?: number | undefined; tutorial: boolean }): { rating: LevelMetrics['rating']; score: number } {
  if (m.tutorial) return { rating: 'tutorial', score: 1 };
  const drags = m.optimal ?? (Math.min(m.lowerBound, m.certificateDrags) + m.certificateDrags) / 2;
  const score = Math.round((drags * 3 + (m.tracks - 1) + m.wrongTargetCells / 4 + m.active / 40) * 10) / 10;
  const t = RATING_THRESHOLDS;
  const rating = score < t.gentle ? 'gentle' : score < t.moderate ? 'moderate' : score < t.tricky ? 'tricky' : 'hard';
  return { rating, score };
}

/** One generation attempt. Deterministic given the RNG state. */
export function tryCandidate(rng: Rng, spec: LevelSpec, gene: GeneSource, existing: readonly LevelDefinition[], solverBudget = 0): Candidate {
  const placement = placeTracks(rng, spec, gene.sequence);
  if (!placement) return { ok: false, reason: 'tracks' };
  const { tracks, repair, forceHoles, tokens: table } = placement;
  const protect = tracks.flatMap((t) => t.cells);
  const maskOpts: MaskOptions = { ...spec.mask, protect, forceHoles };
  const crossOf = new Map<Cell, Axis>(tracks.flatMap((t) => t.cells.map((c) => [c, across(t.orientation)] as const)));
  const mask = tidyMask(proposeMask(rng, maskOpts), protect, (c) => crossOf.get(c) ?? 'col', forceHoles);
  if (!mask) return { ok: false, reason: 'mask-connectivity' };
  const errors = maskErrors(mask, maskOpts);
  if (errors.length) return { ok: false, reason: maskReason(errors) };
  // Every target cell must be reachable by a crossing segment so letters can be brought in.
  if (!tracks.every((t) => t.cells.every((c) => segmentCells(mask, c, across(t.orientation)).length >= 2))) return { ok: false, reason: 'track-immobile' };
  if (spec.requireScaffoldGap && !scaffoldCandidates(mask).some((c) => c.cells.some((x) => protect.includes(x)))) return { ok: false, reason: 'no-scaffold-gap' };
  const canonical = canonicalMask(mask);
  if (existing.some((d) => d.maskCanonical === canonical)) return { ok: false, reason: 'duplicate' };
  if (existing.some((d) => symmetricDistance(mask, d.mask) < MIN_MASK_DISTANCE)) return { ok: false, reason: 'near-duplicate' };
  const filled = table ? fillTokens(rng, mask, tracks, table, spec, gene.sequence) : fillSolved(rng, mask, tracks);
  if (!filled) return { ok: false, reason: 'tracks' };
  const slides = scramble(rng, mask, filled, tracks, spec);
  if (!slides) return { ok: false, reason: 'scramble' };
  let initial = filled;
  for (const s of slides) initial = applySlide(mask, initial, s.origin, s.axis, s.steps).board;
  const wins = (b: Board): boolean => tracks.every((t) => t.cells.every((c, i) => b[c] === t.expected[i]));
  if (wins(initial)) return { ok: false, reason: 'pre-solved' };
  const wrong = tracks.reduce((n, t) => n + t.cells.filter((c, i) => initial[c] !== t.expected[i]).length, 0);
  if (wrong < spec.minWrongCells) return { ok: false, reason: 'too-few-wrong' };
  const certificateSlides = pruneSlides(mask, initial, invertSlides(slides), wins).map((s) => ({
    ...s,
    steps: normaliseSteps(s.steps, segmentCells(mask, s.origin, s.axis).length),
  }));
  const minCert = spec.tutorial ? 1 : Math.max(spec.minDrags, spec.scrambleDrags - 1);
  if (certificateSlides.length < minCert) return { ok: false, reason: 'certificate-short' };
  const proofDepth = Math.min(spec.minDrags - 1, SHALLOW_PROOF_DEPTH);
  if (proofDepth >= 1) {
    const shallow = solveBounded(mask, tracks, initial, { maxDepth: proofDepth, maxNodes: 200_000 });
    if (shallow.status === 'optimal' || shallow.lowerBound <= proofDepth) return { ok: false, reason: 'shallow-solvable' };
  }
  let solved = initial;
  for (const s of certificateSlides) solved = applySlide(mask, solved, s.origin, s.axis, s.steps).board;
  const certificate = expand(mask, certificateSlides);
  const scrambleSteps = [...certificate].reverse().map(inverseMove);
  const m = maskMetrics(mask);
  const published = solverBudget > 0
    ? solveBounded(mask, tracks, initial, { maxDepth: certificateSlides.length, maxNodes: solverBudget })
    : { status: 'unknown' as const, lowerBound: Math.max(1, proofDepth + 1), nodes: 0 };
  const lowerBound = published.status === 'optimal' ? published.optimal! : Math.max(published.lowerBound, spec.tutorial ? 1 : proofDepth + 1);
  const { rating, score } = rateLevel({ certificateDrags: certificateSlides.length, wrongTargetCells: wrong, active: m.active, tracks: tracks.length, lowerBound, optimal: published.status === 'optimal' ? published.optimal : undefined, tutorial: spec.tutorial });
  const def: LevelDefinition = {
    id: spec.id,
    index: spec.index,
    title: spec.title,
    mode: spec.mode,
    tutorial: spec.tutorial,
    geneId: gene.geneId,
    symbol: gene.symbol,
    transcript: gene.transcript,
    datasetId: gene.datasetId,
    sequenceSha256: gene.sequenceSha256,
    seed: spec.seed,
    generatorVersion: GENERATOR_VERSION,
    mask,
    maskCanonical: canonical,
    tracks,
    ...(repair ? { repair } : {}),
    sourceIntervals: [{ ...spec.source }],
    solved,
    initial,
    scramble: scrambleSteps,
    certificate,
    certificateSlides,
    metrics: {
      active: m.active,
      holes: m.holes,
      deadEnds: m.deadEnds,
      wrongTargetCells: wrong,
      certificateLength: certificate.length,
      certificateDrags: certificateSlides.length,
      axesUsed: [...new Set(certificateSlides.map((s) => s.axis))].sort() as Axis[],
      solver: {
        status: published.status === 'optimal' ? 'optimal' : 'unknown',
        lowerBound,
        ...(published.status === 'optimal' ? { optimal: published.optimal! } : {}),
        nodes: published.nodes,
        budget: solverBudget,
      },
      rating,
      score,
      difficulty: 'estimated',
    },
    ...(spec.lab ? { lab: spec.lab } : {}),
    ...(table ? { tokens: table.finish(), tier: spec.tokenSize! } : {}),
    ...(spec.chapter ? { chapter: { ...spec.chapter } } : {}),
  };
  const errs = validateLevel(def, gene, existing);
  return errs.length ? { ok: false, reason: 'invalid' } : { ok: true, def };
}

export function buildLevel(spec: LevelSpec, gene: GeneSource, existing: readonly LevelDefinition[], solverBudget = PUBLISH_SOLVER_BUDGET): LevelDefinition {
  if (spec.gene !== gene.symbol) throw new Error(`${spec.id}: gene mismatch`);
  const expected = gene.sequence.slice(spec.source.start, spec.source.end);
  if (expected.length !== spec.source.end - spec.source.start || !/^[ACGT]+$/.test(expected)) throw new Error(`${spec.id}: bad source interval`);
  if (spec.tokenSize !== undefined && (spec.tokenSize % 3 !== 0 || spec.source.start % 3 !== 0)) throw new Error(`${spec.id}: token pieces must start in frame`);
  solverBudget = spec.solverBudget ?? solverBudget;
  const rng = createRng(spec.seed);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Cheap candidate first; the published bounded search runs only once, on the accepted level.
    const c = tryCandidate(rng, spec, gene, existing, 0);
    if (!c.ok) continue;
    let deepBound = 0;
    let deepNodes = 0;
    if (spec.deepCheck) {
      const deep = solveBounded(c.def.mask, c.def.tracks, c.def.initial, { maxDepth: spec.deepCheck.depth, maxNodes: spec.deepCheck.budget });
      if (deep.status === 'optimal') continue;
      deepBound = deep.lowerBound;
      deepNodes = deep.nodes;
    }
    if (solverBudget <= 0) return c.def;
    const res = solveBounded(c.def.mask, c.def.tracks, c.def.initial, { maxDepth: c.def.metrics.certificateDrags, maxNodes: solverBudget });
    const lowerBound = res.status === 'optimal' ? res.optimal! : Math.max(res.lowerBound, c.def.metrics.solver.lowerBound, deepBound);
    // Lower bound meeting the certificate's upper bound proves the certificate optimal.
    const optimal = res.status === 'optimal' ? res.optimal! : lowerBound >= c.def.metrics.certificateDrags ? c.def.metrics.certificateDrags : undefined;
    const nodes = Math.max(res.nodes, deepNodes);
    const budget = Math.max(solverBudget, spec.deepCheck?.budget ?? 0);
    const { rating, score } = rateLevel({ ...c.def.metrics, tracks: c.def.tracks.length, lowerBound, optimal, tutorial: c.def.tutorial });
    // If the solver found a shorter solution, publish it as the certificate so hints follow an optimal path.
    let cert: Pick<LevelDefinition, 'certificateSlides' | 'certificate' | 'solved'> & { certificateLength: number; certificateDrags: number } = {
      certificateSlides: c.def.certificateSlides, certificate: c.def.certificate, solved: c.def.solved,
      certificateLength: c.def.metrics.certificateLength, certificateDrags: c.def.metrics.certificateDrags,
    };
    if (res.status === 'optimal' && res.solution && res.solution.length < c.def.certificateSlides.length) {
      const slides = res.solution.map((x) => ({ ...x, steps: normaliseSteps(x.steps, segmentCells(c.def.mask, x.origin, x.axis).length) }));
      let solved = c.def.initial;
      for (const x of slides) solved = applySlide(c.def.mask, solved, x.origin, x.axis, x.steps).board;
      const steps = expand(c.def.mask, slides);
      cert = { certificateSlides: slides, certificate: steps, solved, certificateLength: steps.length, certificateDrags: slides.length };
    }
    return {
      ...c.def,
      certificateSlides: cert.certificateSlides,
      certificate: cert.certificate,
      solved: cert.solved,
      scramble: [...cert.certificate].reverse().map(inverseMove),
      metrics: {
        ...c.def.metrics,
        certificateLength: cert.certificateLength,
        certificateDrags: cert.certificateDrags,
        rating,
        score,
        solver: { status: optimal !== undefined ? 'optimal' : 'unknown', lowerBound, ...(optimal !== undefined ? { optimal } : {}), nodes, budget },
      },
    };
  }
  throw new Error(`${spec.id}: generation failed after ${MAX_ATTEMPTS} attempts (seed ${spec.seed})`);
}

/** Full validation used at generation time, by the audit CLI and in tests on the pinned level pack. */
export function validateLevel(def: LevelDefinition, gene: GeneSource, others: readonly LevelDefinition[]): string[] {
  const errors: string[] = [];
  const e = (msg: string): void => { errors.push(`${def.id}: ${msg}`); };
  const cds = gene.sequence;
  if (def.mask.length !== 81 || !/^[#.]+$/.test(def.mask)) e('mask malformed');
  if (!isConnected(def.mask)) e('mask not connected');
  if (maskMetrics(def.mask).immobile > 0) e('mask has immobile cells');
  if (canonicalMask(def.mask) !== def.maskCanonical) e('canonical fingerprint mismatch');
  for (const o of others) {
    if (o.id === def.id) continue;
    if (o.maskCanonical === def.maskCanonical) e(`mask duplicates ${o.id} under rotation/reflection`);
    else if (symmetricDistance(def.mask, o.mask) < MIN_MASK_DISTANCE) e(`mask too similar to ${o.id}`);
  }
  if (gene.sequenceSha256 !== def.sequenceSha256 || gene.transcript !== def.transcript || gene.symbol !== def.symbol) e('dataset mismatch');
  const used = new Set<Cell>();
  for (const t of def.tracks) {
    if (t.cells.length < 3 || t.cells.length > 9) e('track length must be 3-9');
    if (t.cells.length !== t.expected.length) e('track/expected length mismatch');
    const ref = cds.slice(t.source.start, t.source.end);
    // Sequence equality: concatenate the DNA carried by the expected symbols.
    const spelled = def.tokens ? t.expected.split('').map((sym) => def.tokens![sym]?.seq ?? '?').join('') : t.expected;
    if (t.strand === 'coding' && (ref !== spelled || t.readDirection !== '5to3')) e(`track ${t.group} does not match source CDS`);
    if (t.strand === 'complement' && (alignedComplement(ref) !== spelled || t.readDirection !== '3to5')) e(`track ${t.group} is not the aligned complement`);
    const step = t.orientation === 'horizontal' ? 1 : 9;
    t.cells.forEach((c, i) => {
      if (def.mask[c] !== '#') e(`track cell ${c} is a hole`);
      if (used.has(c)) e(`track cell ${c} overlaps`);
      used.add(c);
      if (i > 0 && c - t.cells[i - 1]! !== step) e('track cells not contiguous/ordered');
      if (t.orientation === 'horizontal' && rowOf(c) !== rowOf(t.cells[0]!)) e('horizontal track wraps rows');
    });
  }
  // Exact source coverage: coding tracks (+ repair base) tile the level interval once, in order.
  const coding = def.tracks.filter((t) => t.strand === 'coding');
  const offsets: number[] = coding.flatMap((t) => Array.from({ length: t.source.end - t.source.start }, (_, i) => t.source.start + i));
  if (def.repair) for (let i = 0; i < (def.repair.length ?? 1); i++) offsets.push(def.repair.sourceOffset + i);
  offsets.sort((a, b) => a - b);
  const iv = def.sourceIntervals[0]!;
  if (def.sourceIntervals.length !== 1 || offsets.length !== iv.end - iv.start || offsets.some((o, i) => o !== iv.start + i)) e('coding tracks do not cover the source interval exactly once');
  // Mode-specific rules
  if (def.mode === 'sequence' && (def.tracks.length !== 1 || coding.length !== 1)) e('sequencing needs one coding track');
  if (def.mode === 'splice') {
    if (def.tracks.length < 2 || def.tracks.length > 3 || coding.length !== def.tracks.length) e('splicing needs 2-3 coding tracks');
    def.tracks.forEach((t, i) => { if (t.group !== i + 1 || (i > 0 && t.source.start !== def.tracks[i - 1]!.source.end)) e('splice tracks not in sequence order'); });
  }
  if (def.mode === 'replicate') {
    const [a, b] = def.tracks;
    if (def.tracks.length !== 2 || a?.strand !== 'coding' || b?.strand !== 'complement') e('replication needs coding + complement tracks');
    else {
      if (a.source.start !== b.source.start || a.source.end !== b.source.end) e('replication strands must share the interval');
      const offset = a.orientation === 'horizontal' ? 9 : 1;
      if (a.orientation !== b.orientation || a.cells.some((c, i) => b.cells[i] !== c + offset)) e('complement strand is not aligned beside the template');
    }
  }
  if (def.mode === 'repair') {
    const r = def.repair;
    if (!r || def.tracks.length !== 2) e('repair needs a gap and two flanking tracks');
    else {
      if (def.mask[r.cell] !== '.') e('repair cell must be a hole until win');
      const len = r.length ?? 1;
      const restored = def.tokens ? def.tokens[r.expected]?.seq : r.expected;
      if (cds.slice(r.sourceOffset, r.sourceOffset + len) !== restored) e('repair piece does not match source');
      const [a, b] = def.tracks as [Track, Track];
      const step = a.orientation === 'horizontal' ? 1 : 9;
      if (r.cell !== a.cells[a.cells.length - 1]! + step || b.cells[0] !== r.cell + step) e('repair gap is not between the flanking tracks');
      if (a.source.end !== r.sourceOffset || b.source.start !== r.sourceOffset + len) e('repair offset not between track intervals');
    }
  } else if (def.repair) e('only repair levels have a repair cell');
  if (def.tokens) errors.push(...validateTokens(def, cds));
  else if (def.tier !== undefined || /[^ACGT.]/.test(def.initial) || /[^ACGT.]/.test(def.solved)) e('single-base level has non-base symbols');
  const holesOk = def.initial.split('').every((ch, i) => (ch === '.') === (def.mask[i] === '.'));
  if (!holesOk || def.solved.split('').some((ch, i) => (ch === '.') !== (def.mask[i] === '.'))) e('boards do not respect mask');
  if (!isSolved(def, def.solved)) e('solved board does not match targets');
  if (isSolved(def, def.initial)) e('initial board is pre-solved');
  let b = def.solved;
  for (const m of def.scramble) b = applyMove(def.mask, b, m).board;
  if (b !== def.initial) e('scramble does not reproduce initial board');
  const replay = replayCertificate(def);
  if (!replay.valid || !replay.solved) e('certificate does not solve the level');
  let sb = def.initial;
  for (const s of def.certificateSlides) {
    const o = applySlide(def.mask, sb, s.origin, s.axis, s.steps);
    if (!o.changed) e('certificate slide is a no-op');
    sb = o.board;
  }
  if (!isSolved(def, sb)) e('drag certificate does not solve the level');
  if (expand(def.mask, def.certificateSlides).map((m) => moveKey(def.mask, m)).join() !== def.certificate.map((m) => moveKey(def.mask, m)).join()) e('drag and step certificates differ');
  if (def.tutorial && def.certificate.length !== 1) e('tutorial must be exactly one move');
  return errors;
}

/** Token-level checks: exact provenance, sequence-unique symbols, in-frame pieces, real decoys. */
function validateTokens(def: LevelDefinition, cds: string): string[] {
  const errors: string[] = [];
  const e = (msg: string): void => { errors.push(`${def.id}: ${msg}`); };
  const tokens = def.tokens!;
  const k = def.tier;
  if (!k || k % 3 !== 0) e('token tier must be a multiple of 3');
  const seqs = new Set<string>();
  const labels = new Set<string>();
  const targetSyms = new Set(def.tracks.flatMap((t) => t.expected.split('')).concat(def.repair ? [def.repair.expected] : []));
  for (const [sym, t] of Object.entries(tokens)) {
    if (!/^[ACGT]+$/.test(t.seq)) e(`token ${t.label} is not DNA`);
    if (seqs.has(t.seq)) e(`two symbols carry the same sequence ${t.label}`);
    seqs.add(t.seq);
    if (labels.has(t.label)) e(`duplicate label ${t.label}`);
    labels.add(t.label);
    if (t.kind === 'target' && !targetSyms.has(sym)) e(`target token ${t.label} is not used by any target`);
    if (t.kind === 'decoy') {
      if (targetSyms.has(sym)) e(`decoy ${t.label} is used as a target`);
      const src = t.source;
      if (!src || cds.slice(src.start, src.end) !== t.seq || src.start % 3 !== 0) e(`decoy ${t.label} is not an in-frame slice of the CDS`);
      const iv = def.sourceIntervals[0]!;
      if (src && src.start < iv.end && src.end > iv.start) e(`decoy ${t.label} overlaps the level interval`);
    }
    if (t.kind === 'target' && t.strand === 'coding' && (!t.source || cds.slice(t.source.start, t.source.end) !== t.seq)) e(`target ${t.label} provenance mismatch`);
  }
  for (const b of [def.initial, def.solved]) for (const ch of b) if (ch !== '.' && !tokens[ch]) e('board uses an unknown symbol');
  for (const t of def.tracks) {
    let off = t.source.start;
    for (const sym of t.expected) {
      if (off % 3 !== 0) e(`piece at CDS ${off} is out of frame`);
      off += tokens[sym]?.seq.length ?? 0;
    }
  }
  return errors;
}

export function buildCampaign(specs: readonly LevelSpec[], genes: Record<string, GeneSource>, solverBudget = PUBLISH_SOLVER_BUDGET): LevelDefinition[] {
  const out: LevelDefinition[] = [];
  for (const spec of specs) {
    const gene = genes[spec.gene];
    if (!gene) throw new Error(`${spec.id}: unknown gene ${spec.gene}`);
    out.push(buildLevel(spec, gene, out, solverBudget));
  }
  return out;
}
