# Decision log

## Confirmed by the owner in conversation

- D001: Single-player only; no multiplayer development capacity.
- D002: 9×9 DNA sliding puzzle, assemble authentic human genes; long-term goal all genes.
- D003: Every board unique, with meaningful cut-outs/holes and varied shapes rather than repeated templates.
- D004: Adopt v2 direction: contiguous segment rotation with gaps interrupting movement; sequencing, splicing, replication, repair; varied target positions.
- D005: Develop the real game using Codex; the v2 inline prototype was positively received. The discussion about power-ups was also positively received, but the exact costs, rules and rollout remain design proposals.

## Proposed defaults (not explicitly mandated)

- P001: GENOME working title, tagline 'Build what makes you human.' No trademark search completed.
- P002: TypeScript/React/Vite and Capacitor later; validate mobile experience before native framework commitment.
- P003: 12-level sample demo, then full CDS chapters; progressively larger sequence tokens to preserve exact coverage without excessive repetitive puzzles.
- P004: Main production target is a pinned representative human protein-coding catalogue. Clarifies but does not exhaust the original 'all genes' vision. Noncoding/other scopes future, owner review required before final release claim.
- P005: Canonical uniqueness under all rotations/reflections; connected boards; no normal movement across holes; no timer or move limit initially.
- P006: First powers CRISPR, Ligase, Scaffold; level-local energy, proposed costs and effects in GDD. No purchases.
- P007: Offline save/export, no account or analytics, iOS first packaging (web development first), Android later if desired.

## Open design risks / owner review

- Q001: Full-catalogue playtime: even very short gene chapters imply an extremely long campaign. Test token compression and optional discovery routes; never conflate discovery with assembly.
- Q002: Long DNA tiles may feel like generic symbols rather than DNA. Test readable previews, labels, sequence-based equality and whether players enjoy them.
- Q003: Is unique-mask geometry enough? Test target/move diversity, puzzle difficulty and power-ups. Solvable is not necessarily fun.
- Q004: Energy curve, booster balance and combinations; no final costs until playtesting.
- Q005: Dataset inclusion, MANE gaps, release/version policies and redistribution attribution; import and verify actual records. No current full catalogue has been downloaded or validated in this starter pack.
- Q006: Full scope of 'all genes', iOS vs Android launch, final art direction, audio, monetisation (none by default), accessibility and name clearance. Resolve before store release, not before M1.

When a proposed rule changes, record date, change, rationale and impact on existing saves/levels. Do not treat an AI-generated design proposal as owner approval.

## M1 implementation decisions (13 Nov 2026) — accepted by owner after playtest, 13 Nov 2026

- D-M1-01: Stack as P002 (TypeScript strict, React, Vite, Vitest, Playwright, ESLint). Boards are 81-character strings (`A/T/C/G`, `.` = hole) because M1 uses single-base tokens only; M4 multi-base tokens will need a token array. Impact: none on saves yet (schema v1).
- D-M1-02: The three M1 sequencing levels use INS CDS intervals [0,9), [9,18), [18,27). The GDD 12-level table assigns [9,18) to splicing and [18,24) to replication; M2 will re-map. M1 level ids are `m1-ins-01..03`, so M2 levels will not collide; completed M1 ids may need a migration note in M2.
- D-M1-03: Level pack is generated at build time from explicit seeds (`scripts/generate-levels.ts`) and pinned as JSON; a test proves regeneration is byte-identical. Generator version `m1-gen-1`.
- D-M1-04: Mask rules: connected, no immobile cells, every row/column keeps ≥3 playable cells, ≤2–4 dead ends, active-cell ranges per level (tutorial 70–78, others 56–70), canonical uniqueness over all 8 dihedral transforms and min symmetric Hamming distance 8 between any two levels.
- D-M1-05: Certificates are the inverse scramble, then greedily pruned of moves not needed for a win (so the first hint is never a filler-only move). Labelled "estimated", not optimal.
- D-M1-06: Recovery hint = inverse of the last move on a certified path from the generated solved board; any player move that revisits a state on that path truncates it (handles inverses, aliases and full-circle cycles). Hint is verified against the current board before display.
- D-M1-07: Input during the 150 ms slide animation is ignored (not queued). Undo history capped at 100 snapshots. Undo/hint disabled on a solved board; Restart doubles as Replay. Completion credit is a set of level ids (idempotent; replays add nothing).
- D-M1-08: Keyboard: arrow keys slide the selected tile's segment; Shift+arrow moves the selection. Level selection is open (GDD demo rule).
- D-M1-09: Save: localStorage key `genome-save`, schema v1, includes generator version + dataset id. Unreadable/unknown-version saves and invalid boards are backed up to `genome-save-backup` and reported to the player; completions are kept when the level still exists.

## Continuous drag (13 Nov 2026, from owner playtest feedback)

- D-M1-10: Owner feedback: "the whole row should drag with my finger the whole way across". Touch/mouse input is now a continuous drag: after 8 px the gesture locks to the dominant axis; the whole hole-bounded segment follows the finger live, wrapping inside a clipped strip so nothing crosses holes. A one-cell segment does not move on that axis. Rendering is transform-only on rAF; React only updates on whole-cell preview changes and commit.
- D-M1-11: Release snaps to the nearest whole cell (110 ms ease-out; instant with reduced motion). A quick flick (≥0.45 px/ms) that hasn't reached half a cell commits one step; long drags get no velocity bonus so deliberate placements are never overshot. Net rotation is normalised mod segment length to the shortest signed equivalent; net 0 (back to origin or a full turn) is a no-op: no move counted, no undo entry.
- D-M1-12: **One drag = one undoable action and counts as ONE move**, however many cells it travels (keeps long drags from feeling penalised, matches "fast paced"). Arrow buttons, keyboard and hints remain single-step and also count one move each. Engine command `slide {origin, axis, steps}`; the recovery path is extended one single step at a time so hints/certificates remain valid after multi-step drags. Target feedback (strip ticks, outline glow) previews the snapped position live during the drag; completion is only checked on commit. Save schema unchanged (v1).

**M1 accepted (13 Nov 2026).** Owner playtest passed. The continuous drag (D-M1-10..12) is owner-approved: "It feels great. Move onto M2". D-M1-01..12 stand unless replaced below.

## M2 implementation decisions (13 Nov 2026) — accepted by owner after playtest, 13 Nov 2026

- D-M2-01: HBB data is RefSeq NM_000518.5 (MANE Select, GeneID 3043), fetched from NCBI E-utilities, raw record pinned in `data/raw/` with SHA-256. CDS 51..494 = 444 bases including the TAA stop; translation matches /translation (NP_000509.1, 147 aa). The importer is now generic (`scripts/import-genes.mjs`, config in `scripts/genes.config.mjs`); INS is unchanged (byte-identical asset).
- D-M2-02: Campaign = GDD 12-level table: per gene, CDS intervals [0,9) sequencing, [9,18) splicing, [18,24) replication, [24,33) repair, [33,42) sequencing, [42,51) splicing → exactly 51 sample bases per gene. Level ids `ins-01..06`, `hbb-01..06`. Generator `m2-gen-1`.
- D-M2-03: Splicing = 2–3 coding tracks that tile the interval in source order (numbered 1..3, may mix orientations). The split is illustrative and is labelled "not real exon boundaries".
- D-M2-04: Replication = template (coding, read 5′→3′) plus its **aligned** complement (A↔T, C↔G, same position, read 3′→5′) placed immediately below (horizontal) or to the right (vertical). Only the template interval counts toward coverage, so complement work never inflates base counts.
- D-M2-05: Repair = two coding tracks on one line with the gap cell between them. The gap is a forced hole in the mask (blocks movement like any hole) and shows "?"; the missing base (from the CDS) is shown on the board and the target panel only after the win. It is described as a reference gap, not a mutation.
- D-M2-06: Difficulty is measured in the drag metric (one move = rotate one segment by any k), matching D-M1-12. Scrambles use whole drags biased towards target segments; certificates are the inverted scramble, pruned drag by drag. Every non-tutorial level must have no solution in ≤ 2 drags (exhaustive BFS proof); hbb-05/06 additionally must have none in ≤ 3 (1.5 M-node check).
- D-M2-07: Bounded solver (`src/generator/solver.ts`): BFS in the drag metric with a node budget (400 k per level at publish, 60 k in the audit). It runs only at build/audit time; results are stored per level (`metrics.solver`), so the UI never runs it. "Optimal" is shown only when proven (found, or lower bound = certificate); otherwise "≥ k (unproven)". When the solver finds a shorter solution than the certificate, that solution becomes the published certificate so hints follow an optimal path. Limit: ~140^d states, so it proves ≤ 3 drags on typical boards and cannot resolve 4–5-drag levels within budget.
- D-M2-08: Ratings (tutorial/gentle/moderate/tricky/hard) are **estimates**: score = 3 × drags (optimum if proven, else the midpoint of bound and certificate) + (tracks − 1) + wrong cells/4 + active cells/40; thresholds 10.5 / 12.5 / 15. Not player data. The pinned ramp goes from 1 → 2 → … → ≥4–5 drags (M1 was 1 / ≤3 / ≤6 single steps, i.e. ≤ 2–3 drags).
- D-M2-09: Masks: new primitives (diagonal, branch) + asymmetric option; `tidyMask` reopens a crossing neighbour for target cells that would otherwise be stuck and drops fragments disconnected from targets. Uniqueness rules unchanged (D-M1-04) and now apply across all 12 levels.
- D-M2-10: Save schema v2 (`datasets` per gene, `discovered`, `legacy.m1Completed`). v1 → v2 migration: the raw v1 save is first copied to `genome-save-backup-m1`; M1 level 1 maps to `ins-01` (same interval, same mode); M1 levels 2–3 have no identical M2 challenge, so they are kept as visible "M1 history" on the map and the player is told they need replaying for credit. Boards in progress from M1 are restarted with a notice. Nothing is dropped silently.
- D-M2-11: A gene is **discovered** when all six of its sample levels are complete. The UI always says "51 of 333/444 coding bases sampled · not yet assembled"; full assembly is M4.
- D-M2-12: Gene card text is the first 1 (INS) or 2 (HBB) sentences of the RefSeq summary in the pinned record, quoted with credit; no disease or medical claims are added.
- D-M2-13: Hints are now whole drags ("drag row 5 right 3 cells"), derived from the single-step recovery path by merging its trailing identical steps; the arrow/keyboard single steps remain. Step animations (arrows, keyboard) reuse the clipped drag strip so wrapping tiles never cross holes.
- D-M2-14: First-time players start directly in level 1; returning players land on the level map. All levels are open (demo rule, D-M1-08).

**M2 accepted (13 Nov 2026).** The owner played the live M2 build and accepted it: "Nice that was good. Move onto M3". D-M2-01..14 stand unless replaced below.

## M3 implementation decisions (13 Nov 2026, proposed — owner playtest pending)

- D-M3-01: Costs and economy are the GDD §6 playtest defaults, unchanged: CRISPR ⚡4, Ligase ⚡2, Scaffold ⚡3; start ⚡2 per level; cap ⚡9; scaffold lasts 3 rotations; scaffold gap 1–2 cells. Energy is level-local (no persistent currency). Tune only after the owner's with/without-powers playtest.
- D-M3-02: Powers are available from campaign level 4 (index 3, `POWERS_FROM_INDEX`) and in the Enzyme lab. Levels 1–3 stay pure sliding so players learn the core mechanic first (GDD §8). Every level remains certified solvable without powers (unit test walks every level by certified hints with no powers used).
- D-M3-03: Reward codons are in-frame triples ((CDS offset) mod 3 = 0) lying wholly inside one coding track. +1 the first time a codon becomes correct after a **normal** move. Codons already correct at the start are pre-credited (no reward); codons completed by CRISPR are marked credited with no reward; the complementary strand (replication) never earns. Frame-crossing pieces earn nothing (keeps the reward tied to real codons).
- D-M3-04: Ledger semantics: per attempt, `{earned, credited}` is append-only and survives undo (so undo→redo cannot farm). Spending is a reversible snapshot field: undo of a power refunds it exactly. Restart starts a new attempt (fresh ledger, ⚡2). `available = min(9, 2 + earned − spent)`; paying sets the balance to `capped − cost`, so energy earned above the cap is discarded and can never be spent later.
- D-M3-05: Invalid, cancelled, unaffordable and same-base actions are rejected by the pure engine with a reason, change nothing and cost nothing (no move, no energy, no undo entry). The UI previews every power through the engine (`applyCommand` on a copy) and spends only on Confirm.
- D-M3-06: CRISPR edits any playable, unlocked tile to A/C/G/T. Same base = `same-base` no-op. Each edit raises an `edits` counter that lets save validation accept a board whose base multiset differs from the level by at most `edits` substitutions. The certified recovery path is dropped after an edit (hints switch to search, see D-M3-09).
- D-M3-07: Ligase bonds exactly one complete, correct reward codon (tap any of its tiles). Locked cells behave as holes for every segment on both axes; dragging a locked tile is rejected (`locked`). One bond at a time; it may not overlap an active scaffold. Release is free (no move, no energy) and undoable; undo of the bond refunds it.
- D-M3-08: Scaffold joins the two segments on either side of a 1–2-cell contiguous gap along one axis into one cyclic track that skips the gap (cannot cross a locked cell). Activation counts as a move but does not tick; every successful normal rotation anywhere ticks it; after exactly 3 it expires (`scaffold-expired` event, status message). One scaffold at a time. Undo restores the scaffold and its remaining count. Drags along a scaffold glide across the gap visually.
- D-M3-09: Hints are never invalid. Order: (1) the certified recovery drag when the board is on the certified path and the topology for that segment is unchanged — or "release the bond (free)" when a bond blocks it; (2) a bounded BFS from the current board under current locks/scaffold (depth ≤ 3 drags, 40,000 nodes ≈ 150–180 ms on a desktop CPU; run after a "Thinking…" paint), verified through `applyCommand`; (3) "Undo ×N" back to the newest certified snapshot without a scaffold; (4) free restart. A bad CRISPR edit is therefore always recoverable (e2e test).
- D-M3-10: "Early tutorials grant one free use of each" is implemented as an optional **Enzyme lab** of three generated tutorial levels (lab-crispr: HBB [0,9) sequencing; lab-ligase: INS [9,18) splicing; lab-scaffold: INS [0,9) sequencing with a guaranteed scaffoldable gap). Each lends one free use of its power (refunded on undo, re-granted on restart), adds no coverage and is excluded from discovery and the 12-level count. They reuse campaign intervals of the pinned RefSeq data — no new DNA. The 12 campaign levels are byte-identical to M2 (generator `m2-gen-1` unchanged; campaign id `genome-m3-lab`).
- D-M3-11: Save schema v3: attempts gain `locks`, `scaffold`, `spent`, `freeUses`, `edits` (per snapshot) and `ledger`; settings gain `sound` (default off) and `haptics` (default on). v2 → v3: the raw save is copied to `genome-save-backup-m2`, every completion, discovery and M1 history is kept, boards in progress are upgraded in place (codons already completed by normal moves are credited as earned, capped), and the player sees "All your progress was kept." v1 → v3 still works via v2.
- D-M3-12: Feedback: sound is synthesised locally with Web Audio (no audio files, no network); haptics use `navigator.vibrate` where supported (not on iOS Safari — the settings screen says so). Settings screen (⚙) holds Reduce motion (forced on when the OS asks for it), Sound, Haptics and Reset progress.
- D-M3-13: The generator audit now covers all 15 specs and writes `docs/AUDIT_M3.md` / `docs/audit-m3.json`; `docs/AUDIT_M2.md` is kept as the frozen M2 record.

