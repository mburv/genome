import { describe, expect, it } from 'vitest';
import { LAB_LEVELS, LEVELS, chapterOf } from '../../src/campaign/campaign.ts';
import { playHeading } from '../../src/ui/playHeading.ts';

describe('playHeading', () => {
  it('keeps the gene symbol as the title and puts the fraction plus official name on the small line', () => {
    expect(playHeading(LEVELS[0]!)).toEqual({
      title: 'INS', progress: '1/6', fullName: 'INSULIN', locus: 'CHROMOSOME 11 · NM_000207.3',
    });
    expect(playHeading(LEVELS[5]!)).toEqual({
      title: 'INS', progress: '6/6', fullName: 'INSULIN', locus: 'CHROMOSOME 11 · NM_000207.3',
    });
    expect(playHeading(LEVELS[6]!)).toEqual({
      title: 'HBB', progress: '1/6', fullName: 'HEMOGLOBIN SUBUNIT BETA', locus: 'CHROMOSOME 11 · NM_000518.5',
    });
  });

  it('uses chapter part/of and the lab power name, with the official full name', () => {
    const last = chapterOf('INS').at(-1)!;
    expect(playHeading(last)).toEqual({
      title: 'INS', progress: `${last.chapter!.part}/${last.chapter!.of}`, fullName: 'INSULIN', locus: 'CHROMOSOME 11 · NM_000207.3',
    });
    expect(playHeading(LAB_LEVELS[0]!)).toEqual({
      title: 'CRISPR', progress: 'PRACTICE', fullName: 'HEMOGLOBIN SUBUNIT BETA', locus: 'CHROMOSOME 11 · NM_000518.5',
    });
  });
});
