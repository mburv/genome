/**
 * M4 multi-base tokens. A board stays an 81-character string: each character is a *symbol*. On
 * single-base levels the symbol is the base itself (A/C/G/T). On token levels each symbol maps to an
 * exact DNA sequence through `def.tokens` (one symbol per distinct sequence, so symbol equality is
 * sequence equality — the arbitrary label never matters). CRISPR edits on a long token may create a
 * sequence that is not in the level's table; such sequences get a per-attempt "custom" symbol (stored
 * in the snapshot, undoable). An edited sequence that equals an existing token reuses that token's
 * symbol, so goal equality is always by sequence.
 */
import type { Interval, LevelDefinition } from './types.ts';

export interface TokenDef {
  /** Exact DNA sequence carried by the tile (5′→3′ in reading direction; complement tokens are aligned complements). */
  seq: string;
  /** 'target' pieces spell the reference (or its aligned complement); 'decoy' pieces are real CDS slices from elsewhere in the same gene. */
  kind: 'target' | 'decoy';
  /** Short label shown on long tiles (equal sequences always share a label). */
  label: string;
  /** CDS interval the sequence was taken from (provenance), for decoys and coding targets. */
  source?: Interval;
  strand?: 'coding' | 'complement';
}

/** Custom sequences created by CRISPR edits on token levels: symbol → sequence. */
export type CustomTokens = Record<string, string>;

export const TOKEN_SYMBOL_BASE = 0x100;
export const MAX_LEVEL_TOKENS = 0x200;
export const CUSTOM_SYMBOL_BASE = 0x500;
export const MAX_CUSTOM_TOKENS = 0x100;

export const tokenSymbol = (i: number): string => String.fromCharCode(TOKEN_SYMBOL_BASE + i);
export const customSymbol = (i: number): string => String.fromCharCode(CUSTOM_SYMBOL_BASE + i);
export const isCustomSymbol = (s: string): boolean => {
  const c = s.charCodeAt(0);
  return s.length === 1 && c >= CUSTOM_SYMBOL_BASE && c < CUSTOM_SYMBOL_BASE + MAX_CUSTOM_TOKENS;
};

export const hasTokens = (def: Pick<LevelDefinition, 'tokens'>): boolean => def.tokens !== undefined;

/** The DNA carried by a symbol ('' for a hole or an unknown symbol). */
export function symbolSequence(def: Pick<LevelDefinition, 'tokens'>, custom: CustomTokens | undefined, symbol: string): string {
  if (symbol === '.') return '';
  if (!def.tokens) return 'ACGT'.includes(symbol) ? symbol : '';
  return def.tokens[symbol]?.seq ?? custom?.[symbol] ?? '';
}

/** Concatenated DNA of a list of cells on a board. */
export function cellsSequence(def: Pick<LevelDefinition, 'tokens'>, custom: CustomTokens | undefined, board: string, cells: readonly number[]): string {
  return cells.map((c) => symbolSequence(def, custom, board[c]!)).join('');
}

/**
 * Symbol for a sequence: the level's own token if one carries exactly this sequence, else an existing
 * custom symbol, else a newly allocated custom symbol. Returns the (possibly extended) custom table.
 */
export function symbolFor(def: Pick<LevelDefinition, 'tokens'>, custom: CustomTokens, seq: string): { symbol: string; custom: CustomTokens } | null {
  if (!def.tokens) return seq.length === 1 && 'ACGT'.includes(seq) ? { symbol: seq, custom } : null;
  for (const [sym, t] of Object.entries(def.tokens)) if (t.seq === seq) return { symbol: sym, custom };
  for (const [sym, s] of Object.entries(custom)) if (s === seq) return { symbol: sym, custom };
  const n = Object.keys(custom).length;
  if (n >= MAX_CUSTOM_TOKENS) return null;
  const symbol = customSymbol(n);
  return { symbol, custom: { ...custom, [symbol]: seq } };
}

/**
 * Display label for a sequence: ≤ 6 bases are shown in full (the tile wraps them in rows of three);
 * longer pieces show their first and last codon ("ATG…GCC"). Collisions between different sequences
 * in one level get a numeric suffix at generation time.
 */
export const defaultLabel = (seq: string): string => (seq.length <= 6 ? seq : `${seq.slice(0, 3)}…${seq.slice(-3)}`);

/** Label for a symbol on this board (custom/edited pieces get a ✎ prefix). */
export function symbolLabel(def: Pick<LevelDefinition, 'tokens'>, custom: CustomTokens | undefined, symbol: string): string {
  if (!def.tokens) return symbol;
  const t = def.tokens[symbol];
  if (t) return t.label;
  const s = custom?.[symbol];
  return s ? `✎${defaultLabel(s)}` : '?';
}
