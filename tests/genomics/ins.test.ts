import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { INS } from '../../src/genomics/ins.ts';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const CODE = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';
const translate = (s: string) => s.match(/.{3}/g)!.map((c) => CODE['TCAG'.indexOf(c[0]!) * 16 + 'TCAG'.indexOf(c[1]!) * 4 + 'TCAG'.indexOf(c[2]!)]).join('');

describe('verified INS CDS asset (NM_000207.3)', () => {
  it('is the pinned versioned transcript with provenance', () => {
    expect(INS.transcript).toBe('NM_000207.3');
    expect(INS.geneId).toBe('NCBIGene:3630');
    expect(INS.sourceUrl).toBe('https://www.ncbi.nlm.nih.gov/nuccore/NM_000207.3');
    expect(INS.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
  it('has the expected length, ACGT alphabet, start and single terminal stop', () => {
    expect(INS.cdsLength).toBe(333);
    expect(INS.sequence).toHaveLength(333);
    expect(INS.sequence).toMatch(/^[ACGT]+$/);
    const protein = translate(INS.sequence);
    expect(protein.startsWith('M')).toBe(true);
    expect(protein.endsWith('*')).toBe(true);
    expect(protein.slice(0, -1)).not.toContain('*');
  });
  it('checksum matches', () => {
    expect(sha(INS.sequence)).toBe(INS.sequenceSha256);
  });
  it('matches the CDS feature of the locally stored raw GenBank record', () => {
    const raw = readFileSync('data/raw/NM_000207.3.gb', 'utf8');
    expect(sha(raw)).toBe(INS.rawRecordSha256);
    const origin = raw.slice(raw.indexOf('\nORIGIN') + 7).replace(/[^acgt]/gi, '').toUpperCase();
    expect(origin.slice(59, 392)).toBe(INS.sequence);
    const translation = /\/translation="([^"]+)"/.exec(raw)![1]!.replace(/\s/g, '');
    expect(translate(INS.sequence).slice(0, -1)).toBe(translation);
  });
});
