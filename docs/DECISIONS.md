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

## M1 implementation decisions (13 Nov 2026, proposed — owner review pending)

- D-M1-01: Stack as P002 (TypeScript strict, React, Vite, Vitest, Playwright, ESLint). Boards are 81-character strings (`A/T/C/G`, `.` = hole) because M1 uses single-base tokens only; M4 multi-base tokens will need a token array. Impact: none on saves yet (schema v1).
- D-M1-02: The three M1 sequencing levels use INS CDS intervals [0,9), [9,18), [18,27). The GDD 12-level table assigns [9,18) to splicing and [18,24) to replication; M2 will re-map. M1 level ids are `m1-ins-01..03`, so M2 levels will not collide; completed M1 ids may need a migration note in M2.
- D-M1-03: Level pack is generated at build time from explicit seeds (`scripts/generate-levels.ts`) and pinned as JSON; a test proves regeneration is byte-identical. Generator version `m1-gen-1`.
- D-M1-04: Mask rules: connected, no immobile cells, every row/column keeps ≥3 playable cells, ≤2–4 dead ends, active-cell ranges per level (tutorial 70–78, others 56–70), canonical uniqueness over all 8 dihedral transforms and min symmetric Hamming distance 8 between any two levels.
- D-M1-05: Certificates are the inverse scramble, then greedily pruned of moves not needed for a win (so the first hint is never a filler-only move). Labelled "estimated", not optimal.
- D-M1-06: Recovery hint = inverse of the last move on a certified path from the generated solved board; any player move that revisits a state on that path truncates it (handles inverses, aliases and full-circle cycles). Hint is verified against the current board before display.
- D-M1-07: Input during the 150 ms slide animation is ignored (not queued). Undo history capped at 100 snapshots. Undo/hint disabled on a solved board; Restart doubles as Replay. Completion credit is a set of level ids (idempotent; replays add nothing).
- D-M1-08: Keyboard: arrow keys slide the selected tile's segment; Shift+arrow moves the selection. Level selection is open (GDD demo rule).
- D-M1-09: Save: localStorage key `genome-save`, schema v1, includes generator version + dataset id. Unreadable/unknown-version saves and invalid boards are backed up to `genome-save-backup` and reported to the player; completions are kept when the level still exists.
