// Generator audit CLI (M2). Runs ≥1,000 independent generation candidates across the 12 level specs,
// records rejection reasons, duplicate/near-duplicate checks, certificate replay, hint walk, bounded
// solver results and estimated difficulty, then writes docs/AUDIT_M2.md and docs/audit-m2.json.
//   node scripts/audit-levels.ts [--per-spec 100] [--budget 60000] [--no-write]
import { readFileSync, writeFileSync } from 'node:fs';
import { tryCandidate, validateLevel, GENERATOR_VERSION, type GeneSource, type RejectReason } from '../src/generator/level.ts';
import { canonicalMask } from '../src/generator/mask.ts';
import { createRng } from '../src/generator/rng.ts';
import { solveBounded } from '../src/generator/solver.ts';
import { applyCommand, createInitialState, recoverySlideHint, replayCertificate } from '../src/engine/engine.ts';
import { M2_SPECS } from '../src/campaign/specs.ts';
import type { LevelDefinition } from '../src/engine/types.ts';

const arg = (name: string, d: number): number => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : d;
};
const perSpec = arg('--per-spec', 100);
const budget = arg('--budget', 60_000);
const genes: Record<string, GeneSource> = {};
for (const f of ['ins', 'hbb']) {
  const g = JSON.parse(readFileSync(`src/genomics/${f}.generated.json`, 'utf8')) as GeneSource;
  genes[g.symbol] = g;
}
const pinned = (JSON.parse(readFileSync('src/campaign/levels.generated.json', 'utf8')) as { levels: LevelDefinition[] }).levels;

interface SpecStats {
  id: string; mode: string; candidates: number; accepted: number; reasons: Partial<Record<RejectReason, number>>;
  ms: number; optimal: Record<string, number>; unknownLB: Record<string, number>; certDrags: Record<string, number>; ratings: Record<string, number>;
  certificateFailures: number; hintFailures: number; validationFailures: number;
}
const inc = (o: Record<string, number>, k: string | number): void => { o[k] = (o[k] ?? 0) + 1; };

const stats: SpecStats[] = [];
const acceptedCanon = new Map<string, string>();
let crossDuplicates = 0;
let total = 0;
const t0 = performance.now();
for (const spec of M2_SPECS) {
  const gene = genes[spec.gene]!;
  const others = pinned.filter((l) => l.id !== spec.id);
  const s: SpecStats = { id: spec.id, mode: spec.mode, candidates: 0, accepted: 0, reasons: {}, ms: 0, optimal: {}, unknownLB: {}, certDrags: {}, ratings: {}, certificateFailures: 0, hintFailures: 0, validationFailures: 0 };
  const ts = performance.now();
  for (let i = 0; i < perSpec; i++) {
    const rng = createRng((spec.seed * 7919 + i * 104729) >>> 0);
    const c = tryCandidate(rng, spec, gene, others, 0);
    s.candidates++;
    total++;
    if (!c.ok) { inc(s.reasons as Record<string, number>, c.reason); continue; }
    const def = c.def;
    s.accepted++;
    // Duplicate check across every accepted audit candidate (any spec), up to rotation/reflection.
    const canon = canonicalMask(def.mask);
    const prior = acceptedCanon.get(canon);
    if (prior) crossDuplicates++;
    else acceptedCanon.set(canon, `${spec.id}#${i}`);
    if (validateLevel(def, gene, others).length) s.validationFailures++;
    const replay = replayCertificate(def);
    if (!replay.valid || !replay.solved) s.certificateFailures++;
    // Following certified drag hints from the start must solve the level.
    let st = createInitialState(def);
    for (let k = 0; k < 40 && st.status === 'playing'; k++) {
      const h = recoverySlideHint(def, st);
      if (!h) break;
      st = applyCommand(def, st, { type: 'slide', ...h }).state;
    }
    if (st.status !== 'solved') s.hintFailures++;
    inc(s.certDrags, def.metrics.certificateDrags);
    const r = solveBounded(def.mask, def.tracks, def.initial, { maxDepth: def.metrics.certificateDrags, maxNodes: budget });
    if (r.status === 'optimal') inc(s.optimal, r.optimal!);
    else if (r.lowerBound >= def.metrics.certificateDrags) inc(s.optimal, def.metrics.certificateDrags);
    else inc(s.unknownLB, `≥${r.lowerBound}`);
    inc(s.ratings, def.metrics.rating);
  }
  s.ms = Math.round(performance.now() - ts);
  stats.push(s);
  console.log(`${spec.id.padEnd(7)} ${spec.mode.padEnd(9)} accepted ${s.accepted}/${s.candidates} in ${s.ms} ms  rejects ${JSON.stringify(s.reasons)}`);
}
const ms = Math.round(performance.now() - t0);
const accepted = stats.reduce((n, s) => n + s.accepted, 0);
const reasons: Record<string, number> = {};
for (const s of stats) for (const [k, v] of Object.entries(s.reasons)) reasons[k] = (reasons[k] ?? 0) + (v ?? 0);
const failures = stats.reduce((n, s) => n + s.certificateFailures + s.hintFailures + s.validationFailures, 0);
const summary = { generatorVersion: GENERATOR_VERSION, date: new Date().toISOString().slice(0, 10), perSpec, solverBudget: budget, candidates: total, accepted, acceptanceRate: accepted / total, crossDuplicates, failures, reasons, ms, specs: stats };
console.log(`\n${total} candidates, ${accepted} accepted (${((100 * accepted) / total).toFixed(1)}%), cross-duplicates among accepted: ${crossDuplicates}, certificate/hint/validation failures: ${failures}, ${ms} ms`);

if (!process.argv.includes('--no-write')) {
  writeFileSync('docs/audit-m2.json', JSON.stringify(summary, null, 2) + '\n');
  const fmt = (o: Record<string, number>): string => Object.entries(o).sort().map(([k, v]) => `${k}:${v}`).join(' ') || '–';
  const pct = (n: number): string => `${((100 * n) / total).toFixed(1)}%`;
  const md = `# Generator audit — M2 (${summary.date})

Generated by \`npm run audit:levels\` (\`scripts/audit-levels.ts\`), generator \`${GENERATOR_VERSION}\`.
Each candidate is one independent generation attempt (fresh seeded RNG) for one of the 12 campaign specs:
track placement → mask proposal → mask rules → uniqueness vs the other 11 pinned levels → scramble → certificate pruning → shallow proof.
Accepted candidates are then re-validated, their certificates replayed, a full certified-hint walk is played, and the bounded solver (${budget.toLocaleString()} node budget, drag metric) is run.

## Totals

| Metric | Value |
|---|---|
| Candidates | ${total} (${perSpec} per spec × ${stats.length}) |
| Accepted | ${accepted} (${((100 * accepted) / total).toFixed(1)}%) |
| Rejected | ${total - accepted} (${pct(total - accepted)}) |
| Duplicate masks among accepted candidates (rotation/reflection) | ${crossDuplicates} |
| Certificate replay failures / hint-walk failures / validation failures | ${stats.reduce((n, s) => n + s.certificateFailures, 0)} / ${stats.reduce((n, s) => n + s.hintFailures, 0)} / ${stats.reduce((n, s) => n + s.validationFailures, 0)} |
| Wall time | ${(ms / 1000).toFixed(1)} s |

## Rejection reasons (all candidates)

| Reason | Count | Share of candidates |
|---|---:|---:|
${Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} | ${pct(v)} |`).join('\n')}

## Per spec

| Level | Mode | Accepted | Main rejections | Certificate drags | Solver: optimal (drags) | Solver: unresolved | Estimated rating |
|---|---|---:|---|---|---|---|---|
${stats.map((s) => `| ${s.id} | ${s.mode} | ${s.accepted}/${s.candidates} | ${Object.entries(s.reasons).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(', ')} | ${fmt(s.certDrags)} | ${fmt(s.optimal)} | ${fmt(s.unknownLB)} | ${fmt(s.ratings)} |`).join('\n')}

## Pinned campaign (levels.generated.json)

| Level | Mode | Drags (certificate) | Solver | Rating (estimated) |
|---|---|---:|---|---|
${pinned.map((l) => `| ${l.id} "${l.title}" | ${l.mode} | ${l.metrics.certificateDrags} | ${l.metrics.solver.status === 'optimal' ? `optimal ${l.metrics.solver.optimal}` : `≥ ${l.metrics.solver.lowerBound} (unproven)`} | ${l.metrics.rating} (${l.metrics.score}) |`).join('\n')}

## Notes and limits

- "Optimal" means the bounded BFS (drag metric: one move = rotate one segment by any number of cells) proved the minimum, either by finding a solution or by exhausting every shorter depth so that the lower bound meets the certificate. "Unresolved ≥ k" means depths < k were exhausted but the budget ran out first.
- Ratings are estimates from bounds, number of tracks, wrong cells and open space. They are not playtest-derived.
- Rejection rates are driven mostly by deliberately strict mask rules (connectivity, active-cell range, no near-empty rows/columns, dead ends, no immobile cells) and the shallow-proof requirement; they describe this generator version only.
- Duplicate counts compare accepted candidates with each other and the pinned campaign; uniqueness of shipped levels is enforced separately (canonical fingerprint + symmetric Hamming distance ≥ 8).
`;
  writeFileSync('docs/AUDIT_M2.md', md);
  console.log('Wrote docs/AUDIT_M2.md and docs/audit-m2.json');
}
if (failures > 0 || total < 1000) process.exit(1);
