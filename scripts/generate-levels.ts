// Build-time level pack generator. Run with Node 24 (native TypeScript type stripping).
//   node scripts/generate-levels.ts          -> writes src/campaign/levels.generated.json (M2 campaign + M3 labs)
//                                               and src/campaign/chapters.generated.json (M4 assembly chapters)
//   node scripts/generate-levels.ts --check  -> regenerates both and verifies the pinned packs are identical and valid
//   add --only=M2 to skip the chapters (fast check of the M2/M3 pack)
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildCampaign, buildLevel, validateLevel, GENERATOR_VERSION, type GeneSource } from '../src/generator/level.ts';
import { ALL_SPECS, CAMPAIGN_ID } from '../src/campaign/specs.ts';
import { chapterSpecs, geneRunCoverageErrors, introCoverageEnd, TOKEN_GENERATOR_VERSION } from '../src/campaign/chapters.ts';
import type { LevelDefinition } from '../src/engine/types.ts';

const OUT = 'src/campaign/levels.generated.json';
const OUT_CHAPTERS = 'src/campaign/chapters.generated.json';
const check = process.argv.includes('--check');
const onlyM2 = process.argv.includes('--only=M2');
const sha = (s: string): string => createHash('sha256').update(s).digest('hex');

const manifest = JSON.parse(readFileSync('src/genomics/manifest.generated.json', 'utf8')) as { catalogueId: string; included: { symbol: string; cdsLength: number; sequenceSha256: string }[] };
// Keep the historical pack deterministic; the separate Famous Genes generator adds the rest.
manifest.included=manifest.included.slice(0,12);manifest.catalogueId='genome-m4-catalogue-1';
const catalogue = JSON.parse(readFileSync('src/genomics/catalogue.generated.json', 'utf8')) as { genes: GeneSource[] };
const genes: Record<string, GeneSource> = {};
for (const f of ['ins', 'hbb']) {
  const g = JSON.parse(readFileSync(`src/genomics/${f}.generated.json`, 'utf8')) as GeneSource;
  genes[g.symbol] = g;
}
for (const g of catalogue.genes) genes[g.symbol] = g;
for (const g of Object.values(genes)) if (sha(g.sequence) !== g.sequenceSha256) throw new Error(`${g.symbol} asset checksum mismatch`);

const show = (l: LevelDefinition): void => {
  const s = l.metrics.solver;
  console.log(
    `${l.id.padEnd(9)} ${l.mode.padEnd(9)} "${l.title}" ${l.tier ? `k=${l.tier} ` : ''}active=${l.metrics.active} wrong=${l.metrics.wrongTargetCells} drags≤${l.metrics.certificateDrags} ` +
      `${s.status === 'optimal' ? `optimal=${s.optimal}` : `≥${s.lowerBound}`} (${s.nodes} nodes) ${l.metrics.rating} ${l.metrics.score}`,
  );
};

let failed = false;
const t0 = performance.now();
const levels = buildCampaign(ALL_SPECS, genes);
const errors = levels.flatMap((l) => validateLevel(l, genes[l.symbol]!, levels));
if (errors.length) throw new Error(errors.join('\n'));
levels.forEach(show);
const datasets = { INS: genes.INS!.datasetId, HBB: genes.HBB!.datasetId };
const json = JSON.stringify({ campaignId: CAMPAIGN_ID, generatorVersion: GENERATOR_VERSION, datasets, levels }, null, 2) + '\n';
if (check) {
  if (readFileSync(OUT, 'utf8') !== json) { console.error('Pinned level pack differs from deterministic regeneration.'); failed = true; }
  else console.log(`OK: pinned M2/M3 pack reproduces exactly and validates (${levels.length} levels)`);
} else writeFileSync(OUT, json);

if (!onlyM2) {
  // Chapters: one per included catalogue gene, in manifest order; masks stay unique across everything.
  const chapters: LevelDefinition[] = [];
  const all: LevelDefinition[] = [...levels];
  let index = levels.length;
  for (const [gi, entry] of manifest.included.entries()) {
    const gene = genes[entry.symbol];
    if (!gene || gene.sequenceSha256 !== entry.sequenceSha256) throw new Error(`${entry.symbol}: manifest/asset mismatch`);
    const tg = performance.now();
    const start = introCoverageEnd(ALL_SPECS, gene.symbol);
    for (const spec of chapterSpecs({ symbol: gene.symbol, cdsLength: gene.sequence.length }, gi, index, start)) {
      const def = { ...buildLevel(spec, gene, all), generatorVersion: TOKEN_GENERATOR_VERSION };
      chapters.push(def);
      all.push(def);
      index++;
      show(def);
    }
    console.log(`  ${gene.symbol}: ${chapters.filter((c) => c.symbol === gene.symbol).length} puzzles in ${Math.round(performance.now() - tg)} ms`);
  }
  const cerrors = chapters.flatMap((l) => validateLevel(l, genes[l.symbol]!, all));
  if (cerrors.length) throw new Error(cerrors.join('\n'));
  const coverageErrors = manifest.included.flatMap(({symbol})=>geneRunCoverageErrors(all,symbol,genes[symbol]!.sequence.length));
  if (coverageErrors.length) throw new Error(coverageErrors.join('\n'));
  const cdatasets = Object.fromEntries(manifest.included.map((g) => [g.symbol, genes[g.symbol]!.datasetId]));
  const cjson = JSON.stringify({ catalogueId: manifest.catalogueId, generatorVersion: TOKEN_GENERATOR_VERSION, datasets: cdatasets, levels: chapters }) + '\n';
  if (check) {
    if (readFileSync(OUT_CHAPTERS, 'utf8') !== cjson) { console.error('Pinned chapter pack differs from deterministic regeneration.'); failed = true; }
    else console.log(`OK: pinned chapter pack reproduces exactly and validates (${chapters.length} puzzles)`);
  } else {
    writeFileSync(OUT_CHAPTERS, cjson);
    console.log(`Wrote ${OUT_CHAPTERS} (${chapters.length} puzzles, ${Buffer.byteLength(cjson)} bytes)`);
  }
}
console.log(`${check ? 'Checked' : 'Generated'} in ${Math.round(performance.now() - t0)} ms`);
if (failed) process.exit(1);
