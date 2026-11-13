import type { Base } from '../engine/types.ts';

const PAIR: Record<Base, Base> = { A: 'T', T: 'A', C: 'G', G: 'C' };

/** Watson–Crick partner: A–T, C–G. */
export const complementBase = (b: Base): Base => PAIR[b];

/**
 * Aligned complement: position i pairs with position i, so `5′ ATG 3′` gives `3′ TAC 5′`
 * (read in the same visual direction). This is NOT the reverse complement.
 */
export const alignedComplement = (seq: string): string =>
  seq.split('').map((b) => PAIR[b as Base] ?? '?').join('');

/** The complementary strand written in its own 5′→3′ orientation (the reverse complement). */
export const reverseComplement = (seq: string): string => alignedComplement(seq).split('').reverse().join('');
