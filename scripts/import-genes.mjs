// Build-time importer/validator for the pinned reference CDS records (scripts/genes.config.mjs).
// For each record: parse GenBank, extract the annotated CDS, check length/frame/alphabet/terminal stop,
// translate with the standard code and compare to the record's /translation, then emit an asset with
// provenance and SHA-256 checksums.
// Usage: node scripts/import-genes.mjs          -> writes src/genomics/<gene>.generated.json
//        node scripts/import-genes.mjs --check  -> verifies committed assets match the raw records
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { GENES } from './genes.config.mjs';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const check = process.argv.includes('--check');
let failed = false;
const CODE = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';
const translate = (s) => s.match(/.{3}/g).map((c) => CODE['TCAG'.indexOf(c[0]) * 16 + 'TCAG'.indexOf(c[1]) * 4 + 'TCAG'.indexOf(c[2])]).join('');

function importGene(g) {
  const fail = (m) => { throw new Error(`${g.symbol} ${g.accession}: ${m}`); };
  const raw = readFileSync(`data/raw/${g.accession}.gb`, 'utf8');
  const prov = JSON.parse(readFileSync(`data/raw/${g.accession}.provenance.json`, 'utf8'));
  if (sha256(raw) !== prov.rawSha256) fail('raw record checksum does not match provenance file');
  const version = /^VERSION\s+(\S+)/m.exec(raw)?.[1];
  if (version !== g.accession) fail(`record version ${version} != ${g.accession}`);
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
  if (geneId !== g.geneId) fail(`GeneID ${geneId} != ${g.geneId}`);
  if (/\/codon_start=(\d)/.exec(quals)?.[1] !== '1') fail('codon_start must be 1');
  if (!/^[ACGT]+$/.test(cds)) fail('CDS contains non-ACGT characters');
  if (cds.length !== g.expectedCdsLength) fail(`CDS length ${cds.length} != ${g.expectedCdsLength}`);
  if (cds.length % 3 !== 0) fail('CDS length not divisible by 3');
  const protein = translate(cds);
  if (!protein.startsWith('M')) fail('CDS does not start with ATG/Met');
  if (!protein.endsWith('*') || protein.slice(0, -1).includes('*')) fail('CDS must end in a single terminal stop codon');
  if (protein.slice(0, -1) !== translation) fail('translated CDS does not match annotated /translation');
  // RefSeq summary: first N sentences (config) only, used verbatim on the discovery card (with attribution).
  const comment = /^COMMENT {5}([\s\S]*?)\n(?=\S)/m.exec(raw)?.[1].replace(/\n {12}/g, ' ').replace(/\s+/g, ' ') ?? '';
  const summaryAll = /Summary: (.*?)\[provided by/.exec(comment)?.[1] ?? '';
  const sentences = summaryAll.match(/.*?\.(?= [A-Z]|\s*$)/g)?.map((x) => x.trim()) ?? [];
  const summary = sentences.slice(0, g.summarySentences).join(' ');
  const summaryCredit = /\[provided by (RefSeq, [A-Za-z]+ \d{4})\]/.exec(comment)?.[1];
  if (!summary || !summaryCredit) fail('RefSeq summary not found');
  return {
    datasetId: `refseq-${g.accession}-${prov.retrievedAt.slice(0, 10)}`,
    geneId: `NCBIGene:${geneId}`,
    symbol: g.symbol,
    name: g.name,
    chromosome: g.chromosome,
    transcript: g.accession,
    protein: proteinId,
    biotype: 'protein_coding',
    keywords: /^KEYWORDS\s+(.+)$/m.exec(raw)?.[1].trim(),
    definition: /^DEFINITION\s+([\s\S]*?)\n(?=\S)/m.exec(raw)?.[1].replace(/\s+/g, ' ').trim(),
    functionSummary: summary,
    functionSummaryCredit: `${summaryCredit} (first ${g.summarySentences === 1 ? 'sentence' : `${g.summarySentences} sentences`} of the RefSeq summary in ${g.accession})`,
    cdsLocation: location.trim(),
    cdsLength: cds.length,
    stopCodonIncluded: true,
    sequence: cds,
    sequenceSha256: sha256(cds),
    translationVerified: true,
    proteinLength: translation.length,
    sourceUrl: `https://www.ncbi.nlm.nih.gov/nuccore/${g.accession}`,
    retrievalUrl: prov.url,
    retrievedAt: prov.retrievedAt,
    rawRecordSha256: prov.rawSha256,
  };
}

for (const g of GENES) {
  try {
    const asset = importGene(g);
    const line = `${g.symbol} ${g.accession} CDS ${asset.cdsLocation} length ${asset.cdsLength} sha256 ${asset.sequenceSha256} translation matches ${asset.protein} (${asset.proteinLength} aa)`;
    if (check) {
      const existing = JSON.parse(readFileSync(g.out, 'utf8'));
      for (const k of Object.keys(asset)) {
        if (JSON.stringify(existing[k]) !== JSON.stringify(asset[k])) throw new Error(`${g.symbol}: committed asset field ${k} differs from raw record`);
      }
      if (sha256(existing.sequence) !== existing.sequenceSha256) throw new Error(`${g.symbol}: asset sequence checksum mismatch`);
      console.log(`OK ${line}`);
    } else {
      writeFileSync(g.out, JSON.stringify(asset, null, 2) + '\n');
      console.log(`Wrote ${g.out}: ${line}`);
    }
  } catch (e) {
    console.error(`DATA VALIDATION FAILED: ${e.message}`);
    failed = true;
  }
}
if (failed) process.exit(1);
