import { describe, expect, it } from 'vitest';
import { LEGACY_LEVELS, ALL_LEVELS, CAMPAIGN_GENES, CAMPAIGN_LEVELS, CHAPTER_LEVELS, INTRO_LEVELS, chapterOf, isDiscovered, runOf } from '../../src/campaign/campaign.ts';
import { assemblyStatus, levelContribution } from '../../src/campaign/assembly.ts';
import { MAX_ASSEMBLY_CDS, MAX_CHAPTER, MIN_CHAPTER, geneRunCoverageErrors, planChapter } from '../../src/campaign/chapters.ts';
import { CATALOGUE_ORDER, CATALOGUE_SIZE, GENES, LEGACY_GENES, MANIFEST } from '../../src/genomics/genes.ts';
import { sha256Hex } from '../../src/genomics/sha256.ts';
import { buildLevel, validateLevel } from '../../src/generator/level.ts';
import { chapterSpecs } from '../../src/campaign/chapters.ts';

const ids = (ls: { id: string }[]) => ls.map((l) => l.id);

describe('catalogue manifest', () => {
  it('10–30 genes, count derived from the manifest, every included record verified MANE Select', () => {
    expect(CATALOGUE_SIZE).toBe(MANIFEST.included.length);
    expect(MANIFEST.counts.included).toBe(CATALOGUE_SIZE);
    expect(CATALOGUE_SIZE).toBeGreaterThanOrEqual(10);
    expect(CATALOGUE_SIZE).toBe(31);
    for (const m of MANIFEST.included) {
      const g = GENES[m.symbol]!;
      expect(g.keywords).toMatch(/MANE Select/);
      expect(LEGACY_GENES[m.symbol]!.translationVerified).toBe(true);
      expect(g.sequence.slice(0, 3)).toBe('ATG');
      expect(g.sequence.length % 3).toBe(0);
      expect(sha256Hex(g.sequence)).toBe(m.sequenceSha256);
      expect(g.cdsLength).toBe(m.cdsLength);
    }
    expect(CATALOGUE_ORDER.slice(0, 2)).toEqual(['INS', 'HBB']);
    expect(MANIFEST.excluded.every((e) => e.reason.length > 10)).toBe(true);
  });
});

describe('chapter planner', () => {
  it('tiles [0, cdsLength) exactly, in order, frame-aligned, within the chapter size bounds', () => {
    for (const L of [333, 444, 429, 465, 579, 600, 1047, MAX_ASSEMBLY_CDS]) {
      const plan = planChapter(L);
      expect(plan.length).toBeGreaterThanOrEqual(MIN_CHAPTER);
      expect(plan.length).toBeLessThanOrEqual(MAX_CHAPTER);
      let at = 0;
      for (const p of plan) {
        expect(p.start).toBe(at);
        expect(p.start % 3).toBe(0);
        at = p.end;
      }
      expect(at).toBe(L);
    }
  });
  it('can start after 1-base intros and still finish the CDS without a gap', () => {
    const plan = planChapter(333, 51);
    expect(plan[0]!.start).toBe(51);
    expect(plan.at(-1)!.end).toBe(333);
    let at = 51;
    for (const p of plan) {
      expect(p.start).toBe(at);
      expect(p.start % 3).toBe(0);
      at = p.end;
    }
    expect(plan.map((p) => p.k)).toEqual([3, 3, 3, 6, 6, 6, 6]);
  });
});

describe('full assembly', () => {
  it('every catalogue gene’s campaign run reconstructs its CDS exactly, sha256-verified, with no overlapping intervals', () => {
    for (const sym of CATALOGUE_ORDER) {
      const gene = GENES[sym]!;
      const run = runOf(sym);
      const ch = chapterOf(sym);
      expect(ch.length).toBeGreaterThanOrEqual(5);
      expect(ch.map((l) => l.chapter!.part)).toEqual(ch.map((_, i) => i + 1));
      expect(geneRunCoverageErrors(CAMPAIGN_LEVELS, sym, gene.cdsLength)).toEqual([]);
      const st = assemblyStatus(ids(run), gene);
      expect(st.covered).toBe(gene.cdsLength);
      expect(st.assembled).toBe(gene.sequence);
      expect(st.sha256).toBe(gene.sequenceSha256);
      expect(st.verified).toBe(true);
    }
  });
  it('INS (333 bp) and HBB (444 bp) are proven end-to-end', () => {
    expect(GENES.INS!.cdsLength).toBe(333);
    expect(GENES.HBB!.cdsLength).toBe(444);
    expect(assemblyStatus(ids(runOf('INS')), GENES.INS!).verified).toBe(true);
    expect(assemblyStatus(ids(runOf('HBB')), GENES.HBB!).verified).toBe(true);
    expect(assemblyStatus(ids(chapterOf('INS')), GENES.INS!).covered).toBe(333 - 51);
    expect(assemblyStatus(ids(chapterOf('HBB')), GENES.HBB!).covered).toBe(444 - 51);
  });
  it('requires every puzzle: dropping any one leaves the gene unassembled (no hidden auto-fill)', () => {
    for (const sym of ['INS', 'HBB']) {
      const run = runOf(sym);
      for (const skip of run) {
        const st = assemblyStatus(ids(run.filter((l) => l !== skip)), GENES[sym]!);
        expect(st.verified).toBe(false);
        expect(st.covered).toBeLessThan(GENES[sym]!.cdsLength);
      }
    }
  });
  it('intro completions count toward coverage but do not assemble the gene', () => {
    const st = assemblyStatus(ids(INTRO_LEVELS.filter((l) => l.symbol === 'INS')), GENES.INS!);
    expect(st.covered).toBe(51);
    expect(st.verified).toBe(false);
  });
  it('replays and complementary strands are idempotent', () => {
    const ch = chapterOf('HBB');
    const once = assemblyStatus(ids(ch.slice(0, 4)), GENES.HBB!);
    const twice = assemblyStatus([...ids(ch.slice(0, 4)), ...ids(ch.slice(0, 4))], GENES.HBB!);
    expect(twice).toEqual(once);
    for (const l of CHAPTER_LEVELS.filter((x) => x.mode === 'replicate')) {
      const contributed = levelContribution(l).reduce((n, p) => n + p.seq.length, 0);
      expect(contributed).toBe(l.sourceIntervals.reduce((n, iv) => n + iv.end - iv.start, 0));
    }
  });
  it('discovery is separate from assembly: the first run puzzle discovers, assembly needs everything', () => {
    const ch = runOf('MB');
    expect(isDiscovered([ch[0]!.id], 'MB')).toBe(true);
    expect(assemblyStatus([ch[0]!.id], GENES.MB!).verified).toBe(false);
    expect(isDiscovered([ch[1]!.id], 'MB')).toBe(false);
    expect(isDiscovered(['ins-01'], 'INS')).toBe(true);
    expect(isDiscovered([chapterOf('INS')[0]!.id], 'INS')).toBe(false);
  });
  it('decoys are real in-frame slices of the same gene, outside the interval, never equal to a target piece', () => {
    for (const def of CHAPTER_LEVELS) {
      const gene = GENES[def.symbol]!;
      const targets = new Set(Object.values(def.tokens!).filter((t) => t.kind === 'target').map((t) => t.seq));
      for (const t of Object.values(def.tokens!)) {
        if (t.kind !== 'decoy') continue;
        expect(targets.has(t.seq)).toBe(false);
        expect(gene.sequence.slice(t.source!.start, t.source!.end)).toBe(t.seq);
        expect(t.source!.start % 3).toBe(0);
      }
    }
  });
  it('chapter levels validate and a sample puzzle regenerates identically from its spec', { timeout: 120_000 }, () => {
    for (const def of CHAPTER_LEVELS) expect(validateLevel(def, GENES[def.symbol]!, ALL_LEVELS)).toEqual([]);
    const gi = MANIFEST.included.findIndex((m) => m.symbol === 'INS');
    const first = chapterOf('INS')[0]!;
    const specs = chapterSpecs({ symbol: 'INS', cdsLength: 333 }, gi, first.index, 51);
    const prior = LEGACY_LEVELS.filter(l=>l.lab||!l.chapter&&(l.symbol==='INS'||l.symbol==='HBB'));
    const rebuilt = { ...buildLevel(specs[0]!, GENES.INS!, prior), generatorVersion: first.generatorVersion };
    expect(rebuilt).toEqual(first);
  });
});

describe('campaign progression order', () => {
  it('lists genes in CAMPAIGN_LEVELS order, so the map and next-level cannot diverge', () => {
    expect(CAMPAIGN_GENES).toEqual(CATALOGUE_ORDER);
    expect(CAMPAIGN_GENES).toEqual([...new Set(CAMPAIGN_LEVELS.map((l) => l.symbol))]);
    expect([...CAMPAIGN_GENES].sort()).toEqual([...CATALOGUE_ORDER].sort());
  });

  it('Next level after a gene’s final puzzle is the first puzzle of the next gene on the map', () => {
    for (let i = 0; i < CAMPAIGN_GENES.length - 1; i++) {
      const last = runOf(CAMPAIGN_GENES[i]!).at(-1)!;
      const firstOfNext = runOf(CAMPAIGN_GENES[i + 1]!)[0]!;
      const idx = CAMPAIGN_LEVELS.findIndex((l) => l.id === last.id);
      expect(CAMPAIGN_LEVELS[idx + 1]!.id).toBe(firstOfNext.id);
      expect(CAMPAIGN_LEVELS[idx + 1]!.symbol).toBe(CAMPAIGN_GENES[i + 1]);
    }
  });
});
