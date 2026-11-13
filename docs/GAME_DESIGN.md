# GENOME — Game Design Document

Version 0.1 | Design baseline | Proposed tuning values are not final

## 1. Product vision

A portrait-first puzzle game in which players manipulate DNA letters to assemble real sequences and build a human gene collection. The core delight is moving a base around a physical-looking obstacle, completing a strand, and watching a real biological fragment become part of the player's collection. Long-term aspiration: complete the entire defined human gene catalogue. The game is single-player, fully playable offline, with no time pressure, monetised boosters or social dependency.

### Pillars

- Simple interaction, deep spatial reasoning: four bases, a consistent 9×9 footprint, swipe to rotate, meaningful gaps.
- Never the same board twice: generated masks and changing targets, not a small rotation of templates.
- Real biology, playful abstraction: authentic sequences and informative unlock cards; not a laboratory simulation.
- Visible lasting progress: every completed puzzle contributes to an identified gene or practice challenge.

## 2. Core gameplay contract

The board has 81 coordinates (row and column 0–8). Each coordinate is either playable or a hole; playable coordinates contain a DNA base (A, T, C, G) in the initial demo. Holes cannot be selected or crossed by normal movement. Each swipe acts on the maximal contiguous horizontal or vertical segment containing the tile where the gesture started. Rotate one step with wrapping inside that segment. A two-tile segment swaps; a one-tile segment cannot move. The board does not refill, fall, swap adjacent tiles by default or delete matched letters.

Example: `A T C · · G A T C`, swiping right on the first segment produces `C A T · · G A T C`. The second segment remains unchanged. `·` is a hole, not an empty tile. Vertical works identically. Swiping farther does not change the number of steps in the first release. Tap a tile and press directional controls as an alternative; keyboard arrows work in the browser.

Targets are ordered cell tracks, highlighted by outline and group number. A horizontal track reads left to right; a vertical track top to bottom unless clearly labelled otherwise. Compare the actual sequence in those cells to the target. Correctness is live feedback, not an automatic lock. Only when all groups match simultaneously does the level complete. Normal movement preserves the multiset of bases and the mask. A solved level becomes read-only until the player chooses replay or next. No move limit in the demo; optional par is informational.

## 3. Board variety and level modes

Every campaign mask must differ from every other shipped mask even after rotations/reflections. A deterministic seed, unique-mask registry and rejection loop enforce this. Use generative layout primitives (edge erosion, interior cavities, branching channels, offset islands connected by necks, diagonal bands) with variation in size/position; these are principles, not fixed templates. All playable cells are orthogonally connected in the initial campaign. Avoid excessive one-cell dead ends, near-identical silhouettes and target tracks that cannot meaningfully move. Protect all target positions; repair cells are explicit exceptions. Do not use a full board as the default repeated layout. The first tutorial may have a generous near-full layout.

| Mode | Win condition | Genomic metaphor |
|---|---|---|
| Sequencing | Match one ordered DNA track (3–9 tiles initially). | Reconstruct a known reference fragment. |
| Splicing | Match 2–3 separate labelled tracks in sequence order, then animate joining them. | Introns are removed from precursor RNA; sample tracks are illustrative, not necessarily biological exon boundaries. |
| Replication | Match two aligned tracks with complementary bases. Display paired antiparallel 5′/3′ directions. | Template-directed copying; A–T and C–G. |
| Repair | Match the reference bases beside a marked gap; reconstruct a specified missing base on win. | An unresolved assembly gap; distinct from a deletion mutation in an individual. |

In replication the displayed aligned complement of `5′ ATG 3′` is `3′ TAC 5′`; the complementary sequence written in its own 5′→3′ orientation is `CAT`. Only the source strand counts toward gene coverage. In repair, the restored tile appears in the completion animation; it does not change movement rules mid-puzzle. The source fragment includes the restored base exactly once.

Later modes (not required in M1/M2): real exon junction challenges derived from annotations; translation into amino acids with a codon table; repetitive sequence challenges; epigenetic locks; genuine multi-fragment assembly. Translation must handle stop codons correctly and distinguish DNA from RNA; no claim that methylation physically immobilises DNA.

## 4. Tutorial and initial campaign

A twelve-level demo: six challenges for INS, six for HBB. First 51 CDS bases per gene are split into lengths 9, 9, 6, 9, 9, 9; derive targets from the verified CDS, not hardcoded unverified letters. Level selection is open in the demo so the owner can test all mechanics. Production chapters unlock in order, with later gene selection from a map.

| Level | Gene | Mode | Layout intent | Source bases (0-based half-open) |
|---|---|---|---|---|
| 1 | INS | Sequencing | Near-full, horizontal target, one useful swipe | [0,9) |
| 2 | INS | Splicing | Cavities, three short tracks | [9,18) |
| 3 | INS | Replication | Paired horizontal tracks | [18,24) |
| 4 | INS | Repair | Interior hole beside target | [24,33) |
| 5 | INS | Sequencing | Vertical track, narrow passage | [33,42) |
| 6 | INS | Splicing | Mixed horizontal and vertical tracks | [42,51) |
| 7 | HBB | Sequencing | Asymmetric cut-outs | [0,9) |
| 8 | HBB | Splicing | Offset cavities | [9,18) |
| 9 | HBB | Replication | Paired vertical tracks | [18,24) |
| 10 | HBB | Repair | Different gap placement | [24,33) |
| 11 | HBB | Sequencing | Branching corridor | [33,42) |
| 12 | HBB | Splicing | Multi-region finale | [42,51) |

Tutorial introduces swipe with a visual gesture cue and a one-move solution, then holes and splicing in context. Target outlines use group numbers and accessible contrast. Completion should provide a short, skippable sequence animation and show the exact number of source bases added. Six sample challenges unlock a **gene discovery card**, not a fully assembled gene.

## 5. Production progression: full gene assembly without tedium

The demo deliberately samples real coding sequences. The real campaign must preserve the user's ambition of completing actual genes without repeating the same nine-letter task indefinitely.

**Proposed approach, validate in M4:** start with individual bases, introduce codon tiles (3 bases), then multi-base fragment tiles (e.g. 6–30+ bases). The 9×9 geometry and segment rotation never change. Tiles display bases when readable; longer fragments get short visually distinct IDs, a preview and tap-to-inspect sequence. A token carries its exact sequence and source provenance. Goal equality uses its sequence, not its arbitrary label; use consistent IDs for equal sequences. Filler fragments are clearly separate from the reference. CRISPR and polymerase must have explicit restricted rules on long tokens (defer until tested).

Partition each selected transcript's CDS into ordered, non-overlapping intervals. Choose tile granularity adaptively so a gene has a varied, reasonably short chapter (initial target 6–12 puzzles where practical; long genes may require longer chapters). Preserve coding order and exact lengths; no bases disappear into an implicit auto-fill. If an interval is played with the other strand as well, count it once. Track interval union coverage; unlock 'assembled' only at 100%. Show both challenge progress and exact CDS base coverage. Replays and overlapping practice puzzles cannot add duplicate coverage. Optional base-by-base laboratory mode can offer extra detail but is not required for the main campaign.

Long-term scale is a major open problem: roughly 20k protein-coding genes × even a few minutes per gene implies years of play. Offer gene/chromosome milestones, curated routes, short sessions, gene search and transparent catalogue progress. Do not quietly replace full assembly with sample completion. If playtests show that a full completion goal is impractical, propose a separate fast discovery route and a full assembly route with separate labels, then obtain owner agreement.

### Collection and campaign victory

- Discovery card: gene symbol, accessible name, short verified function, chromosome, transcript accession/version, source link and discovery/assembly status.
- Gene detail: assembled intervals, percentage, optional full reference view clearly distinguished from player-assembled DNA, protein/codon view later.
- Chromosome view: 1–22, X, Y and mitochondrial DNA if included in the pinned catalogue. Not a literal map of one person's genome. Separate curated themed collections (vision, metabolism, oxygen transport, repair etc.).
- Victory: all entries in the chosen pinned protein-coding catalogue are fully assembled. Display catalogue release and denominator. Non-coding genes, alternate transcripts and full genomic loci are optional subsequent campaigns, not quietly counted as finished. No personal DNA upload.

## 6. Enzyme power-ups

M3: CRISPR, Ligase, Scaffold. They are optional and undoable. Levels remain solvable without spending boosters. Early tutorials grant one free use of each. Default economy for playtesting: 2 starting energy per level; +1 for each reference codon first completed in its designated track by a normal move; no credit for initially matched codons, duplicates or complementary strand. Credit ledger survives undo within an attempt. Demo uses level-local energy, resets to starting value and a new ledger on retry but does not create persistent credits; later persistent unlocks tracked separately. For demo simplicity, cap energy at 9. Energy numbers are proposed, tune after playtest.

| Power | Cost | Effect | Biological inspiration |
|---|---:|---|---|
| CRISPR | 4 | Select any playable unlocked single-base tile, choose A/T/C/G, replace it. Same-base edits are no-ops. | Engineered targeted editing; not a natural human gene or direct Cas9 substitution. |
| Ligase | 2 | Bond one completely correct, contiguous three-base target codon. Locked cells stop segment rotation in both axes; release the bond for free. | Ligase seals breaks in DNA; immobility is a game metaphor. |
| Scaffold | 3 | Pick a contiguous 1–2-cell gap between two playable segments along one axis. For the next 3 successful normal rotations, those segments form one cyclic track, skipping the holes. | Genome assembly scaffolding spans unresolved sequence gaps. |

Only one scaffold or ligase bond active at a time in initial implementation; scaffold cannot cross a locked cell. Preview effect before confirmation, show energy and remaining turns. Power activation consumes a turn for scoring but does not tick scaffold duration; successful normal rotations do. Invalid/cancelled actions cost nothing. No power-up can edit reference data, change hole layout permanently or inflate coverage. Undo restores previous board, locks, scaffold and energy transaction; the codon reward ledger must remain non-farmable (see architecture). Free release and restart are always available. Hint system must cope with edits and new movement rules; do not present a stale inverse scramble as valid. If necessary offer undo to a certified state or a free restart rather than a fake hint.

Future powers, not in M3: polymerase creates a complementary base in an adjacent tile; recombinase swaps any two tiles; mismatch repair corrects a near-complete target. Combinations and upgrades are backlog items; test individual mechanics first.

### Unlocks

Later, completing LIG1 can permanently unlock Ligase, POLA1 or another verified polymerase gene can unlock Polymerase. CRISPR is an engineered lab discovery, not a human gene reward; Scaffold is a computational assembly tool. Initial tutorials loan abilities regardless of gene progress. No purchases, loot boxes or forced ads.

## 7. UX and presentation

Portrait-first dark scientific laboratory style, clean and readable. A mint green, T rose, C blue, G gold; always include letters and outline/number target groups. No dependence on hue alone. Board fits small phones with full 9×9 grid; controls and power-up targets accessible, no clipped panels or accidental browser page scroll during swipes. Game screen: gene/chromosome, chapter/coverage, target sequence, board, move counter, undo/hint/restart, power tray. Separate level map and collection views. Respect safe areas and orientation changes.

Use actual sliding animations (tiles travel along the segment and wrap with a short edge transition), not just colour swaps; target 120–180 ms as a starting point. Animate completed fragments merging into strand, then short gene card reveal. Optional haptics and sound with independent toggles, reduced motion mode, text scale and keyboard support. No flashing. Pause input during transitions; queue at most one move or ignore consistently. Keep game responsive and let players skip celebrations. No timers for normal levels.

## 8. What success looks like

First-time player understands swipe and target in under a minute (playtest hypothesis), completes several different puzzles before learning power-ups, and can clearly explain what a gene unlock means. Target 30–120 seconds per early puzzle and an early discovery reward in minutes, not guarantees. Track observations manually in playtests: time, mistaken swipes, hint use, no-op moves, restart, repeated frustration, enjoyment and perceived layout variety. Do not add telemetry infrastructure. The owner decides when the mechanic is fun enough to scale.
