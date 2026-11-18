import { describe, expect, it } from 'vitest';
import { addGenomeCredit, type GenomeHeader } from '../../src/campaign/bonus.ts';
import {
  bonusClueRange, cdsComplete, cdsCovered, cdsGeneLevelCoverage, cdsGeneLevels,
  cdsLength, cdsLocus, nextCdsGeneLevel, newlyCompletedCds, validateCdsIndex,
  CDS_ANNOTATION_SHA256, type CdsIndex, type CdsGene,
} from '../../src/genomics/bonusAnnotations.ts';

const index: CdsIndex = {
  format: 'GENOME-CDS-1',
  reference: 'T2T-CHM13v2.0+Y / GCA_009914755.4',
  annotationSha256: 'annotation-123', chromosome: 'chr1',
  genes: [
    ['forward', 'FWD', 'protein_coding', 100, 220, '+', 'NM_forward',
      [[100, 120], [200, 220]]],
    ['reverse', 'REV', 'protein_coding', 300, 430, '-', 'NM_reverse',
      [[400, 430], [300, 330]]],
    ['overlap', 'OVER', 'protein_coding', 205, 220, '+', 'NM_overlap',
      [[205, 220]]],
  ],
};

describe('T2T CDS labeling', () => {
  it('uses one-based spliced CDS offsets for the forward strand', () => {
    expect(bonusClueRange('chr1', [102, 111], undefined, index))
      .toBe('FWD CDS 3–11 · 9 bp');
    expect(bonusClueRange('chr1', [210, 219], 1, { ...index, genes: [index.genes[0]!] }))
      .toBe('FWD CDS 31–39 · 9 bp · 1-base blocks');
  });

  it('uses coding orientation and marks reverse strand distinctly', () => {
    expect(bonusClueRange('chr1', [420, 429], 3, index))
      .toBe('REV CDS 2–10 (− strand) · 9 bp · 3-base blocks');
    expect(bonusClueRange('chr1', [310, 319], 3, index))
      .toBe('REV CDS 42–50 (− strand) · 9 bp · 3-base blocks');
  });

  it('falls back to genome coordinates for introns, mixed exons and ambiguous CDSs', () => {
    expect(cdsLocus(index, 'chr1', [110, 210])).toBeNull();
    expect(cdsLocus(index, 'chr1', [209, 218])).toBeNull(); // overlapping genes
    expect(bonusClueRange('chr1', [1000, 1864], 96, index))
      .toBe('chr1:1,001–1,864 · 864 bp · 96-base blocks');
    expect(bonusClueRange('chr1', [110, 210], 10, index))
      .toBe('chr1:111–210 · 100 bp · 10-base blocks');
    expect(bonusClueRange('chr2', [100, 109], 3, index))
      .toBe('chr2:101–109 · 9 bp · 3-base blocks');
  });

  it('counts only annotated coding exons and emits a card exactly when the final CDS segment is covered', () => {
    const gene = index.genes[0]!;
    const before = { chr1: [[100, 120]] as [number, number][] };
    const after = addGenomeCredit(before, 'chr1', [200, 220]);
    expect(cdsLength(gene)).toBe(40);
    expect(cdsCovered(gene, before, 'chr1')).toBe(20);
    expect(cdsComplete(gene, before, 'chr1')).toBe(false);
    expect(cdsComplete(gene, after, 'chr1')).toBe(true);
    expect(newlyCompletedCds(index, before, after, 'chr1', [200, 220])).toEqual([gene, index.genes[2]!]); // one puzzle can finish two overlapping genes
    expect(newlyCompletedCds(index, after, after, 'chr1', [200, 220])).toEqual([]);
    expect(newlyCompletedCds(index, before, after, 'chr2', [200, 220])).toEqual([]);
  });

  it('accepts only the pinned CDS annotation before DNA packs are downloaded', () => {
    const independent={...index, annotationSha256:CDS_ANNOTATION_SHA256};
    expect(validateCdsIndex(independent,'chr1')).toEqual(independent);
    expect(validateCdsIndex(index,'chr1')).toBeNull();
    expect(validateCdsIndex(independent,'chr2')).toBeNull();
  });

  it('groups coding exons under existing chromosome puzzle numbers, respecting transcript strand', () => {
    const forward:CdsGene=['gene','LONG','protein_coding',900,1940,'+','NM_TEST',[[900,960],[1900,1940]],'A long coding gene'];
    const reverse:CdsGene=['gene','LONG','protein_coding',900,1940,'-','NM_TEST',[[1900,1940],[900,960]],'A long coding gene'];
    expect(cdsGeneLevels(forward,248387328)).toEqual([4,5,6]);
    expect(cdsGeneLevels(reverse,248387328)).toEqual([6,5,4]);
    expect(nextCdsGeneLevel(reverse,{},'chr1')).toBe(6);
    const part=addGenomeCredit({},'chr1',[1900,1940]);
    expect(nextCdsGeneLevel(reverse,part,'chr1')).toBe(4);
    const earlier=addGenomeCredit(part,'chr1',[900,960]);
    expect(nextCdsGeneLevel(reverse,earlier,'chr1')).toBeNull();
    expect(cdsGeneLevelCoverage(forward,{chr1:[[900,920]]},'chr1',248387328,4))
      .toEqual({covered:20,total:54});
  });

  it('rejects annotations not tied to the exact downloaded pack and reference', () => {
    const header = { chromosome: 'chr1', length: 2000, annotationSha256: 'annotation-123' } as GenomeHeader;
    expect(validateCdsIndex(index, header)).toEqual(index);
    expect(validateCdsIndex({ ...index, annotationSha256: 'mismatch' }, header)).toBeNull();
    expect(validateCdsIndex({ ...index, chromosome: 'chr2' }, header)).toBeNull();
    expect(validateCdsIndex({ ...index, genes: [['bad']] }, header)).toBeNull();
  });
});
