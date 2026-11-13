import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { sha256Hex } from '../../src/genomics/sha256.ts';
import { GENES } from '../../src/genomics/genes.ts';

const ref = (s: string) => createHash('sha256').update(s).digest('hex');

describe('sha256Hex (synchronous, offline)', () => {
  it('matches node:crypto on edge-length inputs', () => {
    for (const n of [0, 1, 3, 55, 56, 63, 64, 65, 119, 120, 128, 1000]) {
      const s = 'ACGT'.repeat(300).slice(0, n);
      expect(sha256Hex(s)).toBe(ref(s));
    }
  });
  it('reproduces every pinned gene checksum', () => {
    for (const g of Object.values(GENES)) expect(sha256Hex(g.sequence)).toBe(g.sequenceSha256);
  });
});
