// Build-time importer/validator for the pinned INS CDS (NM_000207.3).
// Parses the GenBank record, extracts the annotated CDS, translates it with the
// standard genetic code and cross-checks it against the record's /translation.
// Usage: node scripts/import-ins.mjs          -> writes src/genomics/ins.generated.json
//        node scripts/import-ins.mjs --check  -> verifies the committed asset matches the raw record
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ACCESSION = 'NM_000207.3';
const EXPECTED_CDS_LENGTH = 333;
const RAW = `data/raw/${ACCESSION}.gb`;
const OUT = 'src/genomics/ins.generated.json';
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

const raw = readFileSync(RAW, 'utf8');
const prov = JSON.parse(readFileSync(`data/raw/${ACCESSION}.provenance.json`, 'utf8'));
const fail = (m) => { console.error(`DATA VALIDATION FAILED: ${m}`); process.exit(1); };

if (sha256(raw) !== prov.rawSha256) fail('raw record checksum does not match provenance file');
const version = /^VERSION\s+(\S+)/m.exec(raw)?.[1];
if (version !== ACCESSION) fail(`record version ${version} != ${ACCESSION}`);
const originIdx = raw.indexOf('\nORIGIN');
const seq = raw.slice(originIdx + 7, raw.indexOf('\n//', originIdx)).replace(/[^acgtn]/gi, '').toUpperCase();

const features = raw.slice(raw.indexOf('\nFEATURES'), originIdx);
const cdsBlocks = [...features.matchAll(/^ {5}CDS {13}(.+)\n((?: {21}.*\n)*)/gm)];
if (cdsBlocks.length !== 1) fail(`expected exactly one CDS feature, found ${cdsBlocks.length}`);
const [, location, qualText] = cdsBlocks[0];
if (/complement|[<>]/.test(location)) fail(`unsupported CDS location ${location}`);
const ranges = location.replace(/^join\(|\)$/g, '').split(',').map((r) => r.split('..').map(Number));
const cds = ranges.map(([a, b]) => seq.slice(a - 1, b)).join('');
const quals = qualText.replace(/\n {21}/g, ' ');
const translation = /\/translation="([^"]+)"/.exec(quals)?.[1].replace(/\s/g, '');
const proteinId = /\/protein_id="([^"]+)"/.exec(quals)?.[1];
const geneId = /\/db_xref="GeneID:(\d+)"/.exec(quals)?.[1];
const codonStart = /\/codon_start=(\d)/.exec(quals)?.[1];
if (codonStart !== '1') fail('codon_start must be 1');

const bases = 'TCAG';
const aa = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';
const translate = (s) => s.match(/.{3}/g).map((c) => aa[bases.indexOf(c[0]) * 16 + bases.indexOf(c[1]) * 4 + bases.indexOf(c[2])]).join('');

if (!/^[ACGT]+$/.test(cds)) fail('CDS contains non-ACGT characters');
if (cds.length !== EXPECTED_CDS_LENGTH) fail(`CDS length ${cds.length} != ${EXPECTED_CDS_LENGTH}`);
if (cds.length % 3 !== 0) fail('CDS length not divisible by 3');
const protein = translate(cds);
if (!protein.endsWith('*') || protein.slice(0, -1).includes('*')) fail('CDS must end in a single terminal stop codon');
if (protein.slice(0, -1) !== translation) fail('translated CDS does not match annotated /translation');

const asset = {
  datasetId: `refseq-${ACCESSION}-${prov.retrievedAt.slice(0, 10)}`,
  geneId: `NCBIGene:${geneId}`,
  symbol: 'INS',
  name: 'Insulin',
  chromosome: '11',
  transcript: ACCESSION,
  protein: proteinId,
  biotype: 'protein_coding',
  keywords: /^KEYWORDS\s+(.+)$/m.exec(raw)?.[1].trim(),
  cdsLocation: location.trim(),
  cdsLength: cds.length,
  stopCodonIncluded: true,
  sequence: cds,
  sequenceSha256: sha256(cds),
  translationVerified: true,
  sourceUrl: `https://www.ncbi.nlm.nih.gov/nuccore/${ACCESSION}`,
  retrievalUrl: prov.url,
  retrievedAt: prov.retrievedAt,
  rawRecordSha256: prov.rawSha256,
};

if (process.argv.includes('--check')) {
  const existing = JSON.parse(readFileSync(OUT, 'utf8'));
  for (const k of ['sequence', 'sequenceSha256', 'cdsLength', 'transcript', 'rawRecordSha256']) {
    if (existing[k] !== asset[k]) fail(`committed asset field ${k} differs from raw record`);
  }
  if (sha256(existing.sequence) !== existing.sequenceSha256) fail('asset sequence checksum mismatch');
  console.log(`OK ${ACCESSION} CDS ${location.trim()} length ${cds.length} sha256 ${asset.sequenceSha256} translation matches ${proteinId}`);
} else {
  writeFileSync(OUT, JSON.stringify(asset, null, 2) + '\n');
  console.log(`Wrote ${OUT}: ${ACCESSION} CDS ${location.trim()} length ${cds.length} sha256 ${asset.sequenceSha256}`);
}
