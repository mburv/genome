import { allMoves, applyMove, cellAt, inverseMove, moveKey, segmentCells } from '../engine/grid.ts';
import { isSolved, replayCertificate } from '../engine/engine.ts';
import type { Axis, Board, Cell, Interval, LevelDefinition, Mask, Move, Track } from '../engine/types.ts';
import { BASES } from '../engine/types.ts';
import { canonicalMask, isConnected, maskErrors, maskMetrics, proposeMask, symmetricDistance, type MaskOptions } from './mask.ts';
import { createRng, type Rng } from './rng.ts';

export const GENERATOR_VERSION = 'm1-gen-1';
export const MIN_MASK_DISTANCE = 8;
const MAX_ATTEMPTS = 2000;

export interface GeneSource {
  geneId: string;
  symbol: string;
  transcript: string;
  datasetId: string;
  sequence: string;
  sequenceSha256: string;
}

export interface LevelSpec {
  id: string;
  index: number;
  title: string;
  seed: number;
  source: Interval;
  orientation: 'horizontal' | 'vertical';
  /** Fixed row/column for the track, or null to choose from the seed. */
  line: number | null;
  tutorial: boolean;
  scrambleLength: number;
  minWrongCells: number;
  mask: Omit<MaskOptions, 'protect'>;
}

export function trackCells(orientation: Track['orientation'], line: number, length: number, offset: number): Cell[] {
  return Array.from({ length }, (_, i) => (orientation === 'horizontal' ? cellAt(line, offset + i) : cellAt(offset + i, line)));
}

function fillSolved(rng: Rng, mask: Mask, tracks: readonly Track[]): Board {
  const out: string[] = mask.split('').map((ch) => (ch === '#' ? rng.pick(BASES) : '.'));
  for (const t of tracks) t.cells.forEach((cell, i) => { out[cell] = t.expected[i]!; });
  return out.join('');
}

const perpendicular = (t: Track): Axis => (t.orientation === 'horizontal' ? 'col' : 'row');
const along = (t: Track): Axis => (t.orientation === 'horizontal' ? 'row' : 'col');

function scramble(rng: Rng, mask: Mask, solved: Board, def: Pick<LevelDefinition, 'tracks'>, spec: LevelSpec): Move[] | null {
  const track = def.tracks[0]!;
  const trackSet = new Set(track.cells);
  const candidates = allMoves(mask);
  // Segments touching the track are weighted up so scrambles are relevant, plus crossing segments.
  const touches = (m: Move): boolean => segmentCells(mask, m.origin, m.axis).some((c) => trackSet.has(c));
  const relevant = spec.tutorial
    ? candidates.filter((m) => m.axis === perpendicular(track) && touches(m))
    : candidates.flatMap((m) => (touches(m) ? [m, m, m] : [m]));
  const moves: Move[] = [];
  const visited = new Set<Board>([solved]);
  let board = solved;
  let guard = 0;
  while (moves.length < spec.scrambleLength && guard++ < 500) {
    const m = rng.pick(relevant);
    const prev = moves[moves.length - 1];
    if (prev && moveKey(mask, m) === moveKey(mask, inverseMove(prev))) continue;
    const o = applyMove(mask, board, m);
    if (!o.changed || visited.has(o.board)) continue;
    visited.add(o.board);
    moves.push(m);
    board = o.board;
  }
  if (moves.length !== spec.scrambleLength) return null;
  if (!spec.tutorial) {
    const axes = new Set(moves.map((m) => m.axis));
    if (axes.size < 2) return null;
    if (!moves.some((m) => m.axis === along(track) && touches(m))) return null;
  }
  return moves;
}

/** Greedily remove moves whose removal still yields a valid, winning replay from `initial`. */
export function pruneCertificate(mask: Mask, initial: Board, certificate: readonly Move[], wins: (b: Board) => boolean): Move[] {
  let cert = [...certificate];
  const replayWins = (c: readonly Move[]): boolean => {
    let b = initial;
    for (const m of c) {
      const o = applyMove(mask, b, m);
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

export function buildLevel(spec: LevelSpec, gene: GeneSource, existing: readonly LevelDefinition[]): LevelDefinition {
  const rng = createRng(spec.seed);
  const expected = gene.sequence.slice(spec.source.start, spec.source.end);
  if (expected.length !== spec.source.end - spec.source.start || !/^[ACGT]+$/.test(expected)) throw new Error(`${spec.id}: bad source interval`);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const line = spec.line ?? rng.range(1, 7);
    const length = expected.length;
    const offset = Math.floor((9 - length) / 2);
    const track: Track = {
      group: 1,
      cells: trackCells(spec.orientation, line, length, offset),
      expected,
      orientation: spec.orientation,
      strand: 'coding',
      source: { ...spec.source },
    };
    const maskOpts: MaskOptions = { ...spec.mask, protect: track.cells };
    const mask = proposeMask(rng, maskOpts);
    if (maskErrors(mask, maskOpts).length) continue;
    // Every target cell must be reachable by a crossing segment so letters can be brought in.
    if (!track.cells.every((c) => segmentCells(mask, c, perpendicular(track)).length >= 2)) continue;
    const canonical = canonicalMask(mask);
    if (existing.some((d) => d.maskCanonical === canonical || symmetricDistance(mask, d.mask) < MIN_MASK_DISTANCE)) continue;
    const filled = fillSolved(rng, mask, [track]);
    const moves = scramble(rng, mask, filled, { tracks: [track] }, spec);
    if (!moves) continue;
    let initial = filled;
    for (const mv of moves) initial = applyMove(mask, initial, mv).board;
    const partial = { tracks: [track] } as Pick<LevelDefinition, 'tracks'>;
    if (isSolved(partial as LevelDefinition, initial)) continue;
    const wrong = track.cells.filter((c, i) => initial[c] !== expected[i]).length;
    if (wrong < spec.minWrongCells) continue;
    // Drop certificate moves that are not needed to reach a win (e.g. trailing filler-only moves),
    // so the recovery hint never asks for an irrelevant move first. Still not claimed optimal.
    const certificate = pruneCertificate(mask, initial, [...moves].reverse().map(inverseMove), (b) => isSolved(partial as LevelDefinition, b));
    if (!spec.tutorial && (certificate.length < Math.ceil(spec.scrambleLength * 0.75) || new Set(certificate.map((c) => c.axis)).size < 2)) continue;
    let solved = initial;
    for (const mv of certificate) solved = applyMove(mask, solved, mv).board;
    const scrambleMoves = [...certificate].reverse().map(inverseMove);
    const m = maskMetrics(mask);
    const def: LevelDefinition = {
      id: spec.id,
      index: spec.index,
      title: spec.title,
      mode: 'sequence',
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
      tracks: [track],
      sourceIntervals: [{ ...spec.source }],
      solved,
      initial,
      scramble: scrambleMoves,
      certificate,
      metrics: {
        active: m.active,
        holes: m.holes,
        deadEnds: m.deadEnds,
        wrongTargetCells: wrong,
        certificateLength: certificate.length,
        axesUsed: [...new Set(certificate.map((mv) => mv.axis))].sort() as Axis[],
        difficulty: 'estimated',
      },
    };
    const errors = validateLevel(def, gene, existing);
    if (errors.length === 0) return def;
  }
  throw new Error(`${spec.id}: generation failed after ${MAX_ATTEMPTS} attempts (seed ${spec.seed})`);
}

/** Full validation used at generation time and in tests on the pinned level pack. */
export function validateLevel(def: LevelDefinition, gene: GeneSource, others: readonly LevelDefinition[]): string[] {
  const errors: string[] = [];
  const e = (msg: string): void => { errors.push(`${def.id}: ${msg}`); };
  if (def.mask.length !== 81 || !/^[#.]+$/.test(def.mask)) e('mask malformed');
  if (!isConnected(def.mask)) e('mask not connected');
  if (maskMetrics(def.mask).immobile > 0) e('mask has immobile cells');
  if (canonicalMask(def.mask) !== def.maskCanonical) e('canonical fingerprint mismatch');
  for (const o of others) {
    if (o.id === def.id) continue;
    if (o.maskCanonical === def.maskCanonical) e(`mask duplicates ${o.id} under rotation/reflection`);
    else if (symmetricDistance(def.mask, o.mask) < MIN_MASK_DISTANCE) e(`mask too similar to ${o.id}`);
  }
  if (gene.sequenceSha256 !== def.sequenceSha256 || gene.transcript !== def.transcript) e('dataset mismatch');
  const used = new Set<Cell>();
  for (const t of def.tracks) {
    if (t.cells.length < 3 || t.cells.length > 9) e('track length must be 3-9');
    if (t.cells.length !== t.expected.length) e('track/expected length mismatch');
    if (gene.sequence.slice(t.source.start, t.source.end) !== t.expected) e('track does not match source CDS');
    const step = t.orientation === 'horizontal' ? 1 : 9;
    t.cells.forEach((c, i) => {
      if (def.mask[c] !== '#') e(`track cell ${c} is a hole`);
      if (used.has(c)) e(`track cell ${c} overlaps`);
      used.add(c);
      if (i > 0 && c - t.cells[i - 1]! !== step) e('track cells not contiguous/ordered');
      if (t.orientation === 'horizontal' && Math.floor(c / 9) !== Math.floor(t.cells[0]! / 9)) e('horizontal track wraps rows');
    });
  }
  const holesOk = def.initial.split('').every((ch, i) => (ch === '.') === (def.mask[i] === '.'));
  if (!holesOk || def.solved.split('').some((ch, i) => (ch === '.') !== (def.mask[i] === '.'))) e('boards do not respect mask');
  if (!isSolved(def, def.solved)) e('solved board does not match targets');
  if (isSolved(def, def.initial)) e('initial board is pre-solved');
  let b = def.solved;
  for (const m of def.scramble) b = applyMove(def.mask, b, m).board;
  if (b !== def.initial) e('scramble does not reproduce initial board');
  const replay = replayCertificate(def);
  if (!replay.valid || !replay.solved) e('certificate does not solve the level');
  if (def.tutorial && def.certificate.length !== 1) e('tutorial must be exactly one move');
  if (def.tracks.every((t) => t.cells.every((c, i) => def.initial[c] === t.expected[i]))) e('pre-solved');
  return errors;
}

export function buildCampaign(specs: readonly LevelSpec[], gene: GeneSource): LevelDefinition[] {
  const out: LevelDefinition[] = [];
  for (const spec of specs) out.push(buildLevel(spec, gene, out));
  return out;
}

