# Genomics data specification

## Scope and provenance

The first production catalogue is a pinned release of human nuclear protein-coding genes with one representative complete CDS per gene, preferably MANE Select on GRCh38. MANE Select provides representative transcripts with matched RefSeq and Ensembl/GENCODE annotation. It is not a complete definition of every gene or every human genome. Do not assume a fixed total, coverage of every protein-coding gene, or that every record is on the primary assembly. Select a release and produce a manifest of included, excluded and exception records before defining the campaign denominator. For missing MANE genes, define and document a curated fallback (e.g. RefSeq Select), or explicitly list exclusions. Mitochondrial genes, non-coding genes, alternative transcripts, pseudogenes and full genomic loci need separate policies; do not silently mix them into the initial catalogue.

### Source links

- NCBI MANE project and release links: https://www.ncbi.nlm.nih.gov/refseq/MANE/
- NCBI RefSeq: https://www.ncbi.nlm.nih.gov/refseq/
- INS transcript variant 1: https://www.ncbi.nlm.nih.gov/nuccore/NM_000207.3
- HBB transcript: https://www.ncbi.nlm.nih.gov/nuccore/NM_000518.5
- NHGRI intron glossary: https://www.genome.gov/genetics-glossary/Intron
- NHGRI exon glossary: https://www.genome.gov/genetics-glossary/Exon
- GENCODE human releases: https://www.gencodegenes.org/human/
- Ensembl human genome: https://www.ensembl.org/Homo_sapiens/Info/Index

MANE publication: Morales et al., *A joint NCBI and EMBL-EBI transcript set for clinical genomics and research*, Nature (2022), DOI 10.1038/s41586-022-04558-8. Include the dataset's required attribution, release information and applicable data redistribution terms in the shipped app. Verify terms per source; do not assume that every downloaded image or annotation is licensed for redistribution. Use original art or properly licensed assets.

## First two genes

| Symbol | Gene ID | Chromosome | Prototype transcript | Expected CDS length incl. stop | Role |
|---|---:|---|---|---:|---|
| INS | 3630 | 11 | NM_000207.3 | 333 | Insulin precursor, glucose regulation |
| HBB | 3043 | 11 | NM_000518.5 | 444 | Beta-globin subunit of haemoglobin |

The first build must retrieve or use verified local copies of these exact versioned records, extract the annotated CDS (not full transcript FASTA, which includes untranslated regions), verify lengths and store checksums. The legacy HTML strings are an unvalidated reference until checked against records. Do not swap to a different isoform silently. If the source is unavailable, report the data blocker and use explicitly synthetic fixtures only for engine tests; do not ship them as authentic human DNA.

## Import pipeline

1. Pin source URLs, release identifier, assembly accession/version, retrieval date and raw SHA-256. Store raw input in a reproducible data cache (exclude huge files from git if necessary; provide fetch script and checksum). Follow provider terms and rate limits. Network access is build-time only.
2. Parse GenBank CDS features or release GFF/GTF + transcript FASTA. Respect strand, exon order, compound locations, transcript version and CDS phase. When extracting directly from genomic coordinates reverse-complement negative-strand segments and concatenate in transcript order. Prefer curated transcript CDS when available. Never just take a genomic substring spanning introns.
3. Normalise uppercase DNA alphabet (T, not U). Preserve exact transcript orientation 5′→3′. Adopt one documented stop-codon convention; target include terminal stop for complete ordinary CDS. Some annotation formats represent stop separately; validate rather than append indiscriminately.
4. Cross-check expected length, full sequence checksum and translation against annotated protein where available. A canonical nuclear CDS generally has length divisible by three and a terminal stop; exceptions (selenocysteine, noncanonical starts/stops, incomplete CDS, ambiguous bases, programmed frameshifts, mitochondrial code) require explicit exception policy and validation rather than silent repair. Exclude unresolved exceptions from initial catalogue with reasons; report counts.
5. Emit deterministic manifest and per-gene asset (compressed or sharded later). Stable NCBI Gene ID or Ensembl gene ID with explicit crosswalk; do not key by symbol alone. Include transcript accession+version, assembly, source release, CDS length, sequence SHA-256, exon CDS offsets if verified, chromosome, biotype, brief function and source links. Source coordinates and genomic strand are distinct from CDS offsets. Do not infer real exon junctions from arbitrary three-base puzzle chunks.
6. Generate targets by slicing verified CDS offsets; compare their concatenation to exact reference intervals. Validate every level and catalogue coverage at build time. Bundle only immutable, verified assets. No runtime genomic requests.

Illustrative manifest record:

```json
{
  "geneId": "NCBIGene:3630",
  "symbol": "INS",
  "chromosome": "11",
  "transcript": "NM_000207.3",
  "biotype": "protein_coding",
  "assembly": "GRCh38",
  "cdsLength": 333,
  "sequence": "<verified CDS omitted here>",
  "sequenceSha256": "<computed by importer>",
  "sourceUrl": "https://www.ncbi.nlm.nih.gov/nuccore/NM_000207.3",
  "datasetId": "<pinned release>"
}
```

## Biological language and safeguards

- DNA bases A/T/C/G; RNA uses U instead of T. Exons are retained in mature transcript and can include UTRs. Introns are real intervening sequence, not empty space. In the game a hole is a visual abstraction of splicing or missing assembly information, depending on mode.
- Replication: antiparallel complement. A pairs with T; G with C. An aligned complement is not the reverse complement in 5′→3′ order.
- Repair: reference assembly gaps are missing information; deletions are biological sequence variants. Do not imply a reference allele is necessarily healthier or that all variants are errors.
- Gene collection represents a reference catalogue, not a person's genome, health or traits. No diagnostic predictions, personal sequences or genetic testing.
- Ligase joins DNA, polymerase synthesises DNA, recombinase facilitates rearrangement, mismatch repair corrects certain mismatches. CRISPR is an engineered editing metaphor rooted in microbial systems; scaffolding is computational assembly. Avoid overstating literal mechanics.
- 'Protein-coding sequence assembled' means exact full selected CDS coverage. 'Discovered' means curated sample challenges completed. Neither implies synthesis of a molecule, full genomic locus coverage or completion of an entire human genome.

## Data validation acceptance

For INS/HBB, verified annotated CDS length and terminal stop, correct orientation, exact sequence and checksum, first 51 bases sliced into six fragments whose concatenation equals original prefix; complement not counted twice; repair final base counted once; no duplicate intervals on replay. Full assembly test concatenates all intervals and equals full reference CDS byte-for-byte. Catalogue importer emits counts by biotype, inclusion/exclusion reason, chromosome, source release and exceptional records. Dataset upgrades are opt-in migration decisions and preserve existing save data.
