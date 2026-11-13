import { isCompatibleBoard, type PuzzleState, type Snapshot, HISTORY_CAP } from '../engine/engine.ts';
import { applyMove } from '../engine/grid.ts';
import type { LevelDefinition, Move } from '../engine/types.ts';
import type { LevelPack } from '../campaign/campaign.ts';

export const SAVE_KEY = 'genome-save';
export const SCHEMA_VERSION = 1;

export interface SaveData {
  schemaVersion: typeof SCHEMA_VERSION;
  campaignId: string;
  generatorVersion: string;
  datasetId: string;
  currentLevelId: string;
  /** Completed level ids, each at most once (no duplicate credit on replay). */
  completed: string[];
  attempts: Record<string, PuzzleState>;
  settings: { reducedMotion: boolean };
}

/** Injected persistence. The browser uses localStorage for the demo only. */
export interface StorageAdapter {
  load(): string | null;
  save(raw: string): boolean;
  backup(raw: string): boolean;
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
    backup: (raw) => safe(() => (localStorage.setItem(`${key}-backup`, raw), true), false),
  };
}

export function createMemoryAdapter(initial: string | null = null): StorageAdapter & { raw: string | null; backups: string[] } {
  const a = {
    raw: initial,
    backups: [] as string[],
    load: () => a.raw,
    save: (raw: string) => ((a.raw = raw), true),
    backup: (raw: string) => (a.backups.push(raw), true),
  };
  return a;
}

export function newSave(pack: LevelPack): SaveData {
  return {
    schemaVersion: SCHEMA_VERSION,
    campaignId: pack.campaignId,
    generatorVersion: pack.generatorVersion,
    datasetId: pack.datasetId,
    currentLevelId: pack.levels[0]!.id,
    completed: [],
    attempts: {},
    settings: { reducedMotion: false },
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

function validSnapshot(def: LevelDefinition, s: unknown): s is Snapshot {
  if (typeof s !== 'object' || s === null) return false;
  const o = s as Record<string, unknown>;
  return isCompatibleBoard(def, o.board) && Number.isInteger(o.moves) && Array.isArray(o.recovery) && o.recovery.every(isMove) && recoveryReplays(def, o.board, o.recovery);
}

function validAttempt(def: LevelDefinition, a: unknown): a is PuzzleState {
  if (!validSnapshot(def, a)) return false;
  const o = a as unknown as Record<string, unknown>;
  if (o.levelId !== def.id || (o.status !== 'playing' && o.status !== 'solved') || !Array.isArray(o.history)) return false;
  return o.history.length <= HISTORY_CAP && o.history.every((h) => validSnapshot(def, h));
}

export interface LoadResult {
  save: SaveData;
  notices: string[];
  /** True when stored data could not be used as-is; a raw backup was written first. */
  recovered: boolean;
}

/**
 * Parse and validate a save. Invalid parts are never silently discarded: the raw save is backed up
 * and a notice is returned for the UI. Completion credit is kept whenever its level still exists.
 */
export function loadSave(adapter: StorageAdapter, pack: LevelPack): LoadResult {
  const raw = adapter.load();
  const fresh = newSave(pack);
  if (raw === null) return { save: fresh, notices: [], recovered: false };
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
    if (typeof data !== 'object' || data === null) throw new Error('not an object');
  } catch {
    adapter.backup(raw);
    return { save: fresh, notices: ['Your saved progress could not be read. A backup copy was kept and a new game started.'], recovered: true };
  }
  const notices: string[] = [];
  if (data.schemaVersion !== SCHEMA_VERSION) {
    adapter.backup(raw);
    return { save: fresh, notices: [`Save format ${String(data.schemaVersion)} is not supported by this build. A backup copy was kept.`], recovered: true };
  }
  const ids = new Set(pack.levels.map((l) => l.id));
  const completed = Array.isArray(data.completed) ? [...new Set(data.completed.filter((id): id is string => typeof id === 'string' && ids.has(id)))] : [];
  const sameContent = data.generatorVersion === pack.generatorVersion && data.datasetId === pack.datasetId;
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
  if (notices.length) adapter.backup(raw);
  const current = typeof data.currentLevelId === 'string' && ids.has(data.currentLevelId) ? data.currentLevelId : fresh.currentLevelId;
  const settings = typeof data.settings === 'object' && data.settings !== null ? (data.settings as Record<string, unknown>) : {};
  return {
    save: { ...fresh, currentLevelId: current, completed, attempts, settings: { reducedMotion: settings.reducedMotion === true } },
    notices,
    recovered: notices.length > 0,
  };
}

/** Idempotent completion: a level is credited at most once. */
export function recordCompletion(save: SaveData, levelId: string): SaveData {
  return save.completed.includes(levelId) ? save : { ...save, completed: [...save.completed, levelId] };
}
