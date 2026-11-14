import { describe, expect, it } from 'vitest';
import { LAB_LEVELS, chapterOf } from '../../src/campaign/campaign.ts';
import { playHeading } from '../../src/ui/playHeading.ts';

describe('playHeading', () => {
  it('keeps the gene symbol as the title and puts the chapter fraction plus official name on the small line', () => {
    const ins = chapterOf('INS');
    expect(playHeading(ins[0]!)).toEqual({
      title: 'INS', progress: '1/8', fullName: 'INSULIN', locus: 'CHROMOSOME 11 · NM_000207.3',
    });
    expect(playHeading(ins.at(-1)!)).toEqual({
      title: 'INS', progress: `${ins.at(-1)!.chapter!.part}/${ins.at(-1)!.chapter!.of}`, fullName: 'INSULIN', locus: 'CHROMOSOME 11 · NM_000207.3',
    });
    const hbb = chapterOf('HBB')[0]!;
    expect(playHeading(hbb)).toEqual({
      title: 'HBB', progress: `1/${hbb.chapter!.of}`, fullName: 'HEMOGLOBIN SUBUNIT BETA', locus: 'CHROMOSOME 11 · NM_000518.5',
    });
  });

  it('uses the lab power name, with the official full name', () => {
    expect(playHeading(LAB_LEVELS[0]!)).toEqual({
      title: 'CRISPR', progress: 'PRACTICE', fullName: 'HEMOGLOBIN SUBUNIT BETA', locus: 'CHROMOSOME 11 · NM_000518.5',
    });
  });
});
