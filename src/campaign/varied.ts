import { createRng, type Rng } from '../generator/rng.ts';
import { applyLab, createLab, labExtractedSequence, mutationExpected, type LabAction, type LabSpec } from '../engine/mechanicsLab.ts';
import type { LevelDefinition } from '../engine/types.ts';
import type { MixedStage } from './mixed.ts';

/** Pinned per-level geometry. Gameplay never consumes ambient randomness. */
const shuffle = <T,>(source: readonly T[], rng: Rng): T[] => {
  const items = [...source];
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
};
const allCells = Array.from({ length: 81 }, (_, i) => i);
const around = (cell: number): number[] => {
  const row = Math.floor(cell / 9), col = cell % 9;
  return [row > 0 ? cell - 9 : -1, row < 8 ? cell + 9 : -1, col > 0 ? cell - 1 : -1, col < 8 ? cell + 1 : -1].filter(c => c >= 0);
};
const hash = (text: string): number => {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
};
const transform = (cell: number, symmetry: number): number => {
  let row = Math.floor(cell / 9), col = cell % 9;
  if (symmetry & 4) col = 8 - col;
  for (let i = 0; i < (symmetry & 3); i++) [row, col] = [col, 8 - row];
  return row * 9 + col;
};
const serpentine = (rng: Rng): number[] => {
  const horizontal = Array.from({ length: 81 }, (_, i) => {
    const row = Math.floor(i / 9), col = i % 9;
    return row * 9 + (row % 2 ? 8 - col : col);
  });
  const symmetry = rng.int(8);
  return horizontal.map(c => transform(c, symmetry));
};

/** A bounded, seeded self-avoiding walk; the snake fallback guarantees long paths. */
function walk(length: number, rng: Rng, allowed: readonly number[] = allCells): number[] {
  if (length > allowed.length || length < 1) throw Error('Invalid route length');
  const permitted = new Set(allowed);
  for (let attempt = 0; attempt < 36; attempt++) {
    const first = rng.pick(allowed), path = [first], used = new Set(path);
    while (path.length < length) {
      const next = shuffle(around(path.at(-1)!).filter(c => permitted.has(c) && !used.has(c)), rng);
      if (!next.length) break;
      // Bias toward squares with onward exits, avoiding premature dead ends.
      const candidates = next.sort((a, b) =>
        around(b).filter(c => permitted.has(c) && !used.has(c)).length -
        around(a).filter(c => permitted.has(c) && !used.has(c)).length);
      const choice = candidates[rng.int(Math.min(2, candidates.length))]!;
      path.push(choice); used.add(choice);
    }
    if (path.length === length) return path;
  }
  const snake = serpentine(rng).filter(c => permitted.has(c));
  // Restricted corridors have a continuous band-shaped fallback.
  for (let i = 0; i <= snake.length - length; i++) {
    const section = snake.slice(i, i + length);
    if (section.every((c, j) => j === 0 || around(c).includes(section[j - 1]!))) return section;
  }
  throw Error('Cannot construct a contiguous certified route');
}
const holesOutside = (rng: Rng, protectedCells: readonly number[], count: number): number[] => {
  const used = new Set(protectedCells);
  return shuffle(allCells.filter(c => !used.has(c)), rng).slice(0, count).sort((a, b) => a - b);
};
const rowBand = (start: number): number[] =>
  Array.from({ length: 27 }, (_, i) => (start + Math.floor(i / 9)) * 9 + i % 9);

function varyTrace(stage: MixedStage, rng: Rng): MixedStage {
  const spec = { ...stage.spec };
  spec.TRACE_PATH = walk(spec.TRACE_TARGET.length, rng);
  spec.traceHoles = holesOutside(rng, spec.TRACE_PATH, rng.range(8, 18));
  return { ...stage, spec, certificate: spec.TRACE_PATH.slice(Math.min(2,spec.TRACE_PATH.length-1)).map(cell => ({ type: 'trace' as const, cell })) };
}

function varyConnections(stage: MixedStage, rng: Rng): MixedStage {
  const spec = { ...stage.spec }, symmetry = rng.int(8);
  const lengths = [rng.range(7, 13), rng.range(8, 15), rng.range(7, 13)];
  const routes = [0, 3, 6].map((start, i) => walk(lengths[i]!, rng, rowBand(start)).map(c => transform(c, symmetry)));
  // Shuffle the endpoint labels as well as the route geometry.
  const permutation = shuffle([0, 1, 2], rng);
  spec.CONNECTION_ROUTES = permutation.map(i => routes[i]!);
  spec.CONNECTION_PAIRS = permutation.map((i, label) => ({
    ...stage.spec.CONNECTION_PAIRS[label]!,
    start: routes[i]![0]!, end: routes[i]!.at(-1)!,
  }));
  spec.connectionHoles = holesOutside(rng, routes.flat(), rng.range(13, 24));
  return {
    ...stage, spec,
    certificate: spec.CONNECTION_ROUTES.flatMap((route, pair) => route.map(cell => ({ type: 'route' as const, pair, cell }))),
  };
}

function varyAssembly(stage: MixedStage, rng: Rng): MixedStage {
  const spec = { ...stage.spec }, n = spec.ASSEMBLY_TARGET.length;
  if (n < 3) return stage;
  const length = Math.min(n - 1, Math.max(2, Math.ceil(n * .56) + rng.int(2)));
  const span = n - length;
  const middle = span > 1 ? rng.range(1, span - 1) : rng.range(0, span);
  const offsets = shuffle([0, middle, span], rng);
  const rows = shuffle([0, 2, 4], rng);
  spec.READ_STARTS = offsets;
  spec.READS = offsets.map(start => spec.ASSEMBLY_TARGET.slice(start, start + length));
  spec.READ_CELLS = offsets.map((_, i) => {
    const first = rng.range(0, 9 - length);
    return Array.from({ length }, (_, j) => rows[i]! * 9 + first + j);
  });
  spec.READ_ORDER = shuffle([0, 1, 2], rng);
  return { ...stage, spec, certificate: spec.READ_ORDER.map(read => ({ type: 'place' as const, read, offset: offsets[read]! })) };
}

function varyMutation(stage: MixedStage, rng: Rng): MixedStage {
  const spec = { ...stage.spec }, mapping = new Map<number, number>();
  const topRows = [rng.int(2), 3 + rng.int(2), 6 + rng.int(2)];
  spec.MUTATION_ROWS = spec.MUTATION_ROWS.map((source, i) => {
    // Column 9 is the Mutation Correction base-picker rail; never place DNA there.
    const col = rng.range(0, 8 - source.seq.length);
    const top = topRows[i]! * 9 + col, bottom = top + 9;
    for (let j = 0; j < source.seq.length; j++) mapping.set(source.bottom + j, bottom + j);
    return { ...source, top, bottom };
  });
  spec.MUTATIONS = spec.MUTATIONS.map(cell => mapping.get(cell)!);
  if (spec.mutationOptions) spec.mutationOptions = Object.fromEntries(
    Object.entries(spec.mutationOptions).map(([cell, options]) => [mapping.get(Number(cell))!, options]));
  if (spec.mutationInitial) spec.mutationInitial = Object.fromEntries(
    Object.entries(spec.mutationInitial).map(([cell, initial]) => [mapping.get(Number(cell))!, initial]));
  return { ...stage, spec, certificate: spec.MUTATIONS.map(cell =>
    ({ type: 'edit' as const, cell, base: mutationExpected(cell, spec)! })) };
}

function varyRestriction(stage: MixedStage, rng: Rng): MixedStage {
  const spec = { ...stage.spec }, [oldMain, oldDecoy] = spec.CUT_STRANDS;
  const n = oldMain!.length, m = oldDecoy!.length;
  const snake = serpentine(rng);
  const offsets = Array.from({ length: 82 - n }, (_, i) => i).filter(i => i >= m || 81 - i - n >= m);
  const offset = rng.pick(offsets);
  const main = snake.slice(offset, offset + n);
  const sides = [
    ...(offset >= m ? [snake.slice(offset - m, offset)] : []),
    ...(81 - offset - n >= m ? [snake.slice(offset + n, offset + n + m)] : []),
  ];
  const decoy = rng.pick(sides);
  const relocate = (cell: number): number => {
    const i = oldMain!.indexOf(cell);
    if (i >= 0) return main[i]!;
    const j = oldDecoy!.indexOf(cell);
    if (j >= 0) return decoy[j]!;
    throw Error('Restriction site outside a strand');
  };
  spec.CUT_STRANDS = [main, decoy];
  spec.CUT_SOLUTION = spec.CUT_SOLUTION.map(relocate);
  spec.CUT_SITES = spec.CUT_SITES.map(relocate);
  return { ...stage, spec, certificate: spec.CUT_SOLUTION.map(cell => ({ type: 'cut' as const, cell })) };
}

/** Plant each ordered codon in different seeded rows/columns and verify every
 * legal clearing, fall and refill against the real engine before shipping it. */
function varyCrush(stage: MixedStage, rng: Rng): MixedStage {
  const original = stage.spec, targets = original.CRUSH_TARGETS;
  if (targets.length > 9 || !targets.every(t => t.length === 3)) return stage;
  const base = original.crushBoard ?? createLab('crush', original).board;
  for (let attempt = 0; attempt < 72; attempt++) {
    const rows = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8], rng).slice(0, targets.length).sort((a, b) => a - b);
    const swaps: [number, number][] = [];
    const board = Array.from({ length: 81 }, (_, cell) =>
      original.blockFill?.length ? rng.pick(original.blockFill) : base[cell] === '.' ? rng.pick(['A', 'C', 'G', 'T']) : base[cell]!);
    const used = new Set<number>();
    let conflict = false;
    for (let i = 0; i < targets.length; i++) {
      const row = rows[i]!, col = rng.range(2, 7), a = row * 9 + col, b = a + 1, word = targets[i]!;
      const cells = [a - 2, a - 1, a, b];
      if (cells.some(c => used.has(c))) { conflict = true; break; }
      cells.forEach(c => used.add(c));
      const wrong = original.blockFill?.find(sym => sym !== word[2]) ??
        (['A', 'C', 'G', 'T'].find(sym => sym !== word[2])!);
      board[a - 2] = word[0]!; board[a - 1] = word[1]!;
      board[a] = wrong; board[b] = word[2]!;
      swaps.push([a, b]);
    }
    if (conflict) continue;
    const protectedCells = [...used];
    const holes = [0, 8, 72, 80].filter(c => !used.has(c));
    holes.push(...holesOutside(rng, [...protectedCells, ...holes], rng.range(2, 10)));
    holes.forEach(c => { board[c] = '.'; });
    const spec: LabSpec = { ...original, CRUSH_SWAPS: swaps, crushHoles: holes, crushBoard: board };
    let state = createLab('crush', spec);
    const certificate: LabAction[] = [];
    for (let i = 0; i < targets.length && !state.won; i++) {
      const pair = swaps[state.collected];
      if (!pair) break;
      const action: LabAction = { type: 'swap', a: pair[0], b: pair[1] };
      const next = applyLab(state, action).state;
      if (next === state) break;
      certificate.push(action);
      state = next;
    }
    if (state.won && certificate.length && labExtractedSequence(state) === stage.sequence)
      return { ...stage, spec, certificate };
  }
  return stage;
}

export function variedStage(def: Pick<LevelDefinition,'id'> & { seed?: number }, stage: MixedStage): MixedStage {
  const rng = createRng(((def.seed ?? hash(def.id)) ^ hash(def.id + ':' + stage.mechanic) ^ 0x4d584447) >>> 0);
  switch (stage.mechanic) {
    case 'trace': return varyTrace(stage, rng);
    case 'connections': return varyConnections(stage, rng);
    case 'assembly': return varyAssembly(stage, rng);
    case 'mutation': return varyMutation(stage, rng);
    case 'restriction': return varyRestriction(stage, rng);
    case 'crush': return varyCrush(stage, rng);
  }
}
