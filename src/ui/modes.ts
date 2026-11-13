import type { LevelMode } from '../engine/types.ts';

export const MODE_LABEL: Record<LevelMode, string> = { sequence: 'Sequencing', splice: 'Splicing', replicate: 'Replication', repair: 'Repair' };
export const MODE_GLYPH: Record<LevelMode, string> = { sequence: '≡', splice: '✂', replicate: '⇅', repair: '✚' };
export const MODE_BLURB: Record<LevelMode, string> = {
  sequence: 'Match the outlined strand.',
  splice: 'Match every numbered piece; they join in order 1 → 2 → 3 when all are right.',
  replicate: 'Match the template strand and its complement beside it (A pairs with T, C with G).',
  repair: 'Match the bases on both sides of the marked gap — the missing base is restored when you win.',
};
export const MODE_WIN: Record<LevelMode, string> = { sequence: 'Fragment sequenced', splice: 'Pieces spliced', replicate: 'Strand replicated', repair: 'Gap repaired' };
