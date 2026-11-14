import { describe, expect, it } from 'vitest';
import { INTRO_LEVELS, LAB_LEVELS, chapterOf, introOf } from '../../src/campaign/campaign.ts';
import { playHeading } from '../../src/ui/playHeading.ts';

describe('playHeading', () => {
  it('uses the gene-run fraction (intros then chapters) plus the official name on the small line', () => {
    const opening = introOf('INS')[0]!;
    expect(playHeading(opening)).toEqual({
      title: 'INS', progress: '1/14', fullName: 'INSULIN', locus: 'CHROMOSOME 11 · NM_000207.3',
    });
    const ins = chapterOf('INS');
    expect(playHeading(ins[0]!)).toEqual({
      title: 'INS', progress: '7/14', fullName: 'INSULIN', locus: 'CHROMOSOME 11 · NM_000207.3',
    });
    expect(playHeading(ins.at(-1)!)).toEqual({
      title: 'INS', progress: '14/14', fullName: 'INSULIN', locus: 'CHROMOSOME 11 · NM_000207.3',
    });
    expect(playHeading(chapterOf('HBB')[0]!)).toEqual({
      title: 'HBB', progress: '7/15', fullName: 'HEMOGLOBIN SUBUNIT BETA', locus: 'CHROMOSOME 11 · NM_000518.5',
    });
    expect(INTRO_LEVELS[0]!.id).toBe('ins-01');
  });

  it('uses the lab power name, with the official full name', () => {
    expect(playHeading(LAB_LEVELS[0]!)).toEqual({
      title: 'CRISPR', progress: 'PRACTICE', fullName: 'HEMOGLOBIN SUBUNIT BETA', locus: 'CHROMOSOME 11 · NM_000518.5',
    });
  });
});
