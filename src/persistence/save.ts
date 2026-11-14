import { isCompatibleBoard, levelCodons, type PuzzleState, type Snapshot, HISTORY_CAP, createInitialState } from '../engine/engine.ts';
import { codonComplete, ENERGY_CAP, POWERS, START_ENERGY, scaffoldTrack, SCAFFOLD_TURNS, type Power } from '../engine/powers.ts';
import { applyMove } from '../engine/grid.ts';
import type { LevelDefinition, Move } from '../engine/types.ts';
import { isDiscovered, nextChapterId, RETIRED_SAMPLE_IDS, type LevelPack } from '../campaign/campaign.ts';
import { assemblyStatus } from '../campaign/assembly.ts';
import { GENES } from '../genomics/genes.ts';
import { isCustomSymbol, MAX_CUSTOM_TOKENS } from '../engine/tokens.ts';

export const SAVE_KEY = 'genome-save';
export const SCHEMA_VERSION = 5;

export interface SaveData {
  schemaVersion: typeof SCHEMA_VERSION;
  campaignId: string;
  generatorVersion: string;
  /** M4: generator version of the token chapter puzzles. */
  tokenGeneratorVersion: string;
  /** M4: pinned catalogue release. */
  catalogueId: string;
  /** Dataset id per gene symbol the boards were generated from. */
  datasets: Record<string, string>;
  currentLevelId: string;
  /** Completed level ids, each at most once (no duplicate credit on replay). */
  completed: string[];
  /** Gene symbols whose discovery card has been revealed to the player. */
  discovered: string[];
  /** M4: gene symbols whose full CDS was assembled and verified (exact match + SHA-256). Separate from discovery. */
  assembled: string[];
  attempts: Record<string, PuzzleState>;
  /** Progress kept from earlier builds that has no exact equivalent in this campaign. */
  legacy: { m1Completed: string[] };
  settings: Settings;
  /** Best recorded solve per level. Replays never worsen this; completion credit is separate. */
  best: Record<string, LevelBest>;
}

/** One stored result. `powersUsed` is omitted when unknown (legacy backfill from a solved board). */
export interface LevelBest {
  moves: number;
  powersUsed?: number;
}

export interface Settings {
  reducedMotion: boolean;
  /** Locally synthesised sound effects (Web Audio, no files). Off by default. */
  sound: boolean;
  /** navigator.vibrate where supported. */
  haptics: boolean;
}

export const DEFAULT_SETTINGS: Settings = { reducedMotion: false, sound: false, haptics: true };

/** M1 prototype completions are kept as history only; the equivalent sample level has been retired. */
export const M1_TO_M2: Readonly<Record<string, string>> = {};

/** Injected persistence. The browser uses localStorage for the demo only. */
export interface StorageAdapter {
  load(): string | null;
  save(raw: string): boolean;
  /** Keep a raw copy before anything is changed. `label` gives it its own slot (e.g. the M1 save). */
  backup(raw: string, label?: string): boolean;
}

export function createLocalStorageAdapter(key = SAVE_KEY): StorageAdapter {
  const safe = <T,>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  return {
    load: () => safe(() => localStorage.getItem(key), null),
    save: (raw) => safe(() => (localStorage.setItem(key, raw), true), false),
    backup: (raw, label) => safe(() => (localStorage.setItem(label ? `${key}-backup-${label}` : `${key}-backup`, raw), true), false),
  };
}

export function createMemoryAdapter(initial: string | null = null): StorageAdapter & { raw: string | null; backups: string[]; labels: (string | undefined)[] } {
  const a = {
    raw: initial,
    backups: [] as string[],
    labels: [] as (string | undefined)[],
    load: () => a.raw,
    save: (raw: string) => ((a.raw = raw), true),
    backup: (raw: string, label?: string) => (a.backups.push(raw), a.labels.push(label), true),
  };
  return a;
}

export function newSave(pack: LevelPack): SaveData {
  return {
    schemaVersion: SCHEMA_VERSION,
    campaignId: pack.campaignId,
    generatorVersion: pack.generatorVersion,
    tokenGeneratorVersion: pack.tokenGeneratorVersion ?? '',
    catalogueId: pack.catalogueId ?? '',
    datasets: { ...pack.datasets },
    currentLevelId: pack.levels[0]!.id,
    completed: [],
    discovered: [],
    assembled: [],
    attempts: {},
    legacy: { m1Completed: [] },
    settings: { ...DEFAULT_SETTINGS },
    best: {},
  };
}

export const serializeSave = (s: SaveData): string => JSON.stringify(s);

/** Live save plus every backup slot the game writes (`genome-save-backup`, `-m1`, `-m2`, `-m3`, …). */
export function isGameProgressKey(name: string, key = SAVE_KEY): boolean {
  return name === key || name === `${key}-backup` || name.startsWith(`${key}-backup-`);
}

/** Drop the live save and all backup keys from a Storage-like object. Returns the names removed. */
export function clearProgressStorage(
  storage: { length: number; key(i: number): string | null; removeItem(name: string): void },
  key = SAVE_KEY,
): string[] {
  const names: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const n = storage.key(i);
    if (n) names.push(n);
  }
  const removed = names.filter((n) => isGameProgressKey(n, key)).sort();
  for (const n of removed) storage.removeItem(n);
  return removed;
}

/** A fresh campaign save that keeps the player's sound, haptics and reduced-motion settings. */
export function resetProgress(pack: LevelPack, settings: Settings): SaveData {
  return { ...newSave(pack), settings: { ...settings } };
}

const isMove = (m: unknown): m is Move => {
  if (typeof m !== 'object' || m === null) return false;
  const o = m as Record<string, unknown>;
  return Number.isInteger(o.origin) && (o.axis === 'row' || o.axis === 'col') && (o.direction === 1 || o.direction === -1);
};

/** Recovery path must replay from the solved board to exactly this board, or the hint would be stale. */
function recoveryReplays(def: LevelDefinition, board: string, recovery: Move[]): boolean {
  let b = def.solved;
  for (const m of recovery) {
    const o = applyMove(def.mask, b, m);
    if (!o.changed) return false;
    b = o.board;
  }
  return b === board;
}

const isCellList = (v: unknown): v is number[] => Array.isArray(v) && v.every((c) => Number.isInteger(c) && c >= 0 && c < 81);

function validScaffold(def: LevelDefinition, locks: number[], v: unknown): boolean {
  if (v === null) return true;
  if (typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if ((o.axis !== 'row' && o.axis !== 'col') || !isCellList(o.gap) || !isCellList(o.cells)) return false;
  if (!Number.isInteger(o.remaining) || (o.remaining as number) < 1 || (o.remaining as number) > SCAFFOLD_TURNS) return false;
  const t = scaffoldTrack(def.mask, locks, o.axis, o.gap);
  return 'cells' in t && t.cells.join() === (o.cells as number[]).join();
}

/** CRISPR-created token sequences: only on token levels, at most one per edit, real DNA, never duplicating a level token. */
function validCustom(def: LevelDefinition, v: unknown, edits: number): boolean {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const entries = Object.entries(v as Record<string, unknown>);
  if (!def.tokens) return entries.length === 0;
  if (entries.length > Math.min(edits, MAX_CUSTOM_TOKENS)) return false;
  const known = new Set(Object.values(def.tokens).map((t) => t.seq));
  const seen = new Set<string>();
  return entries.every(([k, seq]) => isCustomSymbol(k) && typeof seq === 'string' && /^[ACGT]+$/.test(seq) && !known.has(seq) && !seen.has(seq) && (seen.add(seq), true));
}

function validSnapshot(def: LevelDefinition, s: unknown): s is Snapshot {
  if (typeof s !== 'object' || s === null) return false;
  const o = s as Record<string, unknown>;
  if (!Number.isInteger(o.edits) || (o.edits as number) < 0) return false;
  if (!validCustom(def, o.custom, o.edits as number)) return false;
  if (!isCompatibleBoard(def, o.board, o.edits as number, o.custom as Record<string, string>) || !Number.isInteger(o.moves)) return false;
  if (o.recovery !== null && !(Array.isArray(o.recovery) && o.recovery.every(isMove) && recoveryReplays(def, o.board as string, o.recovery))) return false;
  if (!isCellList(o.locks)) return false;
  const locks = o.locks;
  if (locks.length && !levelCodons(def).some((c) => c.cells.join() === locks.join())) return false;
  if (!validScaffold(def, locks, o.scaffold)) return false;
  if (!Number.isInteger(o.spent) || (o.spent as number) < 0) return false;
  return Array.isArray(o.freeUses) && o.freeUses.every((p) => POWERS.includes(p as Power) && p === def.lab);
}

function validAttempt(def: LevelDefinition, a: unknown): a is PuzzleState {
  if (!validSnapshot(def, a)) return false;
  const o = a as unknown as Record<string, unknown>;
  if (o.levelId !== def.id || (o.status !== 'playing' && o.status !== 'solved') || !Array.isArray(o.history)) return false;
  const l = o.ledger as Record<string, unknown> | undefined;
  const keys = new Set(levelCodons(def).map((c) => c.key));
  if (!l || !Number.isInteger(l.earned) || (l.earned as number) < 0 || !Array.isArray(l.credited) || !l.credited.every((k) => keys.has(k as string))) return false;
  return o.history.length <= HISTORY_CAP && o.history.every((h) => validSnapshot(def, h));
}

/**
 * Upgrade an M2 (v2) attempt to v3: no locks/scaffold/edits, nothing spent. Every M2 move was a normal
 * move, so codons completed since the start are credited as earned (capped), others stay eligible.
 */
export function upgradeAttemptV2(def: LevelDefinition, a: unknown): unknown {
  if (typeof a !== 'object' || a === null) return a;
  const o = a as Record<string, unknown>;
  const snap = (x: unknown): unknown => (typeof x === 'object' && x !== null ? { ...(x as object), locks: [], scaffold: null, spent: 0, freeUses: def.lab ? [def.lab] : [], edits: 0 } : x);
  const fresh = createInitialState(def);
  const board = typeof o.board === 'string' ? o.board : def.initial;
  const earnedKeys = levelCodons(def).filter((c) => c.rewardable && !fresh.ledger.credited.includes(c.key) && codonComplete(board, c)).map((c) => c.key);
  return {
    ...(snap(o) as object),
    history: Array.isArray(o.history) ? o.history.map(snap) : o.history,
    ledger: { earned: Math.min(earnedKeys.length, ENERGY_CAP - START_ENERGY), credited: [...fresh.ledger.credited, ...earnedKeys] },
  };
}

/** Upgrade an M3 (v3) attempt to v4: snapshots gain an empty CRISPR custom-token table. Nothing else changes. */
export function upgradeAttemptV3(a: unknown): unknown {
  if (typeof a !== 'object' || a === null) return a;
  const o = a as Record<string, unknown>;
  const snap = (x: unknown): unknown => (typeof x === 'object' && x !== null ? { ...(x as object), custom: {} } : x);
  return { ...(snap(o) as object), history: Array.isArray(o.history) ? o.history.map(snap) : o.history };
}

export interface LoadResult {
  save: SaveData;
  notices: string[];
  /** True when stored data could not be used as-is; a raw backup was written first. */
  recovered: boolean;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const readSettings = (v: unknown): Settings => {
  const o = typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
  return {
    reducedMotion: o.reducedMotion === true,
    sound: typeof o.sound === 'boolean' ? o.sound : DEFAULT_SETTINGS.sound,
    haptics: typeof o.haptics === 'boolean' ? o.haptics : DEFAULT_SETTINGS.haptics,
  };
};

/** Pure v1 (M1) → v2 (M2) migration. Never drops credit silently: unmapped completions become legacy history. */
export function migrateV1(data: Record<string, unknown>, pack: LevelPack): { save: SaveData; notices: string[] } {
  const fresh = newSave(pack);
  const m1Completed = [...new Set(strings(data.completed).filter((id) => id.startsWith('m1-')))];
  const notices = ['GENOME updated: the short INS and HBB sample challenges have been retired. The game now starts with each gene’s full-sequence assembly chapter.'];
  if (m1Completed.length) notices.push(`M1 prototype level${m1Completed.length > 1 ? 's' : ''} ${m1Completed.map((id) => Number(id.slice(-2))).join(' and ')} are kept as history on the map. They no longer grant campaign credit.`);
  if (Object.keys((data.attempts as object | undefined) ?? {}).length) notices.push('Boards in progress from M1 were restarted because the levels changed.');
  return {
    save: { ...fresh, legacy: { m1Completed }, settings: readSettings(data.settings) },
    notices,
  };
}

/**
 * Parse, migrate and validate a save. Invalid parts are never silently discarded: the raw save is backed
 * up and a notice is returned for the UI. Completion credit is kept whenever its level still exists.
 */
export function loadSave(adapter: StorageAdapter, pack: LevelPack): LoadResult {
  const raw = adapter.load();
  const fresh = newSave(pack);
  if (raw === null) return { save: fresh, notices: [], recovered: false };
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
    if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new Error('not an object');
  } catch {
    adapter.backup(raw);
    return { save: fresh, notices: ['Your saved progress could not be read. A backup copy was kept and a new game started.'], recovered: true };
  }
  if (data.schemaVersion === 1) {
    adapter.backup(raw, 'm1');
    const m = migrateV1(data, pack);
    return { save: m.save, notices: m.notices, recovered: true };
  }
  let upgradedV2 = false;
  let upgradedV3 = false;
  const rawAttemptsOf = (d: Record<string, unknown>): Record<string, unknown> => (typeof d.attempts === 'object' && d.attempts !== null ? (d.attempts as Record<string, unknown>) : {});
  if (data.schemaVersion === 2) {
    // M2 → M3: keep everything; add power state to boards in progress. Raw copy kept first.
    adapter.backup(raw, 'm2');
    const attempts = Object.fromEntries(Object.entries(rawAttemptsOf(data)).map(([id, a]) => {
      const def = pack.levels.find((l) => l.id === id);
      return [id, def ? upgradeAttemptV2(def, a) : a];
    }));
    data = { ...data, schemaVersion: 3, attempts };
    upgradedV2 = true;
  }
  if (data.schemaVersion === 3) {
    // M3 → M4: keep everything; boards gain the (empty) CRISPR custom-token table. New catalogue genes
    // join the dataset table (no board of theirs can exist yet), so nothing in progress is invalidated.
    if (!upgradedV2) adapter.backup(raw, 'm3');
    const attempts = Object.fromEntries(Object.entries(rawAttemptsOf(data)).map(([id, a]) => [id, upgradeAttemptV3(a)]));
    const oldDatasets = typeof data.datasets === 'object' && data.datasets !== null ? (data.datasets as Record<string, unknown>) : {};
    const added = Object.fromEntries(Object.entries(pack.datasets).filter(([g]) => !(g in oldDatasets)));
    data = { ...data, schemaVersion: 4, attempts, datasets: { ...oldDatasets, ...added }, tokenGeneratorVersion: pack.tokenGeneratorVersion ?? '', assembled: [] };
    upgradedV3 = true;
  }
  let upgradedV4 = false;
  if (data.schemaVersion === 4) {
    if (!upgradedV2 && !upgradedV3) adapter.backup(raw, 'm4');
    data = { ...data, schemaVersion: SCHEMA_VERSION };
    upgradedV4 = true;
  }
  if (data.schemaVersion !== SCHEMA_VERSION) {
    adapter.backup(raw);
    return { save: fresh, notices: [`Save format ${String(data.schemaVersion)} is not supported by this build. A backup copy was kept.`], recovered: true };
  }
  const notices: string[] = [];
  const ids = new Set(pack.levels.map((l) => l.id));
  const retired = new Set(RETIRED_SAMPLE_IDS);
  const rawCompleted = strings(data.completed);
  const droppedSamples = rawCompleted.some((id) => retired.has(id));
  const completed = [...new Set(rawCompleted.filter((id) => ids.has(id)))];
  const discovered = [...new Set(
    Object.keys(pack.datasets).filter((g) => isDiscovered(completed, g)),
  )];
  const datasets = typeof data.datasets === 'object' && data.datasets !== null ? (data.datasets as Record<string, unknown>) : {};
  const sameContent = data.generatorVersion === pack.generatorVersion && (data.tokenGeneratorVersion ?? '') === (pack.tokenGeneratorVersion ?? '') && Object.entries(pack.datasets).every(([g, id]) => datasets[g] === id);
  const attempts: Record<string, PuzzleState> = {};
  let dropped = 0;
  const rawAttempts = typeof data.attempts === 'object' && data.attempts !== null ? (data.attempts as Record<string, unknown>) : {};
  for (const [id, attempt] of Object.entries(rawAttempts)) {
    const def = pack.levels.find((l) => l.id === id);
    if (def && sameContent && validAttempt(def, attempt)) attempts[id] = attempt;
    else dropped++;
  }
  if (!sameContent && Object.keys(rawAttempts).length) notices.push('Levels were updated since your last visit. Completed levels are kept; boards in progress were restarted.');
  else if (dropped) notices.push(`${dropped} saved board(s) were invalid and were restarted. Completed levels are kept.`);
  // Assembly claims are re-verified from completed puzzles (exact reconstruction + checksum).
  const claimed = [...new Set(strings(data.assembled))];
  const assembled = claimed.filter((g) => GENES[g] && g in pack.datasets && assemblyStatus(completed, GENES[g]!, pack.levels).verified);
  if (assembled.length < claimed.length) notices.push('An assembled-gene record could not be re-verified against the pinned reference and was cleared; your completed puzzles are kept.');
  if (notices.length && !upgradedV2 && !upgradedV3 && !upgradedV4) adapter.backup(raw);
  const kept = notices.length ? 'Completed levels were kept.' : 'All your progress was kept.';
  if (upgradedV3) notices.unshift(`GENOME updated: full gene assembly — multi-base tiles (codons up to 24-base pieces) and an assembly chapter for each of ${Object.keys(pack.datasets).length} verified catalogue genes.${upgradedV2 ? ' Also new: enzyme power-ups (CRISPR, Ligase, Scaffold), with three optional Enzyme lab tutorials on the map.' : ''} ${kept}`);
  if (upgradedV4) notices.unshift(`GENOME updated: the short INS and HBB sample challenges have been retired. Your assembly chapter progress, stars, best scores and preferences are kept. A gene is now discovered by solving its first assembly puzzle.${droppedSamples ? ' Sample-level completions no longer count toward coverage.' : ''} ${kept}`);
  const current = typeof data.currentLevelId === 'string' && ids.has(data.currentLevelId) ? data.currentLevelId : nextChapterId(completed);
  const legacyRaw = typeof data.legacy === 'object' && data.legacy !== null ? (data.legacy as Record<string, unknown>) : {};
  const best = readBest(data.best, ids, attempts);
  return {
    save: { ...fresh, currentLevelId: current, completed, discovered, assembled, attempts, legacy: { m1Completed: strings(legacyRaw.m1Completed) }, settings: readSettings(data.settings), best },
    notices,
    recovered: notices.length > 0,
  };
}

/** Record a verified assembly (idempotent; refuses anything that does not verify). */
export function recordAssembly(save: SaveData, symbol: string, levels?: readonly LevelDefinition[]): SaveData {
  const gene = GENES[symbol];
  if (!gene || save.assembled.includes(symbol) || !assemblyStatus(save.completed, gene, levels).verified) return save;
  return { ...save, assembled: [...save.assembled, symbol] };
}

/** Idempotent completion: a level is credited at most once. */
export function recordCompletion(save: SaveData, levelId: string): SaveData {
  return save.completed.includes(levelId) ? save : { ...save, completed: [...save.completed, levelId] };
}


/** True when `next` should replace `prev` as the stored best (fewer moves, then fewer powers). */
export function isBetterResult(next: LevelBest, prev: LevelBest): boolean {
  if (next.moves !== prev.moves) return next.moves < prev.moves;
  if (next.powersUsed == null || prev.powersUsed == null) return false;
  return next.powersUsed < prev.powersUsed;
}

/** Keep the better of the stored best and this result. Never removes a previous best. */
export function recordBest(save: SaveData, levelId: string, result: LevelBest): SaveData {
  if (!Number.isInteger(result.moves) || result.moves < 0) return save;
  const clean: LevelBest = { moves: result.moves };
  if (result.powersUsed != null && Number.isInteger(result.powersUsed) && result.powersUsed >= 0) clean.powersUsed = result.powersUsed;
  const prev = save.best[levelId];
  if (!prev || isBetterResult(clean, prev)) return { ...save, best: { ...save.best, [levelId]: clean } };
  // Same move count: fill in powers if the stored best was a legacy backfill without them.
  if (clean.moves === prev.moves && prev.powersUsed == null && clean.powersUsed != null) {
    return { ...save, best: { ...save.best, [levelId]: { ...prev, powersUsed: clean.powersUsed } } };
  }
  return save;
}

/**
 * Read stored bests, drop invalid / unknown ids, and backfill moves from any solved attempt
 * that has no (or a worse) recorded best. Powers are left unknown on a backfill.
 */
function readBest(raw: unknown, ids: Set<string>, attempts: Record<string, PuzzleState>): Record<string, LevelBest> {
  const best: Record<string, LevelBest> = {};
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!ids.has(id) || typeof v !== 'object' || v === null) continue;
      const o = v as Record<string, unknown>;
      if (!Number.isInteger(o.moves) || (o.moves as number) < 0) continue;
      const entry: LevelBest = { moves: o.moves as number };
      if (Number.isInteger(o.powersUsed) && (o.powersUsed as number) >= 0) entry.powersUsed = o.powersUsed as number;
      best[id] = entry;
    }
  }
  const shell = { best } as SaveData;
  for (const [id, attempt] of Object.entries(attempts)) {
    if (attempt.status !== 'solved') continue;
    const next = recordBest(shell, id, { moves: attempt.moves });
    shell.best = next.best;
  }
  return shell.best;
}

/** Read-only solved board shown when a completed level is reopened with no stored attempt. */
export function solvedDisplayState(def: LevelDefinition, best?: LevelBest): PuzzleState {
  return {
    ...createInitialState(def),
    board: def.solved,
    status: 'solved',
    moves: best?.moves ?? 0,
    recovery: [],
  };
}
