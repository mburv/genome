import { isCompatibleBoard, levelCodons, type PuzzleState, type Snapshot, HISTORY_CAP, createInitialState } from '../engine/engine.ts';
import { codonComplete, ENERGY_CAP, POWERS, START_ENERGY, scaffoldTrack, SCAFFOLD_TURNS, type Power } from '../engine/powers.ts';
import { applyMove } from '../engine/grid.ts';
import type { LevelDefinition, Move } from '../engine/types.ts';
import type { LevelPack } from '../campaign/campaign.ts';

export const SAVE_KEY = 'genome-save';
export const SCHEMA_VERSION = 3;

export interface SaveData {
  schemaVersion: typeof SCHEMA_VERSION;
  campaignId: string;
  generatorVersion: string;
  /** Dataset id per gene symbol the boards were generated from. */
  datasets: Record<string, string>;
  currentLevelId: string;
  /** Completed level ids, each at most once (no duplicate credit on replay). */
  completed: string[];
  /** Gene symbols whose discovery card has been revealed to the player. */
  discovered: string[];
  attempts: Record<string, PuzzleState>;
  /** Progress kept from earlier builds that has no exact equivalent in this campaign. */
  legacy: { m1Completed: string[] };
  settings: Settings;
}

export interface Settings {
  reducedMotion: boolean;
  /** Locally synthesised sound effects (Web Audio, no files). Off by default. */
  sound: boolean;
  /** navigator.vibrate where supported. */
  haptics: boolean;
}

export const DEFAULT_SETTINGS: Settings = { reducedMotion: false, sound: false, haptics: true };

/**
 * M1 → M2 level equivalence. Only M1 level 1 is the same challenge in M2 (INS CDS [0,9), sequencing).
 * M1 levels 2–3 used intervals/modes that M2 redesigned, so they are kept as legacy history.
 */
export const M1_TO_M2: Readonly<Record<string, string>> = { 'm1-ins-01': 'ins-01' };

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
    datasets: { ...pack.datasets },
    currentLevelId: pack.levels[0]!.id,
    completed: [],
    discovered: [],
    attempts: {},
    legacy: { m1Completed: [] },
    settings: { ...DEFAULT_SETTINGS },
  };
}

export const serializeSave = (s: SaveData): string => JSON.stringify(s);

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

function validSnapshot(def: LevelDefinition, s: unknown): s is Snapshot {
  if (typeof s !== 'object' || s === null) return false;
  const o = s as Record<string, unknown>;
  if (!Number.isInteger(o.edits) || (o.edits as number) < 0) return false;
  if (!isCompatibleBoard(def, o.board, o.edits as number) || !Number.isInteger(o.moves)) return false;
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
  const ids = new Set(pack.levels.map((l) => l.id));
  const m1Completed = [...new Set(strings(data.completed).filter((id) => id.startsWith('m1-')))];
  const carried = m1Completed.map((id) => M1_TO_M2[id]).filter((id): id is string => !!id && ids.has(id));
  const legacy = m1Completed.filter((id) => !M1_TO_M2[id]);
  const notices = ['GENOME updated to the 12-level INS + HBB sample campaign.'];
  if (carried.length) notices.push('Your completed M1 level 1 carries over (same INS fragment, bases 1–9).');
  if (legacy.length) notices.push(`M1 levels ${legacy.map((id) => Number(id.slice(-2))).join(' and ')} were redesigned as new challenges, so they need replaying for credit. They are kept as M1 history on the map.`);
  if (Object.keys((data.attempts as object | undefined) ?? {}).length) notices.push('Boards in progress from M1 were restarted because the levels changed.');
  return {
    save: { ...fresh, completed: carried, legacy: { m1Completed }, settings: readSettings(data.settings) },
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
  if (data.schemaVersion === 2) {
    // M2 → M3: keep everything; add power state to boards in progress. Raw copy kept first.
    adapter.backup(raw, 'm2');
    const rawAttempts = typeof data.attempts === 'object' && data.attempts !== null ? (data.attempts as Record<string, unknown>) : {};
    const attempts = Object.fromEntries(Object.entries(rawAttempts).map(([id, a]) => {
      const def = pack.levels.find((l) => l.id === id);
      return [id, def ? upgradeAttemptV2(def, a) : a];
    }));
    data = { ...data, schemaVersion: SCHEMA_VERSION, attempts };
    upgradedV2 = true;
  }
  if (data.schemaVersion !== SCHEMA_VERSION) {
    adapter.backup(raw);
    return { save: fresh, notices: [`Save format ${String(data.schemaVersion)} is not supported by this build. A backup copy was kept.`], recovered: true };
  }
  const notices: string[] = [];
  const ids = new Set(pack.levels.map((l) => l.id));
  const completed = [...new Set(strings(data.completed).filter((id) => ids.has(id)))];
  const discovered = [...new Set(strings(data.discovered).filter((g) => g in pack.datasets))];
  const datasets = typeof data.datasets === 'object' && data.datasets !== null ? (data.datasets as Record<string, unknown>) : {};
  const sameContent = data.generatorVersion === pack.generatorVersion && Object.entries(pack.datasets).every(([g, id]) => datasets[g] === id);
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
  if (notices.length && !upgradedV2) adapter.backup(raw);
  if (upgradedV2) notices.unshift(`GENOME updated: enzyme power-ups (CRISPR, Ligase, Scaffold) are available from level 4, with three Enzyme lab tutorials on the map. ${notices.length ? 'Completed levels were kept.' : 'All your progress was kept.'}`);
  const current = typeof data.currentLevelId === 'string' && ids.has(data.currentLevelId) ? data.currentLevelId : fresh.currentLevelId;
  const legacyRaw = typeof data.legacy === 'object' && data.legacy !== null ? (data.legacy as Record<string, unknown>) : {};
  return {
    save: { ...fresh, currentLevelId: current, completed, discovered, attempts, legacy: { m1Completed: strings(legacyRaw.m1Completed) }, settings: readSettings(data.settings) },
    notices,
    recovered: notices.length > 0,
  };
}

/** Idempotent completion: a level is credited at most once. */
export function recordCompletion(save: SaveData, levelId: string): SaveData {
  return save.completed.includes(levelId) ? save : { ...save, completed: [...save.completed, levelId] };
}
