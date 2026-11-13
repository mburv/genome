// Build-time only: downloads the pinned RefSeq records from NCBI E-utilities (efetch, GenBank).
// Usage: node scripts/fetch-genes.mjs [SYMBOL ...]   (default: all pinned genes)
// The game never makes network requests at play time.
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { GENES } from './genes.config.mjs';

const wanted = process.argv.slice(2);
mkdirSync('data/raw', { recursive: true });
for (const g of GENES.filter((x) => wanted.length === 0 || wanted.includes(x.symbol))) {
  const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nuccore&id=${g.accession}&rettype=gb&retmode=text&tool=genome-game`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NCBI efetch failed for ${g.accession}: HTTP ${res.status}`);
  const text = await res.text();
  writeFileSync(`data/raw/${g.accession}.gb`, text);
  const sha = createHash('sha256').update(text).digest('hex');
  writeFileSync(
    `data/raw/${g.accession}.provenance.json`,
    JSON.stringify({ accession: g.accession, url, retrievedAt: new Date().toISOString(), rawSha256: sha, bytes: Buffer.byteLength(text) }, null, 2) + '\n',
  );
  console.log(`Saved data/raw/${g.accession}.gb (${Buffer.byteLength(text)} bytes, sha256 ${sha})`);
  await new Promise((r) => setTimeout(r, 400)); // stay well under NCBI's 3 requests/second
}
console.log('Now run: npm run import:data');
