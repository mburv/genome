# GENOME repository instructions

## Product invariants
- Single-player, offline-first mobile puzzle game. No backend, multiplayer, account, remote analytics, purchases, or network dependency at play time unless the owner explicitly changes scope.
- The board is always 9×9. Every shipped campaign level has a unique active-cell mask (including under rotation/reflection); holes interrupt contiguous segment movement. Swipe rotates one segment one step with wrap. No match-three gravity or automatic refill unless approved as a new mode.
- Targets use verified human reference sequences; never generate biological sequences with an LLM. Random filler is allowed but is not reference DNA. Sample completion is not full-gene completion.
- Preserve the prototype's sequencing, split-fragment splicing, complementary replication and repair mechanics. Biological metaphors must be labelled as such.
- Keep accessibility, touch reliability and recovery from mistakes as product features, not optional polish.

## Engineering workflow
- Work only on the requested milestone. Read the relevant sections of `docs/GAME_DESIGN.md`, `docs/ARCHITECTURE.md`, `docs/GENOMICS.md` and `docs/ROADMAP.md` as needed. `docs/DECISIONS.md` records unresolved design choices. If a proposed change conflicts with an invariant, stop and surface the tradeoff.
- Use strict TypeScript and pure, deterministic engine functions; no DOM, React, time, network or global randomness in the engine. UI dispatches commands; rules live in the engine. Inject seeded RNG and persistence. Keep code simple and dependency count small.
- Add regression tests for every rules change. Run typecheck, lint, unit tests, relevant integration tests and build before reporting completion. Do not claim tests or devices were checked unless actually run; report failures and blockers explicitly.
- Generate from a solved state, scramble with legal moves and retain a replayable certificate. Reject unsolvable, pre-solved, duplicate or invalid levels. A reverse scramble is a solution, not proof of optimality.
- Save format, generator version and data release are versioned. Never invalidate a user's progress silently. Power-ups, hints and undo must not create unwinnable states or duplicate rewards.
- Do not use live user genetic data. No clinical or diagnostic claims. Source provenance must accompany all shipped reference sequences and biological cards.
- Prefer small reviewable patches; keep the legacy HTML unchanged. Do not commit, push, publish, add credentials or deploy unless requested. Document any material decision not covered by the spec.
- At task end, report changed files, exact verification commands/results, remaining limitations and the next suggested milestone; update the decision log if needed.
