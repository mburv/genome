# Development roadmap

Each milestone ends with a runnable build or verified engine and an owner review. No future milestone should be implemented merely because it appears in this document. Mark actual progress only after evidence. Status as of 13 Nov 2026: M1 and M2 accepted by the owner; M3 implemented (awaiting owner playtest); M4–M6 not started.

## M1 — Core vertical slice (first Codex task)

Status: **accepted** (13 Nov 2026). The owner playtested it, asked for a continuous whole-segment drag (D-M1-10..12), approved the drag build ("It feels great") and asked to move on to M2. Not yet checked on a physical iPhone by the developer.

Build TypeScript/React/Vite skeleton, pure segment rotation engine, deterministic mask generator, solved-state scramble, three sequencing puzzles using verified INS fragments, and a playable portrait UI. Three masks unique under rotation/reflection; holes interrupt motion; horizontal and vertical targets. One one-move tutorial. Basic progress, undo, restart, certified recovery hint and browser save. Touch, tap+arrows and keyboard. Tests before polish. No powers, full campaign, native packaging or large datasets.

Acceptance: three distinct levels, each unsolved initially and certified solvable without powers, target exact source match, no-op handling, inverse/undo tests, saved state survives reload, no duplicate credit, successful local build, Playwright viewport/touch checks, documented actual test results and limitations. Owner plays it before proceeding.

## M2 — GENOME v2 mechanics and variety

Status: **accepted** (13 Nov 2026). Implemented and automatically tested (see `docs/AUDIT_M2.md`, D-M2-*); the owner playtested the live build and accepted it ("Nice that was good. Move onto M3"). Generator parameters remain as audited; difficulty labels may still be tuned from later playtests.

Expand to the 12-level INS/HBB sample campaign (GDD table), splicing, replication, repair, varied tracks and more interesting generated shapes. Level map, discovery cards, exact 51-base sample tracking, source metadata, progress across reload, improved slide animation and completion feedback. Add generator audit CLI with at least 1,000 candidates, duplicate and certificate checks, metrics for rejection rates and estimated difficulty. Implement bounded solver for shallow puzzle analysis; do not block UI. Playtest before finalising parameters.

Acceptance: all 12 unique masks and legal certificates, all four modes work, no gene fully assembled claim, sample coverage exactly 51 per gene, correct complementary orientation, repair animation adds missing cell only on win, no level map progress loss, no identical or transformed masks. 1,000-candidate audit results recorded, clear solver limits, all previous tests pass.

## M3 — Enzyme laboratory

Status (13 Nov 2026): implemented and automatically tested (D-M3-*, `tests/engine/powers.test.ts`, `e2e/powers.spec.ts`, `docs/AUDIT_M3.md`). Awaiting the owner's with/without-powers playtest; costs (CRISPR ⚡4, Ligase ⚡2, Scaffold ⚡3, start ⚡2, cap 9) are the GDD §6 values and are not tuned yet.

Implement CRISPR, Ligase and Scaffold one at a time. Energy ledger, tutorials and action previews; powers can be undone and release/restart remains free. Explicit recovery hints after power use. No permanent unlock economy yet; tutorial access. Add reduced-motion, sound/haptic toggles as appropriate. Build dedicated test cases for locks and bridge expiration.

Acceptance: invalid actions free, correct costs, no credit farming, same-base edit no-op, exactly three successful scaffold rotations then expiry, lock correctly blocks both axes, release/undo restores movement, hints never invalid, all levels solvable without powers, recovery from a bad CRISPR edit. Owner compares play with/without powers; tune costs only after observed evidence.

## M4 — Full CDS assembly and scalable content

Prototype multi-base token tiers; prove full INS and HBB coverage with an enjoyable short chapter, track discovery separately from assembly. Test token labels/preview and correct fragment order. Build importer, pinned manifest and coverage validation; expand to a curated set of 10–30 genes after data audit. Introduce gene-to-ability milestones only once verified data and long-token power semantics are ready. Assess bounded solver/difficulty and uniqueness at larger scale. No promise of a full catalogue yet.

Acceptance: every base of selected full CDS represented in played intervals, no hidden auto-fill, exact reconstruction/checksum match, same tile semantics, repeat and complementary progress idempotent. Full chapter duration and difficulty documented via owner playtest. Catalogue count derived from manifest, source citations visible. Design review of long-token readability and long-term completion burden before scale.

## M5 — Mobile application and release candidate

Add Capacitor iOS target first, Android if requested; offline bundle, native-safe areas, haptics, persistence adapter with migrations and backup export/import, accessibility and performance QA. Test on physical iPhone, not just simulator. App icon, splash, settings, local content attribution, privacy disclosures, licensing/name clearance and store requirements. No sign-in or monetisation. Native signing, provisioning and App Store submission require owner action/approval.

Acceptance: offline cold launch, save across background/kill/resume, no data loss in migration tests, responsive small screen, actual device test results, accessible controls, signed build where credentials available, no runtime remote requests. Owner approval before release.

## M6 — Catalogue expansion (long-term)

Pin production MANE/RefSeq-derived catalogue, cover exclusions explicitly, batch-generate content or reproducible packs, prevalidate masks/solutions and run content QA. Chromosome and theme navigation, search, per-gene CDS coverage and campaign finish state. Benchmark data footprint, storage and generation performance. Introduce other powers and modes only when useful. Consider noncoding/alternative transcript/full locus extensions as separate campaigns.

Acceptance: included gene count equals verified manifest, all shipped levels unique and certified, every included CDS fully coverable and no duplicated coverage, offline performance/storage acceptable on target devices, no hidden incomplete genes in the victory denominator. Feasibility and playtest approval required before claiming full human gene catalogue release.

## Repeatable Codex task pattern

For each milestone: inspect relevant docs and existing code, state bounded plan, implement small increments, add tests, run exact commands, provide a runnable build and report limitations. Keep decision changes in DECISIONS.md. Do not automatically implement the next milestone. Owner review is a gate, not a simulated check.
