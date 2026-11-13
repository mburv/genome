// Build-time level pack generator. Run with Node 24 (native TypeScript type stripping).
//   node scripts/generate-levels.ts          -> writes src/campaign/levels.generated.json
//   node scripts/generate-levels.ts --check  -> regenerates and verifies the pinned pack is identical and valid
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildCampaign, validateLevel, GENERATOR_VERSION, type GeneSource } from '../src/generator/level.ts';
import { M1_SPECS, CAMPAIGN_ID } from '../src/campaign/specs.ts';
import type { LevelDefinition } from '../src/engine/types.ts';

const OUT = 'src/campaign/levels.generated.json';
const ins = JSON.parse(readFileSync('src/genomics/ins.generated.json', 'utf8')) as GeneSource & { cdsLength: number };
if (createHash('sha256').update(ins.sequence).digest('hex') !== ins.sequenceSha256) throw new Error('INS asset checksum mismatch');

const t0 = performance.now();
const levels = buildCampaign(M1_SPECS, ins);
const ms = Math.round(performance.now() - t0);
const errors = levels.flatMap((l) => validateLevel(l, ins, levels));
if (errors.length) throw new Error(errors.join('\n'));
const pack = { campaignId: CAMPAIGN_ID, generatorVersion: GENERATOR_VERSION, datasetId: ins.datasetId, levels };
const json = JSON.stringify(pack, null, 2) + '\n';

for (const l of levels as LevelDefinition[]) {
  console.log(`${l.id} "${l.title}" seed=${l.seed} active=${l.metrics.active} wrong=${l.metrics.wrongTargetCells} cert=${l.metrics.certificateLength} axes=${l.metrics.axesUsed.join('+')} ${l.tracks[0]!.orientation}`);
  for (let r = 0; r < 9; r++) console.log('   ' + l.initial.slice(r * 9, r * 9 + 9).split('').join(' '));
}

if (process.argv.includes('--check')) {
  const pinned = readFileSync(OUT, 'utf8');
  if (pinned !== json) { console.error('Pinned level pack differs from deterministic regeneration.'); process.exit(1); }
  console.log(`OK: pinned pack reproduces exactly and validates (${levels.length} levels, ${ms} ms)`);
} else {
  writeFileSync(OUT, json);
  console.log(`Wrote ${OUT} (${levels.length} levels, ${ms} ms)`);
}
