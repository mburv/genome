import { describe, expect, it } from 'vitest';
import { buildCampaign, buildLevel, validateLevel, rateLevel, pruneCertificate, pruneSlides, tryCandidate, GENERATOR_VERSION, type LevelSpec } from '../../src/generator/level.ts';
import { canonicalMask, isConnected, isSelfSymmetric, maskMetrics, symmetricDistance, tidyMask, transformMask, TRANSFORMS } from '../../src/generator/mask.ts';
import { createRng } from '../../src/generator/rng.ts';
import { solveBounded } from '../../src/generator/solver.ts';
import { M2_SPECS, CAMPAIGN_ID } from '../../src/campaign/specs.ts';
import { LEVEL_PACK, LEVELS, coveredBases, isDiscovered, levelsForGene, sampleBases } from '../../src/campaign/campaign.ts';
import { GENES, HBB, INS } from '../../src/genomics/genes.ts';
import { alignedComplement } from '../../src/genomics/dna.ts';
import { applyMove, applySlide, segmentCells } from '../../src/engine/grid.ts';
import { isSolved } from '../../src/engine/engine.ts';
import type { LevelDefinition } from '../../src/engine/types.ts';

const geneOf = (l: LevelDefinition) => GENES[l.symbol]!;

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()));
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });
});

describe('deterministic generation', () => {
  it('regenerating from specs reproduces the pinned level pack exactly', { timeout: 120_000 }, () => {
    expect(buildCampaign(M2_SPECS, GENES)).toEqual(LEVELS);
    expect(LEVEL_PACK.generatorVersion).toBe(GENERATOR_VERSION);
    expect(LEVEL_PACK.campaignId).toBe(CAMPAIGN_ID);
    expect(LEVEL_PACK.datasets).toEqual({ INS: INS.datasetId, HBB: HBB.datasetId });
  });
  it('same seed twice gives identical levels; a different seed gives a different level', { timeout: 60_000 }, () => {
    const spec = M2_SPECS[1]!;
    expect(buildLevel(spec, INS, [], 0)).toEqual(buildLevel(spec, INS, [], 0));
    expect(buildLevel({ ...spec, seed: spec.seed + 1 }, INS, [], 0).initial).not.toBe(buildLevel(spec, INS, [], 0).initial);
  });
});

describe('pinned M2 level pack', () => {
  it('has 12 levels: 6 INS then 6 HBB, with one one-move tutorial first', () => {
    expect(LEVELS).toHaveLength(12);
    expect(LEVELS.map((l) => l.index)).toEqual([...Array(12).keys()]);
    expect(levelsForGene('INS')).toHaveLength(6);
    expect(levelsForGene('HBB')).toHaveLength(6);
    expect(LEVELS.slice(0, 6).every((l) => l.symbol === 'INS')).toBe(true);
    expect(LEVELS[0]!.tutorial).toBe(true);
    expect(LEVELS[0]!.certificate).toHaveLength(1);
    expect(LEVELS.slice(1).every((l) => !l.tutorial && l.certificateSlides.length >= 2)).toBe(true);
  });
  it('covers all four modes for both genes', () => {
    for (const g of ['INS', 'HBB']) expect(new Set(levelsForGene(g).map((l) => l.mode))).toEqual(new Set(['sequence', 'splice', 'replicate', 'repair']));
  });
  it('uses both horizontal and vertical targets', () => {
    expect(new Set(LEVELS.flatMap((l) => l.tracks.map((t) => t.orientation)))).toEqual(new Set(['horizontal', 'vertical']));
  });
  it('every level passes full validation', () => {
    for (const l of LEVELS) expect(validateLevel(l, geneOf(l), LEVELS)).toEqual([]);
  });
  it('all 12 masks are unique under rotation/reflection and not near-duplicates', () => {
    expect(new Set(LEVELS.map((l) => canonicalMask(l.mask))).size).toBe(12);
    for (let i = 0; i < LEVELS.length; i++) {
      for (let j = i + 1; j < LEVELS.length; j++) expect(symmetricDistance(LEVELS[i]!.mask, LEVELS[j]!.mask)).toBeGreaterThanOrEqual(8);
    }
  });
  it('masks are connected, have holes, no immobile cells, and vary in shape', () => {
    for (const l of LEVELS) {
      expect(isConnected(l.mask)).toBe(true);
      const m = maskMetrics(l.mask);
      expect(m.holes).toBeGreaterThan(0);
      expect(m.immobile).toBe(0);
    }
    expect(new Set(LEVELS.map((l) => maskMetrics(l.mask).holes)).size).toBeGreaterThanOrEqual(6);
    expect(isSelfSymmetric(LEVELS.find((l) => l.id === 'hbb-01')!.mask)).toBe(false);
  });
  it('coding targets are exact slices of the verified CDS; each gene samples exactly bases 1–51', () => {
    for (const l of LEVELS) {
      for (const t of l.tracks) {
        const ref = geneOf(l).sequence.slice(t.source.start, t.source.end);
        expect(t.expected).toBe(t.strand === 'coding' ? ref : alignedComplement(ref));
      }
    }
    for (const g of ['INS', 'HBB']) {
      expect(sampleBases(g)).toBe(51);
      const ivs = levelsForGene(g).map((l) => l.sourceIntervals[0]!);
      expect(ivs.map((iv) => [iv.start, iv.end])).toEqual([[0, 9], [9, 18], [18, 24], [24, 33], [33, 42], [42, 51]]);
    }
  });
  it('replication levels place the aligned complement beside the template, read 3′→5′', () => {
    for (const l of LEVELS.filter((x) => x.mode === 'replicate')) {
      const [a, b] = l.tracks;
      expect(a!.strand).toBe('coding');
      expect(a!.readDirection).toBe('5to3');
      expect(b!.strand).toBe('complement');
      expect(b!.readDirection).toBe('3to5');
      expect(b!.expected).toBe(alignedComplement(a!.expected));
      const offset = a!.orientation === 'horizontal' ? 9 : 1;
      expect(b!.cells).toEqual(a!.cells.map((c) => c + offset));
    }
  });
  it('repair levels keep the gap as a hole between two flanking tracks; the base comes from the CDS', () => {
    for (const l of LEVELS.filter((x) => x.mode === 'repair')) {
      const r = l.repair!;
      expect(l.mask[r.cell]).toBe('.');
      expect(l.initial[r.cell]).toBe('.');
      expect(r.expected).toBe(geneOf(l).sequence[r.sourceOffset]);
      expect(l.tracks[0]!.source.end).toBe(r.sourceOffset);
      expect(l.tracks[1]!.source.start).toBe(r.sourceOffset + 1);
    }
    expect(LEVELS.filter((l) => l.mode !== 'repair').every((l) => l.repair === undefined)).toBe(true);
  });
  it('splice levels have 2–3 coding pieces in source order', () => {
    for (const l of LEVELS.filter((x) => x.mode === 'splice')) {
      expect(l.tracks.length).toBeGreaterThanOrEqual(2);
      expect(l.tracks.length).toBeLessThanOrEqual(3);
      expect(l.tracks.map((t) => t.expected).join('')).toBe(geneOf(l).sequence.slice(l.sourceIntervals[0]!.start, l.sourceIntervals[0]!.end));
    }
  });
  it('drag and step certificates replay legally from the initial board to a win', () => {
    for (const l of LEVELS) {
      let b = l.initial;
      for (const m of l.certificate) {
        const o = applyMove(l.mask, b, m);
        expect(o.changed).toBe(true);
        b = o.board;
      }
      expect(isSolved(l, b)).toBe(true);
      let s = l.initial;
      for (const x of l.certificateSlides) s = applySlide(l.mask, s, x.origin, x.axis, x.steps).board;
      expect(s).toBe(l.solved);
    }
  });
  it('difficulty ramps: harder than M1 (1/3/6 steps), proven lower bounds rise, tutorial stays one move', () => {
    const lb = LEVELS.map((l) => l.metrics.solver.lowerBound);
    expect(lb[0]).toBe(1);
    expect(Math.max(...lb.slice(1, 3))).toBeLessThanOrEqual(2); // gentle start
    expect(Math.min(...lb.slice(9))).toBeGreaterThanOrEqual(3);
    expect(Math.max(...lb)).toBeGreaterThanOrEqual(4);
    expect(LEVELS[11]!.metrics.score).toBeGreaterThan(LEVELS[1]!.metrics.score);
    expect(Math.max(...LEVELS.map((l) => l.certificate.length))).toBeGreaterThan(6);
    for (const l of LEVELS) {
      const s = l.metrics.solver;
      expect(s.lowerBound).toBeLessThanOrEqual(l.certificateSlides.length);
      if (s.status === 'optimal') expect(s.optimal).toBe(l.certificateSlides.length);
      expect(l.metrics.difficulty).toBe('estimated');
    }
  });
  it('proven-optimal claims are confirmed by the solver for the small levels', () => {
    for (const l of LEVELS.slice(0, 3)) {
      const r = solveBounded(l.mask, l.tracks, l.initial, { maxDepth: 3, maxNodes: 200_000 });
      expect(r.status).toBe('optimal');
      expect(r.optimal).toBe(l.metrics.solver.optimal);
    }
  });
});

describe('mask canonicalisation & validation', () => {
  it('detects a transformed duplicate', () => {
    const m = LEVELS[1]!.mask;
    for (const t of TRANSFORMS) {
      expect(canonicalMask(transformMask(m, t))).toBe(canonicalMask(m));
      expect(symmetricDistance(m, transformMask(m, t))).toBe(0);
    }
  });
  it('rejects a duplicate mask, a pre-solved board, a wrong source and a misaligned complement', () => {
    const a = LEVELS[1]!;
    expect(validateLevel(a, INS, [{ ...a, id: 'dup' }]).some((e) => e.includes('duplicates'))).toBe(true);
    expect(validateLevel({ ...a, initial: a.solved }, INS, []).some((e) => e.includes('pre-solved'))).toBe(true);
    expect(validateLevel({ ...a, tracks: [{ ...a.tracks[0]!, expected: 'AAA' }, ...a.tracks.slice(1)] }, INS, []).some((e) => e.includes('source CDS'))).toBe(true);
    const rep = LEVELS.find((l) => l.mode === 'replicate')!;
    const rev = { ...rep.tracks[1]!, expected: rep.tracks[1]!.expected.split('').reverse().join('') };
    expect(validateLevel({ ...rep, tracks: [rep.tracks[0]!, rev] }, geneOf(rep), []).some((e) => e.includes('complement'))).toBe(true);
  });
  it('rejects a repair level whose gap is filled', () => {
    const rep = LEVELS.find((l) => l.mode === 'repair')!;
    const mask = rep.mask.slice(0, rep.repair!.cell) + '#' + rep.mask.slice(rep.repair!.cell + 1);
    expect(validateLevel({ ...rep, mask }, geneOf(rep), []).some((e) => e.includes('repair cell'))).toBe(true);
  });
});

describe('tidyMask', () => {
  it('reopens a crossing neighbour so a stuck target cell can move, and keeps protected cells', () => {
    const rows = ['.........', '.........', '#########', '.........', '.........', '.........', '.........', '.........', '.........'];
    const mask = rows.join('');
    const protect = [18, 19, 20, 21, 22];
    const out = tidyMask(mask, protect, () => 'col')!;
    expect(out).not.toBeNull();
    for (const c of protect) {
      expect(out[c]).toBe('#');
      expect(segmentCells(out, c, 'col').length).toBeGreaterThanOrEqual(2);
    }
  });
  it('never opens a forced hole', () => {
    const mask = '#'.repeat(81);
    const out = tidyMask(mask.slice(0, 40) + '.' + mask.slice(41), [39, 41], () => 'col', [40])!;
    expect(out[40]).toBe('.');
  });
});

describe('certificate pruning', () => {
  it('removes a drag that is not needed and keeps the result winning', () => {
    const def = LEVELS[1]!;
    const used = new Set([...def.tracks.flatMap((t) => t.cells), ...def.certificateSlides.flatMap((m) => segmentCells(def.mask, m.origin, m.axis))]);
    let extra = null;
    for (let c = 0; c < 81 && !extra; c++) {
      if (def.mask[c] !== '#') continue;
      for (const axis of ['row', 'col'] as const) {
        const seg = segmentCells(def.mask, c, axis);
        if (seg.length >= 2 && seg.every((x) => !used.has(x)) && applySlide(def.mask, def.initial, c, axis, 1).changed) extra = { origin: c, axis, steps: 1 };
      }
    }
    expect(extra).not.toBeNull();
    const pruned = pruneSlides(def.mask, def.initial, [extra!, ...def.certificateSlides], (b) => isSolved(def, b));
    expect(pruned).toEqual(def.certificateSlides);
  });
  it('every pinned drag certificate is already minimal under single-drag removal', () => {
    for (const def of LEVELS) expect(pruneSlides(def.mask, def.initial, def.certificateSlides, (b) => isSolved(def, b))).toEqual(def.certificateSlides);
  });
  it('step pruning still yields a winning sequence', () => {
    const def = LEVELS[4]!;
    const pruned = pruneCertificate(def.mask, def.initial, def.certificate, (b) => isSolved(def, b));
    let b = def.initial;
    for (const m of pruned) b = applyMove(def.mask, b, m).board;
    expect(isSolved(def, b)).toBe(true);
  });
});

describe('solver', () => {
  it('finds the one-drag tutorial solution and proves no zero-drag solution', () => {
    const l = LEVELS[0]!;
    const r = solveBounded(l.mask, l.tracks, l.initial, { maxDepth: 3, maxNodes: 10_000 });
    expect(r).toMatchObject({ status: 'optimal', optimal: 1, lowerBound: 1 });
    let b = l.initial;
    for (const s of r.solution!) b = applySlide(l.mask, b, s.origin, s.axis, s.steps).board;
    expect(isSolved(l, b)).toBe(true);
  });
  it('reports unknown with an honest lower bound when the node budget runs out', () => {
    const l = LEVELS[11]!;
    const r = solveBounded(l.mask, l.tracks, l.initial, { maxDepth: 5, maxNodes: 2_000 });
    expect(r.status).toBe('unknown');
    expect(r.lowerBound).toBeGreaterThanOrEqual(1);
    expect(r.lowerBound).toBeLessThanOrEqual(l.metrics.solver.lowerBound);
    expect(r.nodes).toBeLessThanOrEqual(2_000 + 5_000);
  });
  it('a solved board needs zero drags; a malformed board is invalid', () => {
    const l = LEVELS[2]!;
    expect(solveBounded(l.mask, l.tracks, l.solved, { maxDepth: 2, maxNodes: 100 })).toMatchObject({ status: 'optimal', optimal: 0 });
    expect(solveBounded(l.mask, l.tracks, 'AT', { maxDepth: 2, maxNodes: 100 }).status).toBe('invalid');
  });
});

describe('rating', () => {
  it('is estimated, monotone in drags, and tutorial is special', () => {
    const base = { certificateDrags: 3, wrongTargetCells: 5, active: 60, tracks: 1, lowerBound: 3, tutorial: false };
    expect(rateLevel({ ...base, tutorial: true }).rating).toBe('tutorial');
    expect(rateLevel({ ...base, optimal: 2, certificateDrags: 2 }).score).toBeLessThan(rateLevel({ ...base, optimal: 4, certificateDrags: 4 }).score);
    expect(rateLevel({ ...base, certificateDrags: 5, lowerBound: 4 }).rating).toBe('hard');
  });
});

describe('generator candidates', () => {
  it('tryCandidate is deterministic and either accepts a valid level or names a rejection reason', () => {
    const spec: LevelSpec = M2_SPECS[3]!;
    for (let i = 0; i < 20; i++) {
      const a = tryCandidate(createRng(1000 + i), spec, INS, []);
      const b = tryCandidate(createRng(1000 + i), spec, INS, []);
      expect(a).toEqual(b);
      if (a.ok) expect(validateLevel(a.def, INS, [])).toEqual([]);
      else expect(typeof a.reason).toBe('string');
    }
  });
});

describe('coverage & discovery', () => {
  it('counts the union of completed intervals per gene; replays add nothing', () => {
    const ins = levelsForGene('INS').map((l) => l.id);
    expect(coveredBases([], 'INS')).toBe(0);
    expect(coveredBases([ins[0]!], 'INS')).toBe(9);
    expect(coveredBases([ins[0]!, ins[0]!], 'INS')).toBe(9);
    expect(coveredBases([ins[0]!, ins[2]!], 'INS')).toBe(15);
    expect(coveredBases(ins, 'HBB')).toBe(0);
    expect(coveredBases(ins, 'INS')).toBe(51);
  });
  it('a gene is discovered only when all six of its levels are complete — and is never 100% of the CDS', () => {
    const ins = levelsForGene('INS').map((l) => l.id);
    expect(isDiscovered(ins.slice(0, 5), 'INS')).toBe(false);
    expect(isDiscovered(ins, 'INS')).toBe(true);
    expect(isDiscovered(ins, 'HBB')).toBe(false);
    expect(coveredBases(ins, 'INS')).toBeLessThan(INS.cdsLength);
  });
});
