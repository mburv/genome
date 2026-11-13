# GENOME — development starter pack

**Build what makes you human.**  
Product specification v0.1 · 12 November 2026 · single-player mobile puzzle game

This is a handoff for a solo developer and Codex, not a finished application. The working title is GENOME (name clearance not performed). The v1 HTML prototype is included as an interaction reference; the improved v2 mechanics from the conversation are specified in the design documents. Do not treat the legacy file as the production engine or as validated genomic source data.

## Start here

1. Unzip the folder into a new local project directory. Open that directory in Codex (desktop, IDE or CLI).
2. Read `docs/GAME_DESIGN.md` for product intent and `docs/ARCHITECTURE.md` for technical contracts. `AGENTS.md` contains enduring repository rules that Codex can discover automatically.
3. Start a fresh Codex task using `FIRST_TASK.md`. Implement **M1 only** from `docs/ROADMAP.md` and run the tests. Do not ask Codex to implement all milestones at once.
4. Launch the web build locally and play it on a phone-sized viewport and, when possible, a physical iPhone. Decide whether the sliding mechanic is enjoyable before proceeding to M2.
5. Use `docs/ROADMAP.md` for subsequent tasks; keep `docs/DECISIONS.md` current when changing a rule.

Recommended development default: TypeScript + React + Vite; Capacitor for native packaging after the web game is proven. This is a proposed decision, not a user-mandated framework. The engine must be independent of the UI. Use a strong coding model at High reasoning; reserve the highest available reasoning for solver design and difficult architecture reviews. Model availability varies by Codex configuration; use the actual picker rather than hard-coding a model name.

## Contents

| File | Purpose |
|---|---|
| `AGENTS.md` | Persistent coding rules and verification expectations |
| `FIRST_TASK.md` | Copy/paste first Codex implementation prompt |
| `docs/GAME_DESIGN.md` | Core mechanics, power-ups, progression, UX and scope |
| `docs/ARCHITECTURE.md` | Domain contracts, generation, solver, persistence and testing |
| `docs/GENOMICS.md` | Source data, biological accuracy and dataset policy |
| `docs/ROADMAP.md` | Ordered milestones with acceptance criteria |
| `docs/DECISIONS.md` | Confirmed choices, proposed defaults and open questions |
| `reference/genome-v1.html` | Original standalone prototype for comparison only |

The initial deliverable is a 12-level mechanics demo. It must not claim that a gene has been fully assembled after only 51 bases. The production campaign must cover every base of a pinned representative coding sequence for each included gene. Full genomic loci, non-coding genes and alternate transcripts are separate future scope. No multiplayer, accounts, servers, paid power-ups or telemetry are required.

---

## How to run (M1 + M2 accepted; M3 enzyme lab, 13 Nov 2026)

Requires Node 22.6+ (tested on Node 24.22). All play-time assets are local; the game makes no network requests.

```bash
npm install
npx playwright install chromium   # once, for browser tests
npm run dev                        # http://localhost:5173 — open on a phone-sized viewport
```

| Command | What it does |
|---|---|
| `npm run typecheck` | Strict TypeScript for app, tests and tooling |
| `npm run lint` | ESLint (engine/generator forbid DOM, `Date`, `fetch`, `Math.random`) |
| `npm test` | Vitest unit tests (engine, generator, solver, genomics, powers, hints, save + v1→v2→v3 migrations) |
| `npm run test:e2e` | Builds, then Playwright on a 390×844 touch viewport (+320×568): continuous multi-cell drags, snapping, holes, tap/arrows, keyboard, the level map, all 12 levels solved by touch, discovery cards, save/reload, v1→v2 and v2→v3 migrations, CRISPR/Ligase/Scaffold (preview, undo refund, locks on both axes, bridge expiry, recovery after a bad edit), settings toggles, and the single-file HTML via `file://` |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run build:single` | Self-contained one-file build: `dist-single/GENOME-M3.html` (main build unaffected) |
| `npm run validate:data` | Re-verifies the INS and HBB CDS assets against the stored raw GenBank records |
| `npm run validate:levels` | Regenerates the level pack from seeds and checks it is byte-identical and valid |
| `npm run audit:levels` | Generator audit: 1,500 candidates (100 per level spec, 15 specs) → `docs/AUDIT_M3.md` + `docs/audit-m3.json` (M2 record kept in `docs/AUDIT_M2.md`) |
| `npm run fetch:data` / `npm run import:data` | Build-time only: re-download NM_000207.3 / NM_000518.5 from NCBI and re-import |

### Layout

```
src/engine/      pure rules: segment rotation, drag/step commands, powers (CRISPR/Ligase/Scaffold), energy ledger, undo/restart, completion, hints + bounded hint search
src/generator/   seeded RNG, mask primitives + dihedral canonicalisation, scramble, certificates, bounded solver
src/genomics/    verified INS + HBB CDS assets (*.generated.json), gene loader, complement helpers
src/campaign/    level specs (seeds, CDS intervals) and the pinned level pack (levels.generated.json)
src/persistence/ versioned save envelope, validation, localStorage adapter (injected)
src/ui/          React screens (map, play, gene card), board, drag gestures, target panels, styles
scripts/         fetch/import genes, generate/validate levels, audit, single-file copy
data/raw/        NM_000207.3 + NM_000518.5 GenBank records + provenance (URL, retrieval time, SHA-256)
tests/  e2e/     Vitest and Playwright suites
```

### Genomic data

`data/raw/NM_000207.3.gb` was fetched from NCBI E-utilities (efetch, `rettype=gb`) on 13 Nov 2026. The importer extracts the annotated CDS (`60..392`), checks length 333, ACGT alphabet, `codon_start=1`, a single terminal stop, and that its standard-code translation equals the record's `/translation` (NP_000198.1). CDS SHA-256 `fca80cdee67f516fd2bf95d38ae2e4c068ddbaaec246ec2e2aecebe85c7c2b42`. `data/raw/NM_000518.5.gb` (HBB, MANE Select) was fetched the same way: CDS `51..494`, 444 bases, translation equals NP_000509.1 (147 aa), CDS SHA-256 `838ee6276e734b829a5ca342989eb04464173f44da33ca3a5eb3267ad66a495e`.

### M2 campaign

12 levels (GDD table): per gene, CDS bases 1–9 sequencing, 10–18 splicing, 19–24 replication, 25–33 repair, 34–42 sequencing, 43–51 splicing — exactly 51 sample bases per gene. Completing all six of a gene's levels **discovers** it (a source-cited card); it is never called assembled. Difficulty is in drags (proven optimum where the bounded solver could prove it, otherwise "≥ k"); ratings are estimates. See `docs/AUDIT_M2.md` for the generator audit and `docs/DECISIONS.md` (D-M2-*) for choices and limits.

### M3 enzyme lab

Three optional power-ups, available from level 4 and in the Enzyme lab (three tutorial levels on the map, each lending one free use; no coverage):

| Power | Cost | Effect |
|---|---:|---|
| CRISPR ✂ | ⚡4 | Replace one playable, unlocked tile's base (same base = free no-op). Preview shows the result on the targets before you confirm. |
| Ligase 🔗 | ⚡2 | Bond one complete, correct codon: those tiles block rotation on both axes. Release is free. |
| Scaffold ⌒ | ⚡3 | Join two segments across a 1–2-cell gap into one track for exactly 3 rotations. |

Energy: start ⚡2 per level, +1 the first time each reference codon is completed by a normal move, cap ⚡9, level-local. Undo reverses any power and refunds it; the reward ledger survives undo, so nothing can be farmed; restart (free) starts a new attempt. Hints are never stale: certified drag → "release the bond" → bounded search (≤ 3 drags, 40 k nodes) → "Undo ×N to a certified position" → free restart. Every level remains solvable without powers. Settings (⚙): reduce motion, sound (synthesised locally, off by default), haptics (`navigator.vibrate`, where supported). Save schema v3 upgrades M2 saves with a backup and keeps all progress. See D-M3-* in `docs/DECISIONS.md`.

