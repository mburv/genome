# Technical architecture & engine contract

## 1. Proposed stack and boundaries

TypeScript (strict), React, Vite, CSS Grid and Pointer Events; Vitest for unit/property tests, Playwright for browser integration, ESLint and a lockfile. Use Capacitor for iOS/Android after web validation; test on Safari/iOS early. Prefer DOM/CSS initially over a heavyweight rendering engine. Godot or another game engine is a future decision only if profiling or visual requirements justify it. No remote runtime service, no cloud database. Keep engine packages independent of React and Capacitor.

Suggested structure (adapt to actual repo):

```
src/
  engine/      types, segment, reducer, targets, powers, invariants
  generator/   rng, masks, targets, scramble, certificates, solver, scoring
  genomics/    manifest, validation, coverage, tokenisation
  campaign/    chapter definitions, unlocks, progression
  persistence/ save adapter, migrations, validation
  ui/          board, gestures, screens, accessibility, animations
  assets/      bundled dataset, icons, sound (licensed)
scripts/       import/validate data, generate/validate levels
tests/         engine, generator, genomics, save, e2e
```

Use pure engine methods with explicit arguments and deterministic return values. React renders state and sends commands. Browser animation/gesture state is not authoritative. Dataset importer and bulk generation are build-time scripts; shipped assets are versioned. Worker for expensive solver/generation if needed, with cancellation and bounded budgets. Start simple; avoid speculative microservices.

## 2. Domain contracts

Illustrative interfaces, not required exact implementation:

```ts
type Base = 'A' | 'T' | 'C' | 'G';
type Axis = 'row' | 'col';
type Direction = -1 | 1;
type Cell = number; // integer 0..80
interface Interval { start: number; end: number } // CDS, zero-based half-open
interface Token { sequence: string; displayId: string; source?: Interval }
interface Track { cells: Cell[]; expected: string[]; group: number;
  strand: 'coding' | 'complement'; orientation: '5to3' | '3to5' }
interface LevelDefinition {
  id: string; geneId: string; transcript: string; mode: 'sequence'|'splice'|'replicate'|'repair';
  mask: boolean[]; tracks: Track[]; sourceIntervals: Interval[];
  repair?: {cell: Cell; expected: Base}; seed: number; generatorVersion: string;
  datasetId: string; initial: (Token|null)[]; certificate: Move[];
}
interface Move { origin: Cell; axis: Axis; direction: Direction }
interface Scaffold { axis: Axis; line: number; gaps: Cell[]; remaining: number }
interface PuzzleState {
  levelId: string; tiles: (Token|null)[]; moves: number;
  locks: Cell[]; scaffold?: Scaffold; energy: number;
  claimedCodons: string[]; status: 'playing'|'solved';
}
```

Use single-base token sequence in M1–M3; compare exact sequence values. Mask length 81, one token per active cell, null at every hole. Targets must be non-overlapping, ordered, valid, and their expected sequence must match the source data. Repair cell is excluded from ordinary tracks and mask. Immutable initial level definition. Undo history stores snapshots or reversible deltas; cap history explicitly and disclose the cap if implemented. Persist sufficient history/certificates to reproduce hints. Separate UI selection from saved puzzle state.

`applyCommand(def, state, command) -> {state, events, accepted, reason}`. Invalid moves do not alter state, score, energy, history, or completion. Command types: rotate, edit, bond, release, scaffold, undo, restart; collection/progression updates only upon committed completion. Use a single transaction for a move, energy, win and save. Side effects (sound, haptic, storage) follow events after state is committed.

### Segment semantics

Validate origin and axis. Walk left/right or up/down to maximal playable, unlocked contiguous span. Origin locked or hole => empty segment. Scaffold connects exactly the designated two segments along its axis; skip bridged holes, never cross other holes or locks. Canonical move identity = axis + ordered segment indices + direction; origin aliases do not change the action. Rotation maps old[i] to new[(i+d+n)%n]. No-op if length <2 or resulting sequence array is identical. At least two different bases needed for a useful rotation. Normal moves preserve multiset; CRISPR changes exactly one sequence. Check completion after every accepted mutation; completion is idempotent.

### Energy and undo

Track a stable codon key (level, source CDS offset) only for designated complete codons. Capture initial correct codons as ineligible. After an accepted normal rotation, grant +1 for newly correct eligible codons never credited. No rewards for powers or undo. To prevent farm/undo exploits, store a non-reversible per-attempt credited-key set and monotonic earned total, plus reversible spending and board history. On undo restore spent energy and prior board, retain all credited keys and earned total; compute available energy = min(9, starting + earned - net spent) under the defined cap semantics. Choose and test whether overflow is banked or discarded; proposed cap discards excess (store actually awarded credits). Undo is allowed to retain genuinely earned energy from the first unique codon, but cannot earn again. Restart creates a new attempt with fresh level-local energy and ledger, never persistent currency. Completed-level replay cannot duplicate campaign rewards. UI must clearly state this. If later persistent energy is introduced, separate ledger across retries.

## 3. Level generation and validation

1. Resolve pinned gene and exact source intervals; construct mode tracks and expected bases. Choose diverse orientation, group placement and geometry, not a finite template rotation.
2. Seed RNG with explicit stable numeric seed and version. Propose mask from edge erosion, clustered cavities, offset bands and corridor primitives. Protect targets and required movement witnesses. Flood-fill all active cells to ensure orthogonal connectivity. Enforce active count (proposed 50–76 early; tutorial exceptions), target access, hole counts, and minimum number of useful segment intersections. Reject masks where necessary segments are immobile.
3. Canonicalise mask across all eight dihedral transforms (rotations/reflections). Reserve canonical fingerprint in a campaign manifest. Reject exact duplicates including transformed duplicates. For near duplicates compare Hamming distance/Jaccard after best transform against recent neighbours; propose min 8 different cells for non-tutorial adjacent levels, tune. At catalogue scale use hash set and indexed nearby comparisons, not quadratic full history. Do not claim uniqueness by seed alone.
4. Fill playable cells with deterministic filler and impose target values to create a solved board. Repair target is defined from source but remains absent in starting mask. All correct source positions must be populated.
5. Scramble with legal normal rotations only. Reject no-ops, immediate inverse moves, pre-solved results and candidates with overly trivial scores. Record inverse moves in reverse order as the solution certificate. Include crossing axis moves and obstacles for interesting layouts, not just independent target column corrections. Tutorial exactly one required move.
6. Validate certificate by replaying from initial state, without powers. Verify win and reference mapping. Store original mask, certificate and source version. Reject/retry on failure; bounded attempt count with explicit generation error, no silent duplicate fallback. Generate and validate the 12 demo boards before shipping.
7. Quality scoring: wrong targets, minimum moves when provable, upper bound certificate length, distinct useful axes, constraint intersections, narrow passages, target placement and repeat similarity. A board with a five-step scramble may have a one-step solution. Label ratings as estimated unless exact search proves otherwise.

### Solver and hints

Initial hint engine: replay verified reverse scramble and track user normal actions (cancel inverse moves, including segment aliases). A hint suggests a legal next action that eventually returns to a certified state; call it a recovery hint, not necessarily the shortest solution. Verify recommendation in current state. M2/M4: implement bounded exact BFS for shallow states / small boards, optionally bidirectional or heuristic search for larger states. Search visited key includes tile sequences, not token object identity. For an admissible lower bound use ceil(wrong target cells / maximum target cells that any allowed move can correct); use conservative upper bound on correction capacity, not an overestimated heuristic. Distinguish `optimal`, `solved-within-budget`, `unknown` and `invalid`. Budget nodes/time and run expensive search off the UI thread. Never claim exhaustive solution if timed out.

Power-ups complicate reachability (CRISPR can replace a required base, locks restrict routes, scaffold changes segment topology). M3 must preserve recoverability: maintain last certified state via undo, provide free release and restart, and invalidate inverse-only hints whenever topology/base multiset changes. Attempt fresh bounded search if implemented; otherwise offer a verified undo/restart recovery path. No stale hint after power activation. A level never requires a booster.

## 4. Save and data versioning

Save envelope: `schemaVersion`, `catalogueId`, `generatorVersion`, `campaignId`, completed level IDs, per-gene assembled interval union, discovery flags, permanent ability unlocks, settings, per-attempt board/energy/locks/history/certificates, current level ID. Stable level identity includes dataset/transcript version, generator version and seed; persist immutable level definitions or pin shipped level pack, not just regenerate with a new algorithm. Avoid storing full catalogue or duplicate sequences in every save.

Browser adapter: localStorage for demo only; catch quota/disabled storage and surface 'not saved'. Production: IndexedDB or native storage adapter behind same interface; atomic transactions, last-good backup, schema validation and migrations. On invalid save offer restore backup/export/reset with confirmation; never silently wipe. Provide export/import JSON backup with validation, no network. Track app resume/background events; persist on committed move and completion. Keep platform settings optional; no permissions needed for game. Bundle essential assets locally. Test offline cold launch (native packaged app or properly cached web build), not merely offline after one loaded page.

## 5. Verification matrix

- Segment wrap horizontal/vertical, boundary and hole split, singletons, identical letters, no diagonals, locked cells, scaffold expiry. Inverse normal move restores original board, multiset preserved. Random seeds property tests.
- Every generated level: mask connected and unique under transforms, valid tracks and exact source, unsolved initial, certificate wins without boosters, reproducible by seed/version; validate >=1,000 generated candidates in M2, record rejection rate and timing (not a guarantee every seed succeeds).
- Splicing all tracks simultaneous; complement orientation; repair credit exactly once; final partial fragment length; source coverage no overlap duplication; sample unlock distinct from complete.
- Undo/restart, power costs, no-op/cancel no charge, locks release, scaffold duration, edit recovery, non-farmable energy, duplicate completion/replay, save/load and corrupted-save behavior.
- Pointer/touch horizontal/vertical swipes, tap select + arrows, cancellation, rapid gestures, keyboard, small 320–430 CSS px viewport, safe areas, reduced motion, colour-independent targets, no horizontal overflow, completion flows and level jump. Test with Playwright and record actual iOS hardware checks separately.
- Offline, no runtime external fetches; production build and source attribution included. Profiling targets: responsive input on mid-range phone, animation near 60 fps where supported, no long solver blocking main thread. Treat as measured release criteria, not assumptions.

Proposed commands: `npm run dev`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build`, `npm run validate:data`, `npm run validate:levels`. Implement scripts as milestones need them; report commands actually available and run.
