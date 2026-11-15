// Curated catalogue candidates (M4). Build-time only.
// Each candidate is resolved to its MANE Select RefSeq transcript (NCBI Datasets product report),
// fetched as GenBank (E-utilities) and fully verified by scripts/import-genes.mjs before inclusion.
// The shipped catalogue = verified candidates that pass the inclusion policy; the count is derived
// from the emitted manifest (src/genomics/manifest.generated.json), never hard-coded.
//
// INS and HBB keep their M1/M2 pinned records and assets byte-for-byte (saves depend on them).
// `theme` drives curated collections on the map; `summarySentences` = how many sentences of the
// RefSeq summary are quoted on the gene card.
export const CATALOGUE_ID = 'genome-famous-genes-1';
export const CATALOGUE_RELEASE = 'GENOME Famous Genes 1 (RefSeq MANE Select records retrieved via NCBI, pinned in data/raw/)';
/** Inclusion policy: the current token tiers (3–24 bases) keep chapters ≤ 10 puzzles up to this CDS length (largest tier holds 1,131 bp; see src/campaign/chapters.ts). */
export const MAX_CDS_FOR_CHAPTER = 15000;

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
  // Explicitly supported selenocysteine and long-CDS genes.
  { symbol: 'GPX1', geneId: '2876', theme: 'Antioxidant', summarySentences: 1 },
  { symbol: 'LIG1', geneId: '3978', theme: 'DNA repair', summarySentences: 1 },
  { symbol: 'MC1R', geneId: '4157', theme: 'Pigmentation', summarySentences: 1 },
  { symbol: 'TAS2R38', geneId: '5726', theme: 'Taste', summarySentences: 1 },
  { symbol: 'OPN1LW', geneId: '5956', theme: 'Vision', summarySentences: 1 },
  { symbol: 'APOE', geneId: '348', theme: 'Transport & immunity', summarySentences: 1 },
  { symbol: 'KRAS', geneId: '3845', theme: 'Cancer', summarySentences: 1 },
  { symbol: 'EPO', geneId: '2056', theme: 'Hormones', summarySentences: 1 },
  { symbol: 'GH1', geneId: '2688', theme: 'Hormones', summarySentences: 1 },
  { symbol: 'SRY', geneId: '6736', theme: 'Development', summarySentences: 1 },
  { symbol: 'BDNF', geneId: '627', theme: 'Brain & behaviour', summarySentences: 1 },
  { symbol: 'TP53', geneId: '7157', theme: 'DNA repair & cancer', summarySentences: 1 },
  { symbol: 'ACTN3', geneId: '89', theme: 'Muscle', summarySentences: 1 },
  { symbol: 'BRCA1', geneId: '672', theme: 'DNA repair & cancer', summarySentences: 1 },
  { symbol: 'BRCA2', geneId: '675', theme: 'DNA repair & cancer', summarySentences: 1 },
  { symbol: 'CFTR', geneId: '1080', theme: 'Ion transport', summarySentences: 1 },
  { symbol: 'FOXP2', geneId: '93986', theme: 'Brain & behaviour', summarySentences: 1 },
  { symbol: 'HTT', geneId: '3064', theme: 'Brain & behaviour', summarySentences: 1 },
  { symbol: 'DMD', geneId: '1756', theme: 'Muscle', summarySentences: 1 },
];
