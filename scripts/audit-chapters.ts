// M4 scale audit for the pinned assembly chapters (src/campaign/chapters.generated.json).
// Checks every shipped puzzle (validation, certificate replay, certified-hint walk, bounded solver at the
// shipped budget, mask uniqueness across all 122 levels, full-CDS reconstruction + SHA-256 per gene), runs
// extra independent generation candidates per chapter spec to measure acceptance at scale, and estimates
// chapter duration with a stated (non-playtested) model. Writes docs/AUDIT_M4.md and docs/audit-m4.json.
//   node scripts/audit-chapters.ts [--per-spec 3] [--budget 60000] [--no-write]
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tryCandidate, validateLevel, type GeneSource } from '../src/generator/level.ts';
import { canonicalMask, symmetricDistance } from '../src/generator/mask.ts';
import { createRng } from '../src/generator/rng.ts';
import { solveBounded } from '../src/generator/solver.ts';
import { applyCommand, createInitialState, recoverySlideHint, replayCertificate } from '../src/engine/engine.ts';
import { chapterSpecs, TOKEN_GENERATOR_VERSION } from '../src/campaign/chapters.ts';
import type { LevelDefinition } from '../src/engine/types.ts';

const arg = (name: string, d: number): number => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : d;
};
const perSpec = arg('--per-spec', 3);
const budget = arg('--budget', 60_000);
const sha = (s: string): string => createHash('sha256').update(s).digest('hex');

const manifest = JSON.parse(readFileSync('src/genomics/manifest.generated.json', 'utf8')) as { catalogueId: string; included: { symbol: string; cdsLength: number; sequenceSha256: string }[] };
const catalogue = JSON.parse(readFileSync('src/genomics/catalogue.generated.json', 'utf8')) as { genes: GeneSource[] };
const genes: Record<string, GeneSource> = {};
for (const f of ['ins', 'hbb']) { const g = JSON.parse(readFileSync(`src/genomics/${f}.generated.json`, 'utf8')) as GeneSource; genes[g.symbol] = g; }
for (const g of catalogue.genes) genes[g.symbol] = g;
const m2 = (JSON.parse(readFileSync('src/campaign/levels.generated.json', 'utf8')) as { levels: LevelDefinition[] }).levels;
const chapters = (JSON.parse(readFileSync('src/campaign/chapters.generated.json', 'utf8')) as { levels: LevelDefinition[] }).levels;
const all = [...m2, ...chapters];

/**
 * Duration model (an estimate, NOT playtest data): reading the target and tiles plus planning, then each
 * certified drag. 25 s base + 18 s per certificate drag + 1.5 s per distinct tile type (reading labels),
 * ×1.25 for 12/24-base tiers (longer labels). Report as a range: model × 0.6 (fast) … × 1.6 (slow).
 */
const estimateSeconds = (l: LevelDefinition): number => {
  const types = Object.keys(l.tokens ?? {}).length;
  return (25 + 18 * l.metrics.certificateDrags + 1.5 * types) * ((l.tier ?? 3) >= 12 ? 1.25 : 1);
};

interface PuzzleRow {
  id: string; symbol: string; part: number; mode: string; tier: number; cds: string; tiles: number; tokenTypes: number; decoys: number;
  drags: number; solver: string; solverMs: number; rating: string; validation: number; certificate: boolean; hintWalk: boolean; minMaskDistance: number; estSeconds: number;
}
const rows: PuzzleRow[] = [];
let failures = 0;
const canon = new Map<string, string>();
let duplicateMasks = 0;
const t0 = performance.now();
for (const l of chapters) {
  const gene = genes[l.symbol]!;
  const errs = validateLevel(l, gene, all);
  const rep = replayCertificate(l);
  let st = createInitialState(l);
  for (let k = 0; k < 60 && st.status === 'playing'; k++) {
    const h = recoverySlideHint(l, st);
    if (!h) break;
    st = applyCommand(l, st, { type: 'slide', ...h }).state;
  }
  const ts = performance.now();
  const r = solveBounded(l.mask, l.tracks, l.initial, { maxDepth: l.metrics.certificateDrags, maxNodes: budget });
  const solverMs = Math.round(performance.now() - ts);
  const c = canonicalMask(l.mask);
  if (canon.has(c)) duplicateMasks++; else canon.set(c, l.id);
  let minD = Infinity;
  for (const o of all) if (o.id !== l.id) minD = Math.min(minD, symmetricDistance(l.mask, o.mask));
  const ok = errs.length === 0 && rep.valid && rep.solved && st.status === 'solved';
  if (!ok) failures++;
  const toks = Object.values(l.tokens ?? {});
  const iv = l.sourceIntervals;
  rows.push({
    id: l.id, symbol: l.symbol, part: l.chapter!.part, mode: l.mode, tier: l.tier!, cds: `${iv[0]!.start + 1}–${iv.at(-1)!.end}`,
    tiles: l.mask.split('').filter((x) => x === '#').length, tokenTypes: toks.length, decoys: toks.filter((t) => t.kind === 'decoy').length,
    drags: l.metrics.certificateDrags, solver: r.status === 'optimal' ? `optimal ${r.optimal}` : r.lowerBound >= l.metrics.certificateDrags ? `optimal ${l.metrics.certificateDrags}` : `≥${r.lowerBound}`,
    solverMs, rating: l.metrics.rating, validation: errs.length, certificate: rep.valid && rep.solved, hintWalk: st.status === 'solved', minMaskDistance: minD, estSeconds: Math.round(estimateSeconds(l)),
  });
}
const checkMs = Math.round(performance.now() - t0);

// Reconstruction per gene from the shipped pieces only (coding tracks + repair pieces).
const genesOut = manifest.included.map((m) => {
  const ch = chapters.filter((l) => l.symbol === m.symbol);
  const bases: (string | null)[] = new Array<string | null>(m.cdsLength).fill(null);
  for (const l of ch) {
    const seqOf = (s: string) => l.tokens![s]!.seq;
    for (const t of l.tracks) {
      if (t.strand !== 'coding') continue;
      let off = t.source.start;
      for (const s of t.expected) { const q = seqOf(s); for (let i = 0; i < q.length; i++) bases[off + i] = q[i]!; off += q.length; }
    }
    if (l.repair) { const q = seqOf(l.repair.expected); for (let i = 0; i < q.length; i++) bases[l.repair.sourceOffset + i] = q[i]!; }
  }
  const rec = bases.map((b) => b ?? '·').join('');
  const verified = !rec.includes('·') && sha(rec) === m.sequenceSha256;
  if (!verified) failures++;
  const r = rows.filter((x) => x.symbol === m.symbol);
  const est = r.reduce((n, x) => n + x.estSeconds, 0);
  return { symbol: m.symbol, cdsLength: m.cdsLength, puzzles: ch.length, tiers: [...new Set(ch.map((l) => l.tier!))], verified, estMinutes: +(est / 60).toFixed(1), estRange: [+(0.6 * est / 60).toFixed(0), +(1.6 * est / 60).toFixed(0)], ratings: r.reduce<Record<string, number>>((o, x) => ((o[x.rating] = (o[x.rating] ?? 0) + 1), o), {}) };
});

// Extra independent generation candidates per chapter spec (acceptance at scale).
const cand = { candidates: 0, accepted: 0, reasons: {} as Record<string, number>, ms: 0 };
const tc = performance.now();
let index = m2.length;
for (const [gi, m] of manifest.included.entries()) {
  const specs = chapterSpecs({ symbol: m.symbol, cdsLength: m.cdsLength }, gi, index);
  index += specs.length;
  for (const spec of specs) {
    const others = all.filter((l) => l.id !== spec.id);
    for (let i = 0; i < perSpec; i++) {
      const c = tryCandidate(createRng((spec.seed * 7919 + (i + 1) * 104729) >>> 0), spec, genes[m.symbol]!, others, 0);
      cand.candidates++;
      if (c.ok) cand.accepted++; else cand.reasons[c.reason] = (cand.reasons[c.reason] ?? 0) + 1;
    }
  }
}
cand.ms = Math.round(performance.now() - tc);

const count = (xs: (string | number)[]) => xs.reduce<Record<string, number>>((o, x) => ((o[String(x)] = (o[String(x)] ?? 0) + 1), o), {});
const summary = {
  tokenGeneratorVersion: TOKEN_GENERATOR_VERSION, catalogueId: manifest.catalogueId, date: new Date().toISOString().slice(0, 10), solverBudget: budget,
  puzzles: rows.length, failures, duplicateMasks, minMaskDistance: Math.min(...rows.map((r) => r.minMaskDistance)), checkMs,
  solver: count(rows.map((r) => (r.solver.startsWith('optimal') ? 'optimal' : 'unresolved'))), ratings: count(rows.map((r) => r.rating)), tiers: count(rows.map((r) => r.tier)), modes: count(rows.map((r) => r.mode)),
  maxSolverMs: Math.max(...rows.map((r) => r.solverMs)), genes: genesOut, candidates: { ...cand, perSpec }, rows,
};
console.log(`${rows.length} chapter puzzles checked in ${checkMs} ms: failures ${failures}, duplicate masks ${duplicateMasks}, min mask distance ${summary.minMaskDistance}`);
console.log(`solver: ${JSON.stringify(summary.solver)}  ratings: ${JSON.stringify(summary.ratings)}  max solver ${summary.maxSolverMs} ms`);
for (const g of genesOut) console.log(`  ${g.symbol.padEnd(5)} ${String(g.cdsLength).padStart(4)} bp  ${g.puzzles} puzzles  tiers ${g.tiers.join('/')}  verified ${g.verified}  ≈${g.estMinutes} min (${g.estRange[0]}–${g.estRange[1]})`);
console.log(`extra candidates: ${cand.accepted}/${cand.candidates} accepted in ${cand.ms} ms  ${JSON.stringify(cand.reasons)}`);

if (!process.argv.includes('--no-write')) {
  writeFileSync('docs/audit-m4.json', JSON.stringify(summary, null, 2) + '\n');
  const fmt = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `${k}: ${v}`).join(', ');
  const md = `# Chapter audit — M4 (${summary.date})

Generated by \`npm run audit:levels\` (\`scripts/audit-chapters.ts\`), token generator \`${TOKEN_GENERATOR_VERSION}\`, catalogue \`${manifest.catalogueId}\`.
Every shipped assembly puzzle is re-validated, its certificate replayed, a full certified-hint walk played, the bounded solver re-run
(${budget.toLocaleString()} nodes, drag metric) and its mask compared with all ${all.length} shipped levels. Each gene's CDS is then rebuilt from the
shipped pieces alone and its SHA-256 compared with the manifest.

## Totals

| Metric | Value |
|---|---|
| Chapter puzzles | ${rows.length} across ${genesOut.length} genes |
| Validation / certificate / hint-walk / reconstruction failures | ${failures} |
| Duplicate masks (rotation/reflection) | ${duplicateMasks} |
| Minimum symmetric mask distance to any other shipped level | ${summary.minMaskDistance} |
| Solver (shipped budget) | ${fmt(summary.solver)} |
| Slowest single solver run | ${summary.maxSolverMs} ms |
| Estimated ratings | ${fmt(summary.ratings)} |
| Tiers (bases per tile) | ${fmt(summary.tiers)} |
| Modes | ${fmt(summary.modes)} |
| Extra generation candidates | ${cand.accepted}/${cand.candidates} accepted (${perSpec} per spec; rejections ${fmt(cand.reasons) || 'none'}) in ${(cand.ms / 1000).toFixed(1)} s |

## Genes

| Gene | CDS (bp) | Puzzles | Tiers | Rebuilt + SHA-256 | Ratings | Estimated duration |
|---|---:|---:|---|---|---|---|
${genesOut.map((g) => `| ${g.symbol} | ${g.cdsLength} | ${g.puzzles} | ${g.tiers.join(' / ')} | ${g.verified ? '✓' : '✗'} | ${fmt(g.ratings)} | ≈${g.estMinutes} min (${g.estRange[0]}–${g.estRange[1]}) |`).join('\n')}

Duration model (estimate, **not playtested**): 25 s + 18 s per certified drag + 1.5 s per distinct tile type, ×1.25 for 12/24-base tiles; range = ×0.6 … ×1.6.

## Puzzles

| Puzzle | Mode | Tier | CDS | Tile types (decoys) | Drags | Solver | Rating | Mask dist. | Est. s |
|---|---|---:|---|---|---:|---|---|---:|---:|
${rows.map((r) => `| ${r.id} | ${r.mode} | ${r.tier} | ${r.cds} | ${r.tokenTypes} (${r.decoys}) | ${r.drags} | ${r.solver} | ${r.rating} | ${r.minMaskDistance} | ${r.estSeconds} |`).join('\n')}

## Notes and limits

- Masks, scrambles and certificates use the same generator and rules as M2/M3; only the tile alphabet changed. Uniqueness is enforced at generation (fingerprint + distance ≥ 8) and re-checked here across all shipped levels.
- With multi-base tiles most tile types occur once, so wrong placements are rarer than on 4-letter boards; difficulty is carried by drag count and decoys (real slices of the same gene from outside the interval).
- "Unresolved" means the solver proved a lower bound but ran out of budget before proving optimality; the certificate still guarantees solvability.
- Durations and ratings are model estimates; playtesting is required.
`;
  writeFileSync('docs/AUDIT_M4.md', md);
  console.log('Wrote docs/AUDIT_M4.md and docs/audit-m4.json');
}
if (failures > 0 || duplicateMasks > 0) process.exit(1);
