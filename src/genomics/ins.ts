import insAsset from './ins.generated.json';

/**
 * Verified INS coding sequence, imported at build time from RefSeq NM_000207.3 by
 * scripts/import-ins.mjs (annotated CDS, length, terminal stop and translation checked against
 * NP_000198.1). Reference sequence only — not a person's genome. No runtime network access.
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
  cdsLocation: string;
  cdsLength: number;
  stopCodonIncluded: boolean;
  sequence: string;
  sequenceSha256: string;
  translationVerified: boolean;
  sourceUrl: string;
  retrievalUrl: string;
  retrievedAt: string;
  rawRecordSha256: string;
}

export const INS: GeneAsset = insAsset;
