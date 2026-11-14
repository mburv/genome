import { describe, expect, it } from 'vitest';
import { LAB_LEVELS, LEVELS, chapterOf } from '../../src/campaign/campaign.ts';
import { playHeading } from '../../src/ui/playHeading.ts';

describe('playHeading', () => {
  it('uses the gene symbol, sample index and RefSeq locus from the manifest', () => {
    expect(playHeading(LEVELS[0]!)).toEqual({ title: 'INS · 1/6', locus: 'CHROMOSOME 11 · NM_000207.3' });
    expect(playHeading(LEVELS[5]!)).toEqual({ title: 'INS · 6/6', locus: 'CHROMOSOME 11 · NM_000207.3' });
    expect(playHeading(LEVELS[6]!)).toEqual({ title: 'HBB · 1/6', locus: 'CHROMOSOME 11 · NM_000518.5' });
  });

  it('uses chapter part/of and the lab power name', () => {
    const last = chapterOf('INS').at(-1)!;
    expect(playHeading(last).title).toBe(`INS · ${last.chapter!.part}/${last.chapter!.of}`);
    expect(playHeading(last).locus).toBe('CHROMOSOME 11 · NM_000207.3');
    expect(playHeading(LAB_LEVELS[0]!)).toEqual({ title: 'CRISPR · practice', locus: 'CHROMOSOME 11 · NM_000518.5' });
  });
});
