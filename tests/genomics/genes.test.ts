import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { GENES, GENE_ORDER, HBB, INS, type GeneAsset } from '../../src/genomics/genes.ts';
import { alignedComplement, complementBase, reverseComplement } from '../../src/genomics/dna.ts';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const CODE = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';
const translate = (s: string) => s.match(/.{3}/g)!.map((c) => CODE['TCAG'.indexOf(c[0]!) * 16 + 'TCAG'.indexOf(c[1]!) * 4 + 'TCAG'.indexOf(c[2]!)]).join('');

const EXPECT: Record<string, { transcript: string; geneId: string; length: number; protein: string; aa: number; cds: [number, number]; sha: string }> = {
  INS: { transcript: 'NM_000207.3', geneId: 'NCBIGene:3630', length: 333, protein: 'NP_000198.1', aa: 110, cds: [60, 392], sha: 'fca80cdee67f516fd2bf95d38ae2e4c068ddbaaec246ec2e2aecebe85c7c2b42' },
  HBB: { transcript: 'NM_000518.5', geneId: 'NCBIGene:3043', length: 444, protein: 'NP_000509.1', aa: 147, cds: [51, 494], sha: '838ee6276e734b829a5ca342989eb04464173f44da33ca3a5eb3267ad66a495e' },
};

describe.each(GENE_ORDER.map((s) => [s, GENES[s]!] as [string, GeneAsset]))('verified %s CDS asset', (symbol, g) => {
  const x = EXPECT[symbol]!;
  it('is the pinned versioned transcript with provenance', () => {
    expect(g.symbol).toBe(symbol);
    expect(g.transcript).toBe(x.transcript);
    expect(g.geneId).toBe(x.geneId);
    expect(g.protein).toBe(x.protein);
    expect(g.chromosome).toBe('11');
    expect(g.sourceUrl).toBe(`https://www.ncbi.nlm.nih.gov/nuccore/${x.transcript}`);
    expect(g.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(g.cdsLocation).toBe(`${x.cds[0]}..${x.cds[1]}`);
    expect(g.functionSummary.length).toBeGreaterThan(40);
    expect(g.functionSummaryCredit).toMatch(/RefSeq/);
  });
  it('has the expected length, frame, start and single terminal stop', () => {
    expect(g.cdsLength).toBe(x.length);
    expect(g.sequence).toHaveLength(x.length);
    expect(g.sequence.length % 3).toBe(0);
    expect(g.sequence).toMatch(/^[ACGT]+$/);
    const protein = translate(g.sequence);
    expect(protein.startsWith('M')).toBe(true);
    expect(protein.endsWith('*')).toBe(true);
    expect(protein.slice(0, -1)).not.toContain('*');
    expect(protein.length - 1).toBe(x.aa);
    expect(g.proteinLength).toBe(x.aa);
    expect(g.translationVerified).toBe(true);
  });
  it('checksum matches the pinned value', () => {
    expect(sha(g.sequence)).toBe(g.sequenceSha256);
    expect(g.sequenceSha256).toBe(x.sha);
  });
  it('matches the CDS feature and /translation of the locally stored raw GenBank record', () => {
    const raw = readFileSync(`data/raw/${x.transcript}.gb`, 'utf8');
    expect(sha(raw)).toBe(g.rawRecordSha256);
    const prov = JSON.parse(readFileSync(`data/raw/${x.transcript}.provenance.json`, 'utf8')) as { rawSha256: string };
    expect(prov.rawSha256).toBe(g.rawRecordSha256);
    const origin = raw.slice(raw.indexOf('\nORIGIN') + 7).replace(/[^acgt]/gi, '').toUpperCase();
    expect(origin.slice(x.cds[0] - 1, x.cds[1])).toBe(g.sequence);
    const translation = /\/translation="([^"]+)"/.exec(raw)![1]!.replace(/\s/g, '');
    expect(translate(g.sequence).slice(0, -1)).toBe(translation);
  });
});

describe('gene set', () => {
  it('has distinct datasets', () => {
    expect(INS.datasetId).not.toBe(HBB.datasetId);
    expect(INS.sequence).not.toBe(HBB.sequence);
  });
});

describe('DNA helpers', () => {
  it('complements bases A–T and C–G', () => {
    expect(complementBase('A')).toBe('T');
    expect(complementBase('T')).toBe('A');
    expect(complementBase('C')).toBe('G');
    expect(complementBase('G')).toBe('C');
  });
  it('aligned complement keeps position; reverse complement reverses it', () => {
    expect(alignedComplement('ATGC')).toBe('TACG');
    expect(reverseComplement('ATGC')).toBe('GCAT');
    expect(alignedComplement(alignedComplement(INS.sequence))).toBe(INS.sequence);
    expect(reverseComplement(HBB.sequence).split('').reverse().join('')).toBe(alignedComplement(HBB.sequence));
  });
});
