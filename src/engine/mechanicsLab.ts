import { INS } from '../genomics/genes.ts';

/** Standalone lab puzzles. No campaign completion or energy is awarded. */
export const LAB_IDS = ['trace', 'crush', 'assembly', 'mutation', 'connections', 'restriction'] as const;
export type LabId = typeof LAB_IDS[number];
export type DNA = 'A' | 'C' | 'G' | 'T';
const dna = INS.sequence;
export const LAB_META: Record<LabId, { title: string; short: string; instructions: string; biology: string; icon: string }> = {
  trace: { title: 'DNA Tracing', short: 'Find and trace a sequence', instructions: 'Trace the target in order. Move between neighbouring cells, never diagonally or through a hole. You can also tap each base.', biology: 'A model of finding a sequence motif in DNA.', icon: '⌁' },
  crush: { title: 'Codon Crush', short: 'Swap, clear and refill', instructions: 'Swap two adjacent bases to make the next codon, left to right or top to bottom. A valid match clears three cells and new bases fall in.', biology: 'Codons are three-base instructions in a coding sequence; the gravity is a game mechanic.', icon: '▦' },
  assembly: { title: 'Genome Assembly', short: 'Overlap sequencing reads', instructions: 'Select or drag a read, then place its first base in the lower assembly row. Overlapping bases must agree. Use all three reads to reconstruct the nine-base reference.', biology: 'Inspired by overlapping sequencing reads to assemble a contiguous sequence.', icon: '⊞' },
  mutation: { title: 'Mutation Detective', short: 'Deduce and repair mismatches', instructions: 'Each upper strand is the reference. Tap a base in the lower strand, then choose its complementary base. Repair every mismatch.', biology: 'A model of DNA mismatch detection using A–T and C–G pairing.', icon: '⌕' },
  connections: { title: 'DNA Connections', short: 'Route complementary strands', instructions: 'Start at a numbered 5′ endpoint and trace to its matching 3′ endpoint. Paths may not cross, share cells or enter holes. Tap a start again to redraw its path.', biology: 'Pairs of reverse-complementary DNA fragments; the routing is an abstract puzzle.', icon: '↝' },
  restriction: { title: 'Restriction Enzyme', short: 'Cut at recognition sites', instructions: 'Use HaeIII at two GG|CC sites to isolate the target fragment. Tap a scissor-marked G to cut the bond after it. Avoid the decoy strand.', biology: 'HaeIII recognises GGCC and cuts between GG and CC. This puzzle abstracts a restriction digest.', icon: '✂' },
};
export const LAB_REFERENCE = { symbol: INS.symbol, transcript: INS.transcript, sourceUrl: INS.sourceUrl };
export const TRACE_TARGET = dna.slice(0, 9);
export const TRACE_PATH = [10, 11, 12, 21, 30, 31, 40, 49, 50] as const;
export const CRUSH_TARGETS = [dna.slice(0, 3), dna.slice(3, 6), dna.slice(6, 9)];
export const CRUSH_SWAPS = [[12, 13], [39, 40], [66, 67]] as const;
export const ASSEMBLY_TARGET = dna.slice(0, 9);
export const READS = [dna.slice(4, 9), dna.slice(0, 5), dna.slice(2, 7)];
export const READ_STARTS = [4, 0, 2] as const;
export const READ_CELLS = [0, 2, 4].map(r => Array.from({ length: 5 }, (_, c) => r * 9 + c + 1));
export const ASSEMBLY_CELLS = Array.from({ length: 9 }, (_, c) => 63 + c);
export const MUTATION_ROWS = [1, 4, 7].map((r, i) => ({ top: r * 9 + 1, bottom: (r + 1) * 9 + 1, seq: dna.slice(i * 7, i * 7 + 7) }));
export const MUTATIONS = [20, 23, 48, 74, 78] as const;
export const CONNECTION_ROUTES = [
  [1, 2, 3, 4, 5, 6, 7, 16, 25],
  [27, 28, 29, 38, 39, 40, 41, 42, 43, 44, 53],
  [55, 64, 73, 74, 75, 76, 77],
] as const;
export const CONNECTION_PAIRS = CONNECTION_ROUTES.map((route, i) => ({ start: route[0]!, end: route.at(-1)!, seq: dna.slice(i * 3, i * 3 + 3) }));
export const CUT_STRANDS = [
  Array.from({ length: 33 }, (_, i) => { const row = Math.floor(i / 9); const col = i % 9; return (row + 1) * 9 + (row % 2 ? 8 - col : col); }),
  [65, 66, 67, 68],
];
export const CUT_SEQUENCES = [dna.slice(210, 243), dna.slice(2, 6)];
export const CUT_TARGET = dna.slice(212, 241);
export const CUT_SITES = CUT_STRANDS.flatMap((strand, i) => {
  const seq = CUT_SEQUENCES[i]!;
  return Array.from({ length: seq.length - 3 }, (_, j) => j).filter(j => seq.slice(j, j + 4) === 'GGCC').map(j => strand[j + 1]!);
});
export const CUT_SOLUTION = [CUT_STRANDS[0]![1]!, CUT_STRANDS[0]![30]!];

export const complement = (b: string): DNA => ({ A: 'T', T: 'A', C: 'G', G: 'C' }[b] as DNA);
export const reverseComplement = (seq: string): string => [...seq].reverse().map(complement).join('');
export const adjacent = (a: number, b: number): boolean => Math.abs(Math.floor(a / 9) - Math.floor(b / 9)) + Math.abs(a % 9 - b % 9) === 1;
const validCell = (c: number): boolean => Number.isInteger(c) && c >= 0 && c < 81;
const BASES = 'ACGT';
const filler = (i: number, seed = 0): string => BASES[((Math.imul(i + 17 + seed * 97, 1103515245) >>> 16) ^ (i * 13 + seed * 7)) & 3]!;
const blank = (): string[] => Array<string>(81).fill('.');
const filled = (holes: readonly number[], seed: number): string[] => Array.from({ length: 81 }, (_, i) => holes.includes(i) ? '.' : filler(i, seed));

export interface LabState {
  id: LabId;
  board: string[];
  trace: number[];
  routes: number[][];
  placements: number[];
  cuts: number[];
  collected: number;
  refill: number;
  fresh: number[];
  moves: number;
  won: boolean;
}
export type LabAction =
  | { type: 'trace'; cell: number }
  | { type: 'swap'; a: number; b: number }
  | { type: 'place'; read: number; offset: number }
  | { type: 'edit'; cell: number; base: DNA }
  | { type: 'route'; pair: number; cell: number }
  | { type: 'cut'; cell: number };
/** Visual metadata for one successful codon swap, derived by the same pure rules as the final board. */
export interface CrushFall { from: number | null; to: number; rows: number }
export interface CrushTransition { swapped: string[]; matched: number[]; falls: CrushFall[] }
export interface LabResult { state: LabState; message: string; crush?: CrushTransition }

export function createLab(id: LabId): LabState {
  let board = blank();
  if (id === 'trace') {
    board = filled([0, 8, 18, 28, 52, 72, 80], 1);
    TRACE_PATH.forEach((p, i) => { board[p] = TRACE_TARGET[i]!; });
  } else if (id === 'crush') {
    board = filled([0, 8, 26, 27, 44, 53, 72, 80], 2);
    CRUSH_SWAPS.forEach(([a, b], i) => {
      const seq = CRUSH_TARGETS[i]!;
      board[a - 2] = seq[0]!; board[a - 1] = seq[1]!;
      board[a] = seq[2] === 'A' ? 'C' : 'A'; board[b] = seq[2]!;
    });
  } else if (id === 'assembly') {
    READ_CELLS.forEach((cells, i) => cells.forEach((c, j) => { board[c] = READS[i]![j]!; }));
    ASSEMBLY_CELLS.forEach(c => { board[c] = '·'; });
  } else if (id === 'mutation') {
    MUTATION_ROWS.forEach(({ top, bottom, seq }) => [...seq].forEach((b, i) => { board[top + i] = b; board[bottom + i] = complement(b); }));
    MUTATIONS.forEach(c => { board[c] = BASES[(BASES.indexOf(board[c]!) + 1) % 4]!; });
  } else if (id === 'connections') {
    board = Array.from({ length: 81 }, (_, i) => [0, 9, 10, 11, 12, 13, 14, 20, 21, 22, 23, 30, 31, 32, 33, 45, 46, 47, 48, 49, 50, 60, 61, 62, 70, 71, 79, 80].includes(i) ? '.' : '·');
    CONNECTION_PAIRS.forEach(p => { board[p.start] = p.seq; board[p.end] = reverseComplement(p.seq); });
  } else {
    CUT_STRANDS.forEach((strand, i) => strand.forEach((c, j) => { board[c] = CUT_SEQUENCES[i]![j]!; }));
  }
  return { id, board, trace: [], routes: [[], [], []], placements: [-1, -1, -1], cuts: [], collected: 0, refill: 0, fresh: [], moves: 0, won: false };
}

export function mutationExpected(cell: number): DNA | null {
  for (const { bottom, seq } of MUTATION_ROWS) if (cell >= bottom && cell < bottom + seq.length) return complement(seq[cell - bottom]!);
  return null;
}
export function mutationCount(board: readonly string[]): number {
  return MUTATION_ROWS.reduce((count, { bottom, seq }) => count + [...seq].filter((b, i) => board[bottom + i] !== complement(b)).length, 0);
}

function matchingTriples(board: readonly string[], seq: string): number[][] {
  const result: number[][] = [];
  for (let c = 0; c < 81; c++) {
    for (const step of [1, 9]) {
      const end = c + step * 2;
      if (end >= 81 || (step === 1 && Math.floor(c / 9) !== Math.floor(end / 9))) continue;
      const cells = [c, c + step, end];
      if (cells.map(p => board[p]).join('') === seq) result.push(cells);
    }
  }
  return result;
}

/** Clear the matched codon, settle independently within each vertical segment, then refill. */
function settle(board: string[], cells: readonly number[], refill: number): { board: string[]; refill: number; fresh: number[]; falls: CrushFall[] } {
  const out = [...board]; const fresh: number[] = []; const falls: CrushFall[] = [];
  cells.forEach(c => { out[c] = ''; });
  for (let col = 0; col < 9; col++) {
    let bottom = 8;
    while (bottom >= 0) {
      if (out[bottom * 9 + col] === '.') { bottom--; continue; }
      let top = bottom;
      while (top > 0 && out[(top - 1) * 9 + col] !== '.') top--;
      const segment = Array.from({ length: bottom - top + 1 }, (_, i) => (top + i) * 9 + col);
      const kept = segment.filter(c => out[c] !== '').map(c => ({ cell: c, base: out[c]! }));
      const missing = segment.length - kept.length;
      segment.forEach((c, i) => {
        if (i < missing) {
          out[c] = filler(refill++, 3); fresh.push(c);
          // New bases fade in from within their own segment, not through a hole.
          falls.push({ from: null, to: c, rows: Math.min(1, i) });
        } else {
          const tile = kept[i - missing]!;
          out[c] = tile.base;
          if (tile.cell !== c) falls.push({ from: tile.cell, to: c, rows: (c - tile.cell) / 9 });
        }
      });
      bottom = top - 1;
    }
  }
  return { board: out, refill, fresh, falls };
}

function assemblyRow(placements: readonly number[]): string[] | null {
  const row = Array<string>(9).fill('·');
  for (let i = 0; i < READS.length; i++) {
    const offset = placements[i]!;
    if (offset === -1) continue;
    const read = READS[i]!;
    if (offset < 0 || offset + read.length > row.length) return null;
    for (let j = 0; j < read.length; j++) {
      if (row[offset + j] !== '·' && row[offset + j] !== read[j]) return null;
      row[offset + j] = read[j]!;
    }
  }
  return row;
}

export function applyLab(state: LabState, action: LabAction): LabResult {
  const no = (message: string): LabResult => ({ state, message });
  const yes = (patch: Partial<LabState>, message: string): LabResult => ({ state: { ...state, fresh: [], ...patch, moves: state.moves + 1 }, message });
  if (state.won) return no('Challenge complete. Replay to start again.');
  if (action.type === 'trace' && state.id === 'trace') {
    const c = action.cell, path = state.trace;
    if (!validCell(c) || state.board[c] === '.') return no('Stay on the DNA tiles.');
    if (path.at(-1) === c) return no('');
    if (path.length > 1 && path.at(-2) === c) return yes({ trace: path.slice(0, -1) }, 'Backtracked.');
    if (path.includes(c) || (path.length && !adjacent(path.at(-1)!, c))) return no('Follow neighbouring cells without reusing one.');
    if (state.board[c] !== TRACE_TARGET[path.length]) return no('Find the next base in the target.');
    const trace = [...path, c];
    return yes({ trace, won: trace.length === TRACE_TARGET.length }, trace.length === TRACE_TARGET.length ? 'Sequence found.' : 'Keep tracing.');
  }
  if (action.type === 'swap' && state.id === 'crush') {
    const { a, b } = action;
    if (!validCell(a) || !validCell(b) || !adjacent(a, b) || state.board[a] === '.' || state.board[b] === '.') return no('Choose neighbouring DNA tiles.');
    const board = [...state.board];
    if (board[a] === board[b]) return no('Those bases are identical.');
    [board[a], board[b]] = [board[b]!, board[a]!];
    const target = CRUSH_TARGETS[state.collected]!;
    const old = new Set(matchingTriples(state.board, target).map(c => c.join(',')));
    const match = matchingTriples(board, target).find(c => (c.includes(a) || c.includes(b)) && !old.has(c.join(',')));
    if (!match) return no('That swap does not create the next codon.');
    const collected = state.collected + 1;
    const { falls, ...settled } = settle(board, match, state.refill);
    return { ...yes({ ...settled, collected, won: collected === CRUSH_TARGETS.length }, 'Collected ' + target + ' — tiles refilled.'), crush: { swapped: board, matched: match, falls } };
  }
  if (action.type === 'place' && state.id === 'assembly') {
    const { read, offset } = action;
    if (!Number.isInteger(read) || read < 0 || read >= READS.length || !Number.isInteger(offset) || offset < 0 || offset >= 9) return no('Choose a read and an assembly slot.');
    const placements = [...state.placements]; placements[read] = offset;
    const row = assemblyRow(placements);
    if (!row) return no('The read does not fit: overlaps must agree.');
    const board = [...state.board]; ASSEMBLY_CELLS.forEach((c, i) => { board[c] = row[i]!; });
    const won = placements.every(p => p >= 0) && row.join('') === ASSEMBLY_TARGET;
    return yes({ placements, board, won }, won ? 'Reference reconstructed.' : 'Read placed. Align all three.');
  }
  if (action.type === 'edit' && state.id === 'mutation') {
    if (!validCell(action.cell) || !mutationExpected(action.cell) || !BASES.includes(action.base)) return no('Edit only the lower strand.');
    if (state.board[action.cell] === action.base) return no('That base is already present.');
    const board = [...state.board]; board[action.cell] = action.base;
    const remaining = mutationCount(board);
    return yes({ board, won: remaining === 0 }, remaining ? remaining + ' mismatches remain.' : 'All mismatches repaired.');
  }
  if (action.type === 'route' && state.id === 'connections') {
    const { pair, cell } = action;
    const endpoints = CONNECTION_PAIRS[pair];
    if (!endpoints || !validCell(cell) || state.board[cell] === '.') return no('Route around the holes.');
    const path = state.routes[pair]!;
    const routes = state.routes.map(p => [...p]);
    if (cell === endpoints.start) { routes[pair] = [cell]; return yes({ routes }, 'Draw toward the matching endpoint.'); }
    if (!path.length || path.at(-1) === cell) return no('');
    if (path.at(-2) === cell) { routes[pair] = path.slice(0, -1); return yes({ routes }, 'Backtracked.'); }
    if (path.at(-1) === endpoints.end || !adjacent(path.at(-1)!, cell) || path.includes(cell)) return no('Follow adjacent, unused cells.');
    if (CONNECTION_PAIRS.some((p, i) => i !== pair && (p.start === cell || p.end === cell || state.routes[i]!.includes(cell)))) return no('Strands cannot cross or share cells.');
    routes[pair] = [...path, cell];
    const won = routes.every((r, i) => r.at(-1) === CONNECTION_PAIRS[i]!.end);
    return yes({ routes, won }, won ? 'All complementary strands connected.' : cell === endpoints.end ? 'Pair connected. Start another.' : 'Keep routing.');
  }
  if (action.type === 'cut' && state.id === 'restriction') {
    if (!CUT_SITES.includes(action.cell)) return no('HaeIII cuts only at GG|CC.');
    if (state.cuts.includes(action.cell)) return no('That bond is already cut.');
    if (state.cuts.length >= 2) return no('No cuts left. Undo or replay.');
    const cuts = [...state.cuts, action.cell];
    const won = CUT_SOLUTION.every(c => cuts.includes(c));
    return yes({ cuts, won }, won ? 'Target fragment isolated.' : cuts.length === 2 ? 'Wrong fragment isolated. Undo and try again.' : 'One cut remaining.');
  }
  return no('Choose an action for this challenge.');
}

export function labHint(state: LabState): string {
  switch (state.id) {
    case 'trace': return state.trace.every((c, i) => c === TRACE_PATH[i]) ? 'Try row ' + (Math.floor(TRACE_PATH[state.trace.length]! / 9) + 1) + ', column ' + (TRACE_PATH[state.trace.length]! % 9 + 1) + '.' : 'Backtrack to the start of the highlighted sequence, or replay.';
    case 'crush': return 'Try swapping the third and fourth tiles of the prepared codon in row ' + (2 + state.collected * 3) + '.';
    case 'assembly': return 'Read 2 starts at slot 1, Read 3 at slot 3, Read 1 at slot 5.';
    case 'mutation': { const c = state.board.findIndex((b, i) => mutationExpected(i) !== null && mutationExpected(i) !== b); return c < 0 ? 'All correct.' : 'Check row ' + (Math.floor(c / 9) + 1) + ', column ' + (c % 9 + 1) + '.'; }
    case 'connections': return 'Route pair 1 across the top, pair 2 across the middle, and pair 3 along the bottom.';
    case 'restriction': return 'Cut the two GG|CC bonds on the long strand. Leave the short decoy intact.';
  }
}
