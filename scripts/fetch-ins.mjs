// Build-time only: downloads the pinned INS RefSeq record from NCBI E-utilities.
// The game never makes network requests at play time.
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ACCESSION = 'NM_000207.3';
const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nuccore&id=${ACCESSION}&rettype=gb&retmode=text&tool=genome-game`;
const res = await fetch(url);
if (!res.ok) throw new Error(`NCBI efetch failed: HTTP ${res.status}`);
const text = await res.text();
mkdirSync('data/raw', { recursive: true });
writeFileSync(`data/raw/${ACCESSION}.gb`, text);
const sha = createHash('sha256').update(text).digest('hex');
writeFileSync(
  `data/raw/${ACCESSION}.provenance.json`,
  JSON.stringify({ accession: ACCESSION, url, retrievedAt: new Date().toISOString(), rawSha256: sha, bytes: Buffer.byteLength(text) }, null, 2) + '\n',
);
console.log(`Saved data/raw/${ACCESSION}.gb (${Buffer.byteLength(text)} bytes, sha256 ${sha}). Now run: npm run import:data`);
