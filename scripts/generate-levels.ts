// Build-time level pack generator. Run with Node 24 (native TypeScript type stripping).
//   node scripts/generate-levels.ts          -> writes src/campaign/levels.generated.json
//   node scripts/generate-levels.ts --check  -> regenerates and verifies the pinned pack is identical and valid
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildCampaign, validateLevel, GENERATOR_VERSION, type GeneSource } from '../src/generator/level.ts';
import { ALL_SPECS, CAMPAIGN_ID } from '../src/campaign/specs.ts';

const OUT = 'src/campaign/levels.generated.json';
const genes: Record<string, GeneSource> = {};
for (const f of ['ins', 'hbb']) {
  const g = JSON.parse(readFileSync(`src/genomics/${f}.generated.json`, 'utf8')) as GeneSource;
  if (createHash('sha256').update(g.sequence).digest('hex') !== g.sequenceSha256) throw new Error(`${g.symbol} asset checksum mismatch`);
  genes[g.symbol] = g;
}

const t0 = performance.now();
const levels = buildCampaign(ALL_SPECS, genes);
const ms = Math.round(performance.now() - t0);
const errors = levels.flatMap((l) => validateLevel(l, genes[l.symbol]!, levels));
if (errors.length) throw new Error(errors.join('\n'));
const datasets = Object.fromEntries(Object.values(genes).map((g) => [g.symbol, g.datasetId]));
const pack = { campaignId: CAMPAIGN_ID, generatorVersion: GENERATOR_VERSION, datasets, levels };
const json = JSON.stringify(pack, null, 2) + '\n';

for (const l of levels) {
  const s = l.metrics.solver;
  console.log(
    `${l.id.padEnd(7)} ${l.mode.padEnd(9)} "${l.title}" active=${l.metrics.active} wrong=${l.metrics.wrongTargetCells} drags≤${l.metrics.certificateDrags} ` +
      `${s.status === 'optimal' ? `optimal=${s.optimal}` : `≥${s.lowerBound}`} (${s.nodes} nodes) ${l.metrics.rating} ${l.metrics.score}`,
  );
  if (process.argv.includes('--show')) for (let r = 0; r < 9; r++) console.log('   ' + l.initial.slice(r * 9, r * 9 + 9).split('').join(' '));
}

if (process.argv.includes('--check')) {
  const pinned = readFileSync(OUT, 'utf8');
  if (pinned !== json) { console.error('Pinned level pack differs from deterministic regeneration.'); process.exit(1); }
  console.log(`OK: pinned pack reproduces exactly and validates (${levels.length} levels, ${ms} ms)`);
} else {
  writeFileSync(OUT, json);
  console.log(`Wrote ${OUT} (${levels.length} levels, ${ms} ms)`);
}
