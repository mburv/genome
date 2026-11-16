import { INS } from '../genomics/genes.ts';
import type { TokenDef } from './tokens.ts';

/** Standalone lab puzzles. No campaign completion or energy is awarded. */
export const LAB_IDS = ['trace', 'crush', 'assembly', 'mutation', 'connections', 'restriction'] as const;
export type LabId = typeof LAB_IDS[number];
export type DNA = 'A' | 'C' | 'G' | 'T';
const dna = INS.sequence;
export const LAB_META: Record<LabId, { title: string; short: string; instructions: string; biology: string; icon: string }> = {
  trace: { title: 'DNA Tracing', short: 'Find and trace a sequence', instructions: 'Continue from the two connected starter bases. Trace the target in order using neighbouring cells, never diagonally or through a hole. You can also tap each base.', biology: 'A model of finding a sequence motif in DNA.', icon: '⌁' },
  crush: { title: 'Codon Crush', short: 'Swap, clear and refill', instructions: 'Swap two adjacent bases to make the next codon, left to right or top to bottom. Matches clear three cells, refill, and automatically chain into the next required codon when it is already present.', biology: 'Codons are three-base instructions in a coding sequence; the gravity is a game mechanic.', icon: '▦' },
  assembly: { title: 'Genome Assembly', short: 'Overlap sequencing reads', instructions: 'Select or drag a read, then place its first base in the lower assembly row. Overlapping bases must agree. Use all three reads to reconstruct the nine-base reference.', biology: 'Inspired by overlapping sequencing reads to assemble a contiguous sequence.', icon: '⊞' },
  mutation: { title: 'Mutation Correction', short: 'Deduce and repair mismatches', instructions: 'Each upper strand is the reference. Tap a base in the lower strand, then choose its complementary base. Repair every mismatch.', biology: 'A model of DNA mismatch detection using A–T and C–G pairing.', icon: '⌕' },
  connections: { title: 'DNA Connections', short: 'Route complementary strands', instructions: 'Start at a numbered 5′ endpoint and trace to its matching 3′ endpoint. Paths may not cross, share cells or enter holes. Tap a start again to redraw its path.', biology: 'Pairs of reverse-complementary DNA fragments; the routing is an abstract puzzle.', icon: '↝' },
  restriction: { title: 'Restriction Enzyme', short: 'Cut at recognition sites', instructions: 'Use HaeIII at two GG|CC sites to isolate the target fragment. Tap a scissor-marked G to cut the bond after it. Avoid the decoy strand.', biology: 'HaeIII recognises GGCC and cuts between GG and CC. This puzzle abstracts a restriction digest.', icon: '✂' },
};
export const LAB_REFERENCE = { symbol: INS.symbol, transcript: INS.transcript, sourceUrl: INS.sourceUrl };
export const TRACE_TARGET = dna.slice(0, 9);
export const TRACE_PATH = [10, 11, 12, 21, 30, 31, 40, 49, 50] as const;
export const CRUSH_TARGETS = dna.slice(0, 18).match(/.{3}/g)!;
/** Starter near-matches; the actual solution can collect several codons per swap. */
export const CRUSH_SWAPS = [[12, 13], [39, 40], [66, 67]] as const;
export const CRUSH_SOLUTION = [[12,13],[4,13]] as const;
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

export interface LabSpec {
  TRACE_TARGET: string; TRACE_PATH: readonly number[]; traceHoles: readonly number[];
  CRUSH_TARGETS: readonly string[]; CRUSH_SWAPS: readonly (readonly [number, number])[]; crushHoles: readonly number[]; crushSeed?: number;
  ASSEMBLY_TARGET: string; READS: readonly string[]; READ_STARTS: readonly number[]; READ_ORDER?: readonly number[]; READ_CELLS: readonly (readonly number[])[]; ASSEMBLY_CELLS: readonly number[];
  MUTATION_ROWS: readonly { top: number; bottom: number; seq: string }[]; MUTATIONS: readonly number[];
  CONNECTION_ROUTES: readonly (readonly number[])[]; CONNECTION_PAIRS: readonly { start: number; end: number; seq: string; complement?: string }[];
  connectionHoles: readonly number[];
  CUT_STRANDS: readonly (readonly number[])[]; CUT_SEQUENCES: readonly string[]; CUT_TARGET: string; CUT_SITES: readonly number[]; CUT_SOLUTION: readonly number[];
  enzyme: string;
  tokens?: Record<string,TokenDef>; blockSize?: number; blockFill?: string[];
  blockComplements?: Record<string,string>; mutationOptions?: Record<number,string[]>; mutationInitial?: Record<number,string>;
  crushBoard?: string[];
}
export const labDecode = (spec:LabSpec,symbols:string):string => spec.tokens ? [...symbols].map(s=>spec.tokens![s]?.seq??s).join('') : symbols;
export const labLabel = (spec:LabSpec,symbol:string):string => spec.tokens?.[symbol]?.label??symbol;
export const labComplement = (spec:LabSpec,symbol:string):string => spec.blockComplements?.[symbol]??complement(symbol);
export const labReplacementOptions = (spec:LabSpec,cell:number):readonly string[] => spec.mutationOptions?.[cell]??['A','C','G','T'];
const labFill = (spec:LabSpec,i:number,seed:number):string => spec.blockFill?.length ? spec.blockFill[(((Math.imul(i+17+seed*97,1103515245)>>>16)^(i*13+seed*7))>>>0)%spec.blockFill.length]! : filler(i,seed);
export const DEFAULT_LAB_SPEC: LabSpec = {
  TRACE_TARGET, TRACE_PATH, traceHoles: [0,8,18,28,52,72,80],
  CRUSH_TARGETS, CRUSH_SWAPS, crushHoles: [0,8,26,27,44,53,72,80],
  ASSEMBLY_TARGET, READS, READ_STARTS, READ_CELLS, ASSEMBLY_CELLS,
  MUTATION_ROWS, MUTATIONS, CONNECTION_ROUTES, CONNECTION_PAIRS,
  connectionHoles: [0,9,10,11,12,13,14,20,21,22,23,30,31,32,33,45,46,47,48,49,50,60,61,62,70,71,79,80],
  CUT_STRANDS, CUT_SEQUENCES, CUT_TARGET, CUT_SITES, CUT_SOLUTION, enzyme: 'HaeIII',
};

export interface LabState {
  spec: LabSpec;
  collectedSeq: string;
  id: LabId;
  board: string[];
  trace: number[];
  /** Two fixed, free starter bases for new traces; zero for legacy attempts. */
  traceStarter: number;
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
  | { type: 'edit'; cell: number; base: string }
  | { type: 'route'; pair: number; cell: number }
  | { type: 'cut'; cell: number };
/** Visual metadata for one successful codon swap, derived by the same pure rules as the final board. */
export interface CrushFall { from: number | null; to: number; rows: number }
export interface CrushTransition { swapped: string[]; matched: number[]; falls: CrushFall[]; board: string[]; codon: string }
export interface LabResult { state: LabState; message: string; crush?: CrushTransition; crushFrames?: CrushTransition[] }

export function createLab(id: LabId, spec: LabSpec = DEFAULT_LAB_SPEC, seedTrace = true): LabState {
  const { TRACE_TARGET, TRACE_PATH, CRUSH_TARGETS, CRUSH_SWAPS, READ_CELLS, READS, ASSEMBLY_CELLS, MUTATION_ROWS, MUTATIONS, CONNECTION_PAIRS, CUT_STRANDS, CUT_SEQUENCES } = spec;
  let board = blank();
  if (id === 'trace') {
    board = spec.tokens ? Array.from({length:81},(_,i)=>spec.traceHoles.includes(i)?'.':labFill(spec,i,1)) : filled(spec.traceHoles, 1);
    TRACE_PATH.forEach((p, i) => { board[p] = TRACE_TARGET[i]!; });
  } else if (id === 'crush' && spec.crushBoard) {
    board=[...spec.crushBoard];
  } else if (id === 'crush') {
    board = filled(spec.crushHoles, spec.crushSeed ?? 2);
    CRUSH_SWAPS.forEach(([a, b], i) => {
      const seq = CRUSH_TARGETS[i];
      if (!seq) return;
      board[a - 2] = seq[0]!; board[a - 1] = seq[1]!;
      board[a] = seq[2] === 'A' ? 'C' : 'A';
      if (i === 0 && [seq[1], board[a], seq[2]].join('') === seq) board[a] = [...BASES].find(x=>!seq.includes(x))!;
      board[b] = seq[2]!;
    });
    // Start with a stable board and a guaranteed teaching swap.
    const target = CRUSH_TARGETS[0]!;
    const first = CRUSH_SWAPS[0]!;
    const protectedCells = new Set([first[0]-2,first[0]-1,...first]);
    const other = [...BASES].find(b=>!target.includes(b))!;
    for (const match of matchingTriples(board,target)) {
      const cell = match.findLast(c=>!protectedCells.has(c));
      if (cell !== undefined) board[cell]=other;
    }
  } else if (id === 'assembly') {
    READ_CELLS.forEach((cells, i) => cells.forEach((c, j) => { board[c] = READS[i]![j]!; }));
    ASSEMBLY_CELLS.forEach(c => { board[c] = '·'; });
  } else if (id === 'mutation') {
    MUTATION_ROWS.forEach(({ top, bottom, seq }) => [...seq].forEach((b, i) => { board[top + i] = b; board[bottom + i] = labComplement(spec,b); }));
    MUTATIONS.forEach(c => { board[c] = spec.mutationInitial?.[c]??BASES[(BASES.indexOf(board[c]!) + 1) % 4]!; });
  } else if (id === 'connections') {
    board = Array.from({ length: 81 }, (_, i) => spec.connectionHoles.includes(i) ? '.' : '·');
    CONNECTION_PAIRS.forEach(p => { board[p.start] = p.seq; board[p.end] = p.complement??reverseComplement(p.seq); });
  } else {
    CUT_STRANDS.forEach((strand, i) => strand.forEach((c, j) => { board[c] = CUT_SEQUENCES[i]![j]!; }));
  }
  const traceStarter = id === 'trace' && seedTrace ? Math.min(2, TRACE_PATH.length - 1) : 0;
  return { id, spec, collectedSeq: '', board, trace: TRACE_PATH.slice(0, traceStarter), traceStarter, routes: CONNECTION_PAIRS.map(() => []), placements: READS.map(() => -1), cuts: [], collected: 0, refill: 0, fresh: [], moves: 0, won: false };
}

export function mutationExpected(cell: number, spec: LabSpec = DEFAULT_LAB_SPEC): string | null {
  for (const { bottom, seq } of spec.MUTATION_ROWS) if (cell >= bottom && cell < bottom + seq.length) return labComplement(spec,seq[cell - bottom]!);
  return null;
}
export function mutationCount(board: readonly string[], spec: LabSpec = DEFAULT_LAB_SPEC): number {
  return spec.MUTATION_ROWS.reduce((count, { bottom, seq }) => count + [...seq].filter((b, i) => board[bottom + i] !== labComplement(spec,b)).length, 0);
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
function settle(board: string[], cells: readonly number[], refill: number,spec:LabSpec): { board: string[]; refill: number; fresh: number[]; falls: CrushFall[] } {
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
          out[c] = labFill(spec,refill++,3); fresh.push(c);
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

function assemblyRow(placements: readonly number[], spec: LabSpec): string[] | null {
  const { READS } = spec;
  const row = Array<string>(spec.ASSEMBLY_CELLS.length).fill('·');
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
  const { TRACE_TARGET, CRUSH_TARGETS, READS, ASSEMBLY_CELLS, ASSEMBLY_TARGET, CONNECTION_PAIRS, CUT_SITES, CUT_SOLUTION } = state.spec;
  const no = (message: string): LabResult => ({ state, message });
  const yes = (patch: Partial<LabState>, message: string): LabResult => ({ state: { ...state, fresh: [], ...patch, moves: state.moves + 1 }, message });
  if (state.won) return no('Challenge complete. Replay to start again.');
  if (action.type === 'trace' && state.id === 'trace') {
    const c = action.cell, path = state.trace;
    if (!validCell(c) || state.board[c] === '.') return no('Stay on the DNA tiles.');
    if (path.at(-1) === c) return path.length === 1 ? yes({ trace: [] }, 'Backtracked.') : no('');
    if (path.length > 1 && path.at(-2) === c) return path.length <= state.traceStarter ? no('') : yes({ trace: path.slice(0, -1) }, 'Backtracked.');
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
    // One player action, one undo snapshot, potentially many ordered collections.
    const frames: CrushTransition[] = [];
    let currentBoard = board, currentMatch: number[] | undefined = match;
    let collected = state.collected, refill = state.refill, collectedSeq = state.collectedSeq;
    let fresh: number[] = [];
    while (currentMatch && collected < CRUSH_TARGETS.length) {
      const codon = labDecode(state.spec,currentMatch.map(c=>currentBoard[c]).join(''));
      const settled = settle(currentBoard,currentMatch,refill,state.spec);
      frames.push({swapped:currentBoard, matched:currentMatch, falls:settled.falls, board:settled.board, codon});
      collectedSeq += codon; collected++;
      currentBoard=settled.board; refill=settled.refill; fresh=settled.fresh;
      currentMatch = collected < CRUSH_TARGETS.length ? matchingTriples(currentBoard,CRUSH_TARGETS[collected]!)[0] : undefined;
    }
    const message = frames.length > 1 ? 'Chain reaction ×'+frames.length+' — '+frames.map(f=>f.codon).join(' → ') : 'Collected '+labDecode(state.spec,target)+' — tiles refilled.';
    return {...yes({board:currentBoard,refill,fresh,collected,collectedSeq,won:collected===CRUSH_TARGETS.length},message),crush:frames[0]!,crushFrames:frames};
  }
  if (action.type === 'place' && state.id === 'assembly') {
    const { read, offset } = action;
    if (!Number.isInteger(read) || read < 0 || read >= READS.length || !Number.isInteger(offset) || offset < 0 || offset >= ASSEMBLY_CELLS.length) return no('Choose a read and an assembly slot.');
    const placements = [...state.placements]; placements[read] = offset;
    const row = assemblyRow(placements, state.spec);
    if (!row) return no('The read does not fit: overlaps must agree.');
    const board = [...state.board]; ASSEMBLY_CELLS.forEach((c, i) => { board[c] = row[i]!; });
    const won = placements.every(p => p >= 0) && row.join('') === ASSEMBLY_TARGET;
    return yes({ placements, board, won }, won ? 'Reference reconstructed.' : 'Read placed. Align all three.');
  }
  if (action.type === 'edit' && state.id === 'mutation') {
    if (!validCell(action.cell) || !mutationExpected(action.cell, state.spec) || !labReplacementOptions(state.spec,action.cell).includes(action.base)) return no('Edit only the lower strand.');
    if (state.board[action.cell] === action.base) return no('That base is already present.');
    const board = [...state.board]; board[action.cell] = action.base;
    const remaining = mutationCount(board, state.spec);
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
    if (!CUT_SITES.includes(action.cell)) return no('Cut only at the marked ' + state.spec.enzyme + ' sites.');
    if (state.cuts.includes(action.cell)) return no('That bond is already cut.');
    if (state.cuts.length >= 2) return no('No cuts left. Undo or replay.');
    const cuts = [...state.cuts, action.cell];
    const won = CUT_SOLUTION.every(c => cuts.includes(c));
    return yes({ cuts, won }, won ? 'Target fragment isolated.' : cuts.length === 2 ? 'Wrong fragment isolated. Undo and try again.' : 'One cut remaining.');
  }
  return no('Choose an action for this challenge.');
}

/** A graphical hint always points to an actionable tile. Prefer the certified
 * path, then search for a completion of the player's actual prefix. A bounded
 * search keeps long traces responsive; if it cannot finish, backtrack safely. */
export function traceHintCell(state: LabState): number | null {
  if (state.id !== 'trace' || state.won) return null;
  const { TRACE_PATH, TRACE_TARGET } = state.spec;
  const path = state.trace;
  if (path.every((c,i) => c === TRACE_PATH[i])) return TRACE_PATH[path.length] ?? null;
  const used = new Set(path);
  const neighbours = (c: number) => [c-9,c+9,c-1,c+1].filter(n => validCell(n) && adjacent(c,n));
  let budget = 12000;
  const finish = (cell: number, offset: number): boolean => {
    if (offset === TRACE_TARGET.length) return true;
    if (--budget < 0) return false;
    const preferred = TRACE_PATH[offset];
    const next = neighbours(cell).filter(n => !used.has(n) && state.board[n] === TRACE_TARGET[offset]);
    next.sort((a,b) => Number(b===preferred)-Number(a===preferred) || a-b);
    for (const n of next) {
      used.add(n);
      const solved = finish(n,offset+1);
      used.delete(n);
      if (solved) return true;
      if (budget <= 0) break;
    }
    return false;
  };
  const last = path.at(-1)!;
  for (const n of neighbours(last)) {
    if (used.has(n) || state.board[n] !== TRACE_TARGET[path.length]) continue;
    used.add(n);
    const solved = finish(n,path.length+1);
    used.delete(n);
    if (solved) return n;
    if (budget <= 0) break;
  }
  // A single selected base can be deselected by tapping it again.
  return path.at(-2) ?? last;
}

/** A graphical route hint is a legal action for the actual board. Keep the
 * certified corridors available for other pairs, but allow alternate paths
 * when they can reach their endpoint without blocking those corridors. */
export function connectionHint(state: LabState, selected: number | null = null): { pair: number; cell: number } | null {
  if (state.id !== 'connections' || state.won) return null;
  const { CONNECTION_PAIRS: pairs, CONNECTION_ROUTES: certified } = state.spec;
  const incomplete = (i: number) => state.routes[i]!.at(-1) !== pairs[i]!.end;
  // A route that occupies another pair's certified corridor may prevent the
  // remaining puzzle from being solved. Redraw it from its own start.
  const blocker = state.routes.findIndex((path, i) => path.some(c =>
    certified.some((route, j) => j !== i && incomplete(j) && route.includes(c))));
  if (blocker >= 0) return { pair: blocker, cell: pairs[blocker]!.start };
  const pair = selected !== null && pairs[selected] && incomplete(selected)
    ? selected : state.routes.findIndex((_, i) => incomplete(i));
  if (pair < 0) return null;
  const path = state.routes[pair]!, { start, end } = pairs[pair]!;
  if (!path.length) return { pair, cell: start };
  const blocked = new Set(path);
  pairs.forEach((p, i) => {
    if (i !== pair) {
      blocked.add(p.start); blocked.add(p.end);
      state.routes[i]!.forEach(c => blocked.add(c));
      if (incomplete(i)) certified[i]!.forEach(c => blocked.add(c));
    }
  });
  const last = path.at(-1)!;
  const legal = (c: number, from: number) => validCell(c) && adjacent(from,c) && state.board[c] !== '.' && !blocked.has(c);
  // Preserve the original solution when the player is already following it.
  const route = certified[pair]!;
  const next = route[path.length];
  if (path.every((c,i) => c === route[i]) && next !== undefined && legal(next,last)) return { pair, cell: next };
  // Breadth-first search finds a continuation on the current board, avoiding
  // the player's own path and the other pairs' occupied/reserved squares.
  const seen = new Set([last]);
  const queue = [{ cell: last, first: -1 }];
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head]!;
    for (const c of [node.cell-9,node.cell+9,node.cell-1,node.cell+1]) {
      if (!legal(c,node.cell) || seen.has(c)) continue;
      const first = node.first < 0 ? c : node.first;
      if (c === end) return { pair, cell: first };
      seen.add(c); queue.push({ cell: c, first });
    }
  }
  // Backtrack one step at a time; tapping the start can always reset a route.
  return { pair, cell: path.at(-2) ?? start };
}

export function labHint(state: LabState): string {
  const { READ_STARTS, CUT_SOLUTION } = state.spec;
  if (state.won) return 'Complete.';
  switch (state.id) {
    case 'trace': { const c = traceHintCell(state); return c === null ? 'Complete.' : 'Try row ' + (Math.floor(c / 9) + 1) + ', column ' + (c % 9 + 1) + '.'; }
    case 'crush': { const move = findCrushSwap(state); return move ? 'Swap row ' + (Math.floor(move[0] / 9) + 1) + ', column ' + (move[0] % 9 + 1) + ' with row ' + (Math.floor(move[1] / 9) + 1) + ', column ' + (move[1] % 9 + 1) + '.' : 'Undo the last collection or replay.'; }
    case 'assembly': return READ_STARTS.map((start, read) => 'Read ' + (read + 1) + ' → slot ' + (start + 1)).join(' · ');
    case 'mutation': { const c = state.board.findIndex((b, i) => mutationExpected(i, state.spec) !== null && mutationExpected(i, state.spec) !== b); return c < 0 ? 'All correct.' : 'Check row ' + (Math.floor(c / 9) + 1) + ', column ' + (c % 9 + 1) + '.'; }
    case 'connections': { const h = connectionHint(state); return h ? 'Pair ' + (h.pair + 1) + ': try row ' + (Math.floor(h.cell / 9) + 1) + ', column ' + (h.cell % 9 + 1) + '.' : 'Complete.'; }
    case 'restriction': { const c = CUT_SOLUTION.find(x => !state.cuts.includes(x)); return c === undefined ? 'Both target cuts made.' : 'Cut row ' + (Math.floor(c / 9) + 1) + ', column ' + (c % 9 + 1) + ' on the long strand.'; }
  }
}

/** Enumerate actual legal swaps, preferring the certified move when available. */
function crushCandidates(state: LabState): [number, number][] {
  const target = state.spec.CRUSH_TARGETS[state.collected]!;
  const old = new Set(matchingTriples(state.board, target).map(c => c.join(',')));
  const result: [number, number][] = [];
  for (let a = 0; a < 81; a++) for (const b of [a + 1, a + 9]) {
    if (!validCell(b) || !adjacent(a, b) || state.board[a] === '.' || state.board[b] === '.' || state.board[a] === state.board[b]) continue;
    const board = [...state.board]; [board[a], board[b]] = [board[b]!, board[a]!];
    if (matchingTriples(board, target).some(c => (c.includes(a) || c.includes(b)) && !old.has(c.join(',')))) result.push([a,b]);
  }
  const preferred = state.spec.CRUSH_SWAPS[state.collected];
  const rank = ([a,b]: [number,number]) => preferred && a===preferred[0] && b===preferred[1] ? 0 : 1;
  return result.sort((a,b)=>rank(a)-rank(b));
}

/** Hint a real swap that can still complete the remaining codons. Deterministic
 * bounded lookahead avoids highlighting a stale fixture or a known dead end. */
export function findCrushSwap(state: LabState): readonly [number, number] | null {
  if (state.id !== 'crush' || state.won) return null;
  let budget = 400;
  const failed = new Set<string>();
  const solve = (s: LabState): [number,number] | null => {
    if (--budget < 0) return null;
    const key = s.collected + ':' + s.refill + ':' + s.board.join('');
    if (failed.has(key)) return null;
    for (const [a,b] of crushCandidates(s)) {
      const next = applyLab(s,{type:'swap',a,b}).state;
      if (next !== s && (next.won || solve(next))) return [a,b];
      if (budget <= 0) break;
    }
    failed.add(key);
    return null;
  };
  return solve(state);
}

/** Recover the actual coding strand from the solved puzzle, not from the requested target. */
export function labExtractedSequence(state: LabState): string | null {
  if (!state.won) return null;
  const s = state.spec;
  switch (state.id) {
    case 'trace': return labDecode(s,state.trace.map(c => state.board[c]).join(''));
    case 'crush': return state.collectedSeq;
    case 'assembly': return labDecode(s,s.ASSEMBLY_CELLS.map(c => state.board[c]).join(''));
    case 'mutation': return labDecode(s,s.MUTATION_ROWS.map(r => [...r.seq].map((_, i) => labComplement(s,state.board[r.bottom+i]!)).join('')).join(''));
    case 'connections': return labDecode(s,s.CONNECTION_PAIRS.map((p, i) => state.routes[i]!.at(-1) === p.end ? state.board[p.start] : '').join(''));
    case 'restriction': {
      const strand = s.CUT_STRANDS[0]!;
      const offsets = state.cuts.map(c => strand.indexOf(c)).sort((a,b) => a-b);
      if (offsets.length !== 2 || offsets[0]! < 0) return null;
      return labDecode(s,strand.slice(offsets[0]!+1, offsets[1]!+1).map(c => state.board[c]).join(''));
    }
  }
}
