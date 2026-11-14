import insAsset from './ins.generated.json';
import hbbAsset from './hbb.generated.json';
import catalogueAsset from './catalogue.generated.json';
import manifestAsset from './manifest.generated.json';

/**
 * Verified reference coding sequences, imported at build time from pinned RefSeq records by
 * scripts/import-genes.mjs (annotated CDS, length, frame, terminal stop and translation checked
 * against the record's protein). Reference sequences only — not anyone's genome. No runtime network access.
 */
export interface GeneAsset {
  datasetId: string;
  geneId: string;
  symbol: string;
  name: string;
  /** Official full name, verbatim from the pinned GenBank record (gene /note, else CDS /product). */
  fullName: string;
  /** Where `fullName` was taken from, e.g. "NCBI RefSeq gene /note in NM_000207.3". */
  fullNameProvenance: string;
  chromosome: string;
  transcript: string;
  protein: string;
  biotype: string;
  keywords: string;
  definition: string;
  functionSummary: string;
  functionSummaryCredit: string;
  cdsLocation: string;
  cdsLength: number;
  stopCodonIncluded: boolean;
  sequence: string;
  sequenceSha256: string;
  translationVerified: boolean;
  proteinLength: number;
  sourceUrl: string;
  retrievalUrl: string;
  retrievedAt: string;
  rawRecordSha256: string;
}

export interface ManifestEntry {
  symbol: string;
  geneId: string;
  name: string;
  fullName: string;
  fullNameProvenance: string;
  chromosome: string;
  theme: string;
  transcript: string;
  protein: string;
  biotype: string;
  cdsLength: number;
  sequenceSha256: string;
  datasetId: string;
  sourceUrl: string;
}

/** Pinned catalogue manifest (scripts/import-genes.mjs): included and excluded records with reasons. */
export interface Manifest {
  catalogueId: string;
  release: string;
  policy: string;
  attribution: string;
  candidates: number;
  included: ManifestEntry[];
  excluded: { symbol: string; geneId: string; verified: boolean; reason: string }[];
  counts: { included: number; excluded: number; totalCdsBases: number; byChromosome: Record<string, number>; byTheme: Record<string, number> };
}

export const MANIFEST: Manifest = manifestAsset;
export const INS: GeneAsset = insAsset;
export const HBB: GeneAsset = hbbAsset;
/** Every included catalogue gene by symbol (INS/HBB keep their M1/M2 assets). */
export const GENES: Record<string, GeneAsset> = Object.fromEntries([INS, HBB, ...(catalogueAsset.genes as GeneAsset[])].map((g) => [g.symbol, g]));
/** The two genes of the 12-level sample campaign. */
export const GENE_ORDER = ['INS', 'HBB'] as const;
/** Catalogue order (manifest order). The catalogue size is always derived from the manifest. */
export const CATALOGUE_ORDER: readonly string[] = MANIFEST.included.map((g) => g.symbol);
export const CATALOGUE_SIZE = MANIFEST.included.length;
