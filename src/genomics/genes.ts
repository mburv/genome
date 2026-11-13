import insAsset from './ins.generated.json';
import hbbAsset from './hbb.generated.json';

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

export const INS: GeneAsset = insAsset;
export const HBB: GeneAsset = hbbAsset;
export const GENES: Record<string, GeneAsset> = { INS, HBB };
export const GENE_ORDER = ['INS', 'HBB'] as const;
