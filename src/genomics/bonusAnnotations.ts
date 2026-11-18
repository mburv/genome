import {
  covered, type BonusProgress, type GenomeHeader, type Interval, REFERENCE,
} from '../campaign/bonus.ts';

/** One representative annotated coding transcript per locus. Coordinates and
 * the displayed puzzle bases always refer to T2T-CHM13v2.0 genomic positions.
 * CDS exons are ordered 5′ to 3′ in transcript orientation (reverse on −). */
export type CdsGene = readonly [
  id: string, symbol: string, biotype: string, start: number, end: number,
  strand: '+' | '-', transcript: string, exons: readonly (readonly [number, number])[],
];
export interface CdsIndex {
  format: 'GENOME-CDS-1';
  reference: string;
  annotationSha256: string;
  chromosome: string;
  genes: CdsGene[];
}

export function validateCdsIndex(raw: unknown, header: GenomeHeader): CdsIndex | null {
  if (!raw || typeof raw !== 'object') return null;
  const index = raw as CdsIndex;
  if (index.format !== 'GENOME-CDS-1' || index.reference !== REFERENCE ||
      index.chromosome !== header.chromosome ||
      index.annotationSha256 !== header.annotationSha256 || !Array.isArray(index.genes)) return null;
  if (!index.genes.every(g => Array.isArray(g) && g.length === 8 &&
    g.slice(0, 3).every(v => typeof v === 'string') &&
    Number.isInteger(g[3]) && Number.isInteger(g[4]) && g[3] >= 0 &&
    g[4] <= header.length && g[3] < g[4] && (g[5] === '+' || g[5] === '-') &&
    typeof g[6] === 'string' && Array.isArray(g[7]) && g[7].length > 0 &&
    g[7].every(ex => Array.isArray(ex) && ex.length === 2 &&
      ex.every(Number.isInteger) && ex[0] >= g[3] && ex[1] <= g[4] && ex[0] < ex[1]))) return null;
  return index;
}

export function cdsLength(gene: CdsGene): number {
  return gene[7].reduce((n, ex) => n + ex[1] - ex[0], 0);
}
export function cdsCovered(gene: CdsGene, progress: BonusProgress, chrom: string): number {
  return gene[7].reduce((n, [start, end]) => n + covered(progress[chrom] ?? [], start, end), 0);
}
export function cdsComplete(gene: CdsGene, progress: BonusProgress, chrom: string): boolean {
  return cdsCovered(gene, progress, chrom) === cdsLength(gene);
}
export function newlyCompletedCds(
  index: CdsIndex | null | undefined, before: BonusProgress, after: BonusProgress,
  chrom: string, interval: Interval,
): CdsGene[] {
  if (!index || index.chromosome !== chrom) return [];
  return index.genes.filter(g => g[7].some(ex => ex[0] < interval[1] && ex[1] > interval[0]) &&
    !cdsComplete(g, before, chrom) && cdsComplete(g, after, chrom));
}

export interface CdsLocus { gene: CdsGene; first: number; last: number; }
/** Label a CDS only if this entire forward-strand puzzle lies inside a single
 * annotated CDS exon of one unambiguous representative gene. Introns, split
 * exons and overlapping coding genes use chromosome coordinates instead. */
export function cdsLocus(index: CdsIndex | null | undefined, chrom: string, [start, end]: Interval): CdsLocus | null {
  if (!index || index.chromosome !== chrom) return null;
  const matches: CdsLocus[] = [];
  for (const g of index.genes) {
    if (g[3] > start || g[4] < end) continue;
    let offset = 0;
    for (const [a, b] of g[7]) {
      if (a <= start && b >= end) {
        const first = offset + (g[5] === '+' ? start - a : b - end) + 1;
        const last = first + end - start - 1;
        matches.push({ gene: g, first, last });
        break;
      }
      offset += b - a;
    }
    if (matches.length > 1) return null;
  }
  return matches[0] ?? null;
}

export function bonusClueRange(
  chrom: string, interval: Interval, blockSize: number | undefined, index?: CdsIndex | null,
): string {
  const n = interval[1] - interval[0];
  const locus = cdsLocus(index, chrom, interval);
  const position = locus
    ? locus.gene[1] + ' CDS ' + locus.first + '–' + locus.last +
      (locus.gene[5] === '-' ? ' (− strand)' : '')
    : chrom + ':' + (interval[0] + 1).toLocaleString() + '–' + interval[1].toLocaleString();
  return position + ' · ' + n + ' bp' + (blockSize ? ' · ' + blockSize + '-base blocks' : '');
}
