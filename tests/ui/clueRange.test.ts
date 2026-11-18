import { describe, expect, it } from 'vitest';
import { CAMPAIGN_LEVELS } from '../../src/campaign/campaign.ts';
import { formatGeneClueRange } from '../../src/ui/clueRange.ts';

describe('Famous Genes clue metadata', () => {
  it('formats the GPX1 example consistently in every mechanic', () => {
    expect(formatGeneClueRange('GPX1', 126, 162, 6))
      .toBe('GPX1 CDS 127–162 · 36 bp · 6-base blocks');
  });

  it('includes length but not a block-size label for single-base intro levels', () => {
    expect(formatGeneClueRange('INS', 0, 9))
      .toBe('INS CDS 1–9 · 9 bp');
  });

  it('renders the source interval and token tier for every Famous Genes level', () => {
    expect(CAMPAIGN_LEVELS.length).toBeGreaterThan(100);
    for (const level of CAMPAIGN_LEVELS) {
      const start = level.sourceIntervals[0]!.start;
      const end = level.sourceIntervals.at(-1)!.end;
      const blockSize = level.tokens ? level.tier : undefined;
      const expected = `${level.symbol} CDS ${start + 1}–${end} · ${end - start} bp${blockSize ? ` · ${blockSize}-base blocks` : ''}`;
      expect(formatGeneClueRange(level.symbol, start, end, blockSize), level.id).toBe(expected);
    }
  });
});
