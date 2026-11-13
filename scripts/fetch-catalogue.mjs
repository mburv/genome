// Build-time only: resolve each catalogue candidate to its MANE Select RefSeq transcript using the
// NCBI Datasets v2 product report, then download that exact versioned record from E-utilities.
// Writes data/raw/<SYMBOL>.mane.json (the resolution, with checksum) and data/raw/<ACC>.gb + provenance.
// Usage: node scripts/fetch-catalogue.mjs [SYMBOL ...]   (pinned INS/HBB records are never re-fetched)
// The game never makes network requests at play time.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CANDIDATES } from './catalogue.config.mjs';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wanted = process.argv.slice(2);
mkdirSync('data/raw', { recursive: true });

for (const c of CANDIDATES.filter((x) => !x.pinned && (wanted.length === 0 || wanted.includes(x.symbol)))) {
  const url = `https://api.ncbi.nlm.nih.gov/datasets/v2/gene/symbol/${c.symbol}/taxon/9606/product_report`;
  const res = await fetch(url);
  if (!res.ok) { console.error(`${c.symbol}: Datasets HTTP ${res.status}`); continue; }
  const text = await res.text();
  const report = JSON.parse(text).reports?.find((r) => r.product?.gene_id === c.geneId)?.product;
  const mane = report?.transcripts?.filter((t) => t.select_category === 'MANE_SELECT') ?? [];
  const resolution = {
    symbol: c.symbol,
    geneId: c.geneId,
    datasetsUrl: url,
    retrievedAt: new Date().toISOString(),
    responseSha256: sha256(text),
    description: report?.description ?? null,
    maneSelect: mane.map((t) => ({ accession: t.accession_version, ensembl: t.ensembl_transcript ?? null, protein: t.protein?.accession_version ?? null, chromosome: /Chromosome (\w+)/.exec(t.genomic_locations?.[0]?.sequence_name ?? '')?.[1] ?? null })),
  };
  writeFileSync(`data/raw/${c.symbol}.mane.json`, JSON.stringify(resolution, null, 2) + '\n');
  if (mane.length !== 1) { console.error(`${c.symbol}: expected exactly one MANE Select transcript, found ${mane.length}`); continue; }
  const acc = mane[0].accession_version;
  await sleep(400);
  if (!existsSync(`data/raw/${acc}.gb`)) {
    const eurl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nuccore&id=${acc}&rettype=gb&retmode=text&tool=genome-game`;
    const r2 = await fetch(eurl);
    if (!r2.ok) { console.error(`${c.symbol}: efetch HTTP ${r2.status}`); continue; }
    const gb = await r2.text();
    writeFileSync(`data/raw/${acc}.gb`, gb);
    writeFileSync(`data/raw/${acc}.provenance.json`, JSON.stringify({ accession: acc, url: eurl, retrievedAt: new Date().toISOString(), rawSha256: sha256(gb), bytes: Buffer.byteLength(gb) }, null, 2) + '\n');
    console.log(`${c.symbol}: MANE Select ${acc} saved (${Buffer.byteLength(gb)} bytes)`);
    await sleep(400);
  } else console.log(`${c.symbol}: MANE Select ${acc} already pinned`);
}
console.log('Now run: npm run import:data');
