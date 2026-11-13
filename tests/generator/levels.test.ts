import { describe, expect, it } from 'vitest';
import { buildCampaign, buildLevel, validateLevel, GENERATOR_VERSION } from '../../src/generator/level.ts';
import { canonicalMask, isConnected, maskMetrics, symmetricDistance, transformMask, TRANSFORMS } from '../../src/generator/mask.ts';
import { createRng } from '../../src/generator/rng.ts';
import { M1_SPECS } from '../../src/campaign/specs.ts';
import { LEVEL_PACK, LEVELS } from '../../src/campaign/campaign.ts';
import { INS } from '../../src/genomics/ins.ts';

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()));
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });
});

describe('deterministic generation', () => {
  it('regenerating from specs reproduces the pinned level pack exactly', () => {
    const regenerated = buildCampaign(M1_SPECS, INS);
    expect(regenerated).toEqual(LEVELS);
    expect(LEVEL_PACK.generatorVersion).toBe(GENERATOR_VERSION);
    expect(LEVEL_PACK.datasetId).toBe(INS.datasetId);
  });
  it('same seed twice gives identical levels; a different seed gives a different level', () => {
    const spec = M1_SPECS[1]!;
    expect(buildLevel(spec, INS, [])).toEqual(buildLevel(spec, INS, []));
    expect(buildLevel({ ...spec, seed: spec.seed + 1 }, INS, []).initial).not.toBe(buildLevel(spec, INS, []).initial);
  });
});

describe('pinned M1 level pack', () => {
  it('has exactly three levels with a one-move tutorial first', () => {
    expect(LEVELS).toHaveLength(3);
    expect(LEVELS[0]!.tutorial).toBe(true);
    expect(LEVELS[0]!.certificate).toHaveLength(1);
    expect(LEVELS.slice(1).every((l) => !l.tutorial && l.certificate.length > 1)).toBe(true);
  });
  it('uses both horizontal and vertical targets', () => {
    const o = new Set(LEVELS.flatMap((l) => l.tracks.map((t) => t.orientation)));
    expect(o).toEqual(new Set(['horizontal', 'vertical']));
  });
  it('every level passes full validation (connectivity, legal tracks, exact source, unsolved, certificate)', () => {
    for (const l of LEVELS) expect(validateLevel(l, INS, LEVELS)).toEqual([]);
  });
  it('masks are unique under all rotations/reflections and not near-duplicates', () => {
    const canon = LEVELS.map((l) => canonicalMask(l.mask));
    expect(new Set(canon).size).toBe(LEVELS.length);
    for (let i = 0; i < LEVELS.length; i++) {
      for (let j = i + 1; j < LEVELS.length; j++) expect(symmetricDistance(LEVELS[i]!.mask, LEVELS[j]!.mask)).toBeGreaterThanOrEqual(8);
    }
  });
  it('masks are connected, have holes, and no immobile cells', () => {
    for (const l of LEVELS) {
      expect(isConnected(l.mask)).toBe(true);
      const m = maskMetrics(l.mask);
      expect(m.holes).toBeGreaterThan(0);
      expect(m.immobile).toBe(0);
    }
  });
  it('targets are exact slices of the verified INS CDS', () => {
    for (const l of LEVELS) for (const t of l.tracks) expect(t.expected).toBe(INS.sequence.slice(t.source.start, t.source.end));
    expect(LEVELS.map((l) => l.tracks[0]!.expected).join('')).toBe(INS.sequence.slice(0, 27));
  });
});

describe('mask canonicalisation', () => {
  it('detects a transformed duplicate', () => {
    const m = LEVELS[1]!.mask;
    for (const t of TRANSFORMS) {
      expect(canonicalMask(transformMask(m, t))).toBe(canonicalMask(m));
      expect(symmetricDistance(m, transformMask(m, t))).toBe(0);
    }
  });
  it('validation rejects a level whose mask is a rotated duplicate of another', () => {
    const a = LEVELS[1]!;
    const rotated = { ...a, id: 'dup' };
    expect(validateLevel(a, INS, [rotated]).some((e) => e.includes('duplicates'))).toBe(true);
  });
  it('validation rejects a pre-solved or wrong-source level', () => {
    const a = LEVELS[1]!;
    expect(validateLevel({ ...a, initial: a.solved }, INS, []).some((e) => e.includes('pre-solved'))).toBe(true);
    const badTrack = { ...a.tracks[0]!, expected: 'AAAAAAAAA' };
    expect(validateLevel({ ...a, tracks: [badTrack] }, INS, []).some((e) => e.includes('source CDS'))).toBe(true);
  });
});

describe('certificate pruning', () => {
  it('removes a move that is not needed and keeps the result winning', async () => {
    const { pruneCertificate } = await import('../../src/generator/level.ts');
    const { allMoves, applyMove, segmentCells } = await import('../../src/engine/grid.ts');
    const { isSolved } = await import('../../src/engine/engine.ts');
    const def = LEVELS[1]!;
    const used = new Set([...def.tracks[0]!.cells, ...def.certificate.flatMap((m) => segmentCells(def.mask, m.origin, m.axis))]);
    const irrelevant = allMoves(def.mask).find(
      (m) => segmentCells(def.mask, m.origin, m.axis).every((c) => !used.has(c)) && applyMove(def.mask, def.initial, m).changed,
    )!;
    expect(irrelevant).toBeDefined();
    const padded = [irrelevant, ...def.certificate];
    const pruned = pruneCertificate(def.mask, def.initial, padded, (b) => isSolved(def, b));
    expect(pruned).toEqual(def.certificate);
    let b = def.initial;
    for (const m of pruned) b = applyMove(def.mask, b, m).board;
    expect(isSolved(def, b)).toBe(true);
  });
  it('every pinned certificate is already minimal under single-move removal', async () => {
    const { pruneCertificate } = await import('../../src/generator/level.ts');
    const { isSolved } = await import('../../src/engine/engine.ts');
    for (const def of LEVELS) expect(pruneCertificate(def.mask, def.initial, def.certificate, (b) => isSolved(def, b))).toEqual(def.certificate);
  });
});
