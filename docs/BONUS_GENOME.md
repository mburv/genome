# Human Genome bonus campaign

The main Famous Genes pack, its IDs, datasets, and progression are unchanged. Completing every non-lab main stage unlocks a separate bonus catalogue. Progress is additive to the existing save, keyed by versioned Ensembl gene locus ID, and only records completed stages.

## Reference scope and sampling

Pinned GENCODE v48 comprehensive primary-assembly GTF and GRCh38 primary-assembly FASTA (chromosomes and scaffolds). Each annotated gene locus is represented exactly once except the main campaign symbols, which are reconciled and counted separately. Alternative haplotypes and patches are excluded to avoid alternate copies of the same locus. No intergenic DNA is included. Each bonus gene has a contiguous, strand-oriented, unambiguous genomic reference sample of up to 90 bases. This is not a full CDS or full genomic gene assembly. Short genes receive fewer stages.

Source: https://www.gencodegenes.org/human/release_48.html

The importer records archive SHA-256 checksums, exact one-based sample coordinates, strand, gene ID, symbol and biotype. It fails on a missing contig, absent reference bases, duplicate gene ID, unreconciled main genes or incomplete catalogue. No biological sequence is generated. Runtime is offline: catalogue is bundled at build time. Run npm run prepare:bonus to generate it locally (large one-time reference download). The verification workflow caches the generated catalogue.

## Progress and mechanics

One to three sequential stages per gene: single-base DNA tracing, 3-base mutation correction and 6-base genome assembly. Exact reference fragments are partitioned across stages; completion requires the engine's extracted sequence to match the sample. Every certificate is replayed in verification. No full-gene assembly or coding-coverage claims are made in the bonus campaign. Main and bonus completion remain separate. Search/filter/pagination bound the catalogue DOM. Bonus attempts restart on leaving the puzzle; completed stages survive reload. The same engine and graphical controls are reused. Bonus boards reuse mechanic-specific layouts; they do not introduce new classic sliding boards or alter the main campaign's unique masks.
