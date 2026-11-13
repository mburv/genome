// Curated catalogue candidates (M4). Build-time only.
// Each candidate is resolved to its MANE Select RefSeq transcript (NCBI Datasets product report),
// fetched as GenBank (E-utilities) and fully verified by scripts/import-genes.mjs before inclusion.
// The shipped catalogue = verified candidates that pass the inclusion policy; the count is derived
// from the emitted manifest (src/genomics/manifest.generated.json), never hard-coded.
//
// INS and HBB keep their M1/M2 pinned records and assets byte-for-byte (saves depend on them).
// `theme` drives curated collections on the map; `summarySentences` = how many sentences of the
// RefSeq summary are quoted on the gene card.
export const CATALOGUE_ID = 'genome-m4-catalogue-1';
export const CATALOGUE_RELEASE = 'GENOME M4 curated catalogue 1 (RefSeq MANE Select records retrieved via NCBI, pinned in data/raw/)';
/** Inclusion policy: the current token tiers (3–24 bases) keep chapters ≤ 10 puzzles up to this CDS length (largest tier holds 1,131 bp; see src/campaign/chapters.ts). */
export const MAX_CDS_FOR_CHAPTER = 1100;

export const CANDIDATES = [
  { symbol: 'INS', geneId: '3630', theme: 'Hormones', summarySentences: 1, pinned: { accession: 'NM_000207.3', name: 'Insulin', out: 'src/genomics/ins.generated.json' } },
  { symbol: 'HBB', geneId: '3043', theme: 'Oxygen transport', summarySentences: 2, pinned: { accession: 'NM_000518.5', name: 'Beta-globin', out: 'src/genomics/hbb.generated.json' } },
  { symbol: 'HBA1', geneId: '3039', theme: 'Oxygen transport', summarySentences: 1 },
  { symbol: 'HBD', geneId: '3045', theme: 'Oxygen transport', summarySentences: 1 },
  { symbol: 'MB', geneId: '4151', theme: 'Oxygen transport', summarySentences: 1 },
  { symbol: 'GCG', geneId: '2641', theme: 'Hormones', summarySentences: 1 },
  { symbol: 'LEP', geneId: '3952', theme: 'Hormones', summarySentences: 1 },
  { symbol: 'PTH', geneId: '5741', theme: 'Hormones', summarySentences: 1 },
  { symbol: 'NPY', geneId: '4852', theme: 'Hormones', summarySentences: 1 },
  { symbol: 'TTR', geneId: '7276', theme: 'Transport & immunity', summarySentences: 1 },
  { symbol: 'B2M', geneId: '567', theme: 'Transport & immunity', summarySentences: 1 },
  { symbol: 'RHO', geneId: '6010', theme: 'Vision', summarySentences: 1 },
  // Exception-policy probes: expected to be excluded with a recorded reason, not silently repaired.
  { symbol: 'GPX1', geneId: '2876', theme: 'Antioxidant', summarySentences: 1 },
  { symbol: 'LIG1', geneId: '3978', theme: 'DNA repair', summarySentences: 1 },
];
