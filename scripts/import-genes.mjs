// Build-time importer/validator for the GENOME catalogue (scripts/catalogue.config.mjs).
// For each candidate: check the pinned raw GenBank record against its provenance checksum, confirm it
// is the MANE Select transcript resolved for that NCBI Gene ID, extract the annotated CDS, check
// length/frame/alphabet/start/terminal stop, translate with the standard code and compare to the
// record's /translation. Records needing an exception (e.g. selenocysteine /transl_except) or outside
// the chapter policy are excluded WITH a recorded reason — never silently repaired.
// Emits: src/genomics/ins.generated.json + hbb.generated.json (pinned M1/M2 assets, unchanged),
//        src/genomics/catalogue.generated.json (other included genes) and
//        src/genomics/manifest.generated.json (included/excluded, reasons, counts).
// Usage: node scripts/import-genes.mjs          -> writes the assets
//        node scripts/import-genes.mjs --check  -> verifies committed assets match the raw records
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CANDIDATES, CATALOGUE_ID, CATALOGUE_RELEASE, MAX_CDS_FOR_CHAPTER } from './catalogue.config.mjs';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const check = process.argv.includes('--check');
const CODE = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';
const translate = (s) => s.match(/.{3}/g).map((c) => CODE['TCAG'.indexOf(c[0]) * 16 + 'TCAG'.indexOf(c[1]) * 4 + 'TCAG'.indexOf(c[2])]).join('');
class Exclusion extends Error { constructor(reason, verified) { super(reason); this.verified = verified; } }

function importGene(c) {
  const fail = (m) => { throw new Error(`${c.symbol}: ${m}`); };
  const exclude = (m, verified = false) => { throw new Exclusion(m, verified); };
  let accession, name, maneChromosome = null;
  if (c.pinned) {
    accession = c.pinned.accession;
    name = c.pinned.name;
  } else {
    const resPath = `data/raw/${c.symbol}.mane.json`;
    if (!existsSync(resPath)) exclude('not fetched (run npm run fetch:catalogue)');
    const res = JSON.parse(readFileSync(resPath, 'utf8'));
    if (res.geneId !== c.geneId) fail(`resolution GeneID ${res.geneId} != ${c.geneId}`);
    if (res.maneSelect.length !== 1) exclude(`expected one MANE Select transcript, found ${res.maneSelect.length}`);
    accession = res.maneSelect[0].accession;
    maneChromosome = res.maneSelect[0].chromosome;
    name = res.description ? res.description[0].toUpperCase() + res.description.slice(1) : c.symbol;
  }
  const raw = readFileSync(`data/raw/${accession}.gb`, 'utf8');
  const prov = JSON.parse(readFileSync(`data/raw/${accession}.provenance.json`, 'utf8'));
  if (sha256(raw) !== prov.rawSha256) fail('raw record checksum does not match provenance file');
  const version = /^VERSION\s+(\S+)/m.exec(raw)?.[1];
  if (version !== accession) fail(`record version ${version} != ${accession}`);
  const keywords = /^KEYWORDS\s+(.+)$/m.exec(raw)?.[1].trim() ?? '';
  if (!/MANE Select/.test(keywords)) exclude(`record is not tagged MANE Select (KEYWORDS: ${keywords})`);
  const originIdx = raw.indexOf('\nORIGIN');
  const seq = raw.slice(originIdx + 7, raw.indexOf('\n//', originIdx)).replace(/[^acgtn]/gi, '').toUpperCase();
  const features = raw.slice(raw.indexOf('\nFEATURES'), originIdx);
  const chromosome = /\/chromosome="([^"]+)"/.exec(features)?.[1];
  if (!chromosome) fail('no /chromosome in source feature');
  if (maneChromosome && maneChromosome !== chromosome) fail(`chromosome ${chromosome} != Datasets ${maneChromosome}`);
  if (c.pinned && c.symbol === 'INS' && chromosome !== '11') fail('INS chromosome');
  const cdsBlocks = [...features.matchAll(/^ {5}CDS {13}(.+)\n((?: {21}.*\n)*)/gm)];
  if (cdsBlocks.length !== 1) fail(`expected exactly one CDS feature, found ${cdsBlocks.length}`);
  const [, location, qualText] = cdsBlocks[0];
  if (/complement|[<>]/.test(location)) exclude(`unsupported CDS location ${location}`);
  const ranges = location.replace(/^join\(|\)$/g, '').split(',').map((r) => r.split('..').map(Number));
  const cds = ranges.map(([a, b]) => seq.slice(a - 1, b)).join('');
  const quals = qualText.replace(/\n {21}/g, ' ');
  const translation = /\/translation="([^"]+)"/.exec(quals)?.[1].replace(/\s/g, '');
  const proteinId = /\/protein_id="([^"]+)"/.exec(quals)?.[1];
  const geneId = /\/db_xref="GeneID:(\d+)"/.exec(quals)?.[1];
  if (geneId !== c.geneId) fail(`GeneID ${geneId} != ${c.geneId}`);
  if (/\/codon_start=(\d)/.exec(quals)?.[1] !== '1') exclude('codon_start is not 1 (exception policy)');
  if (/\/transl_except=/.test(quals)) exclude(`translation exception ${/\/transl_except=(\S+)/.exec(quals)[1]} (e.g. selenocysteine) — needs an exception policy`);
  if (/\/ribosomal_slippage|\/exception=/.test(quals)) exclude('annotated translation exception (exception policy)');
  if (!/^[ACGT]+$/.test(cds)) exclude('CDS contains non-ACGT characters');
  if (c.pinned && cds.length !== { INS: 333, HBB: 444 }[c.symbol]) fail('pinned CDS length changed');
  if (cds.length % 3 !== 0) exclude('CDS length not divisible by 3');
  const protein = translate(cds);
  if (!protein.startsWith('M')) exclude('CDS does not start with ATG/Met');
  if (!protein.endsWith('*') || protein.slice(0, -1).includes('*')) exclude('CDS must end in a single terminal stop codon');
  if (protein.slice(0, -1) !== translation) fail('translated CDS does not match annotated /translation');
  // RefSeq summary: first N sentences only, quoted verbatim on the gene card (with attribution).
  const comment = /^COMMENT {5}([\s\S]*?)\n(?=\S)/m.exec(raw)?.[1].replace(/\n {12}/g, ' ').replace(/\s+/g, ' ') ?? '';
  const summaryAll = /Summary: (.*?)\[provided by/.exec(comment)?.[1] ?? '';
  const sentences = summaryAll.match(/.*?\.(?= [A-Z]|\s*$)/g)?.map((x) => x.trim()) ?? [];
  const summary = sentences.slice(0, c.summarySentences).join(' ');
  const summaryCredit = /\[provided by (RefSeq, [A-Za-z]+ \d{4})\]/.exec(comment)?.[1];
  if (!summary || !summaryCredit) fail('RefSeq summary not found');
  const asset = {
    datasetId: `refseq-${accession}-${prov.retrievedAt.slice(0, 10)}`,
    geneId: `NCBIGene:${geneId}`,
    symbol: c.symbol,
    name,
    chromosome,
    transcript: accession,
    protein: proteinId,
    biotype: 'protein_coding',
    keywords,
    definition: /^DEFINITION\s+([\s\S]*?)\n(?=\S)/m.exec(raw)?.[1].replace(/\s+/g, ' ').trim(),
    functionSummary: summary,
    functionSummaryCredit: `${summaryCredit} (first ${c.summarySentences === 1 ? 'sentence' : `${c.summarySentences} sentences`} of the RefSeq summary in ${accession})`,
    cdsLocation: location.trim(),
    cdsLength: cds.length,
    stopCodonIncluded: true,
    sequence: cds,
    sequenceSha256: sha256(cds),
    translationVerified: true,
    proteinLength: translation.length,
    sourceUrl: `https://www.ncbi.nlm.nih.gov/nuccore/${accession}`,
    retrievalUrl: prov.url,
    retrievedAt: prov.retrievedAt,
    rawRecordSha256: prov.rawSha256,
  };
  if (cds.length > MAX_CDS_FOR_CHAPTER) exclude(`verified, but CDS ${cds.length} bp exceeds the chapter policy (≤ ${MAX_CDS_FOR_CHAPTER} bp with the current 3–24-base token tiers; needs longer tokens or a longer chapter)`, true);
  return asset;
}

let failed = false;
const included = [];
const excluded = [];
for (const c of CANDIDATES) {
  try {
    const asset = importGene(c);
    included.push({ c, asset });
    console.log(`OK ${c.symbol} ${asset.transcript} chr${asset.chromosome} CDS ${asset.cdsLocation} length ${asset.cdsLength} sha256 ${asset.sequenceSha256} translation matches ${asset.protein} (${asset.proteinLength} aa)`);
  } catch (e) {
    if (e instanceof Exclusion) {
      excluded.push({ symbol: c.symbol, geneId: `NCBIGene:${c.geneId}`, verified: e.verified, reason: e.message });
      console.log(`EXCLUDED ${c.symbol}: ${e.message}`);
    } else {
      console.error(`DATA VALIDATION FAILED: ${e.message}`);
      failed = true;
    }
  }
}
if (failed) process.exit(1);

const countBy = (xs, f) => xs.reduce((o, x) => ((o[f(x)] = (o[f(x)] ?? 0) + 1), o), {});
const manifest = {
  catalogueId: CATALOGUE_ID,
  release: CATALOGUE_RELEASE,
  policy: `Human nuclear protein-coding genes, one MANE Select RefSeq transcript each (GRCh38 annotation as in the record). Complete ordinary CDS only: ATG start, single terminal stop (included), length divisible by 3, standard-code translation equal to the record's /translation, no translation exceptions; CDS ≤ ${MAX_CDS_FOR_CHAPTER} bp for this release. Curated candidate list, not a full catalogue.`,
  attribution: 'Sequences and summaries: NCBI RefSeq (O\'Leary et al., Nucleic Acids Res 2016); MANE Select: Morales et al., Nature 2022 (doi:10.1038/s41586-022-04558-8). NCBI data are provided without restriction on use; see https://www.ncbi.nlm.nih.gov/home/about/policies/.',
  candidates: CANDIDATES.length,
  included: included.map(({ c, asset }) => ({
    symbol: asset.symbol, geneId: asset.geneId, name: asset.name, chromosome: asset.chromosome, theme: c.theme, transcript: asset.transcript,
    protein: asset.protein, biotype: asset.biotype, cdsLength: asset.cdsLength, sequenceSha256: asset.sequenceSha256, datasetId: asset.datasetId, sourceUrl: asset.sourceUrl,
  })),
  excluded,
  counts: {
    included: included.length,
    excluded: excluded.length,
    byBiotype: countBy(included, (x) => x.asset.biotype),
    byChromosome: countBy(included, (x) => x.asset.chromosome),
    byTheme: countBy(included, (x) => x.c.theme),
    excludedByReason: countBy(excluded, (x) => x.reason.replace(/\d[\d,]* bp/, 'N bp').replace(/\(pos:[^)]*\)/, '(…)')),
    totalCdsBases: included.reduce((n, x) => n + x.asset.cdsLength, 0),
  },
};
const outputs = [
  ...included.filter((x) => x.c.pinned).map(({ c, asset }) => [c.pinned.out, asset]),
  ['src/genomics/catalogue.generated.json', { genes: included.filter((x) => !x.c.pinned).map((x) => x.asset) }],
  ['src/genomics/manifest.generated.json', manifest],
];
for (const [path, data] of outputs) {
  const text = JSON.stringify(data, null, 2) + '\n';
  if (check) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== text) { console.error(`DATA VALIDATION FAILED: committed ${path} differs from the raw records`); failed = true; }
  } else writeFileSync(path, text);
}
for (const { asset } of included) if (sha256(asset.sequence) !== asset.sequenceSha256) { console.error(`checksum ${asset.symbol}`); failed = true; }
console.log(`${check ? 'Checked' : 'Wrote'} manifest ${CATALOGUE_ID}: ${included.length} included, ${excluded.length} excluded of ${CANDIDATES.length} candidates; ${manifest.counts.totalCdsBases} CDS bases`);
if (failed) process.exit(1);
