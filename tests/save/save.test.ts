import { describe, expect, it } from 'vitest';
import { applyCommand, createInitialState } from '../../src/engine/engine.ts';
import { CHAPTER_LEVELS, LAB_LEVELS, LEVEL_PACK, coveredBases } from '../../src/campaign/campaign.ts';
import { createMemoryAdapter, loadSave, migrateV1, newSave, recordCompletion, serializeSave, upgradeAttemptV2, DEFAULT_SETTINGS, M1_TO_M2, SCHEMA_VERSION } from '../../src/persistence/save.ts';
import { energyOf } from '../../src/engine/engine.ts';
import { START_ENERGY } from '../../src/engine/powers.ts';

const def = CHAPTER_LEVELS[1]!;

function savedMidGame() {
  let s = createInitialState(def);
  s = applyCommand(def, s, { type: 'slide', ...def.certificateSlides[0]! }).state;
  const save = { ...newSave(LEVEL_PACK), currentLevelId: def.id, attempts: { [def.id]: s } };
  return { s, save };
}

/** A save exactly as M1 (schema v1) wrote it. */
const m1Save = (completed: string[], withAttempt = false) => ({
  schemaVersion: 1,
  campaignId: 'genome-m1-ins-sample',
  generatorVersion: 'm1-gen-1',
  datasetId: 'refseq-NM_000207.3',
  currentLevelId: completed.at(-1) ?? 'm1-ins-01',
  completed,
  attempts: withAttempt ? { 'm1-ins-02': { levelId: 'm1-ins-02', board: 'x', moves: 3 } } : {},
  settings: { reducedMotion: true },
});

describe('save / reload (v3)', () => {
  it('schema is v4 and records the campaign and every catalogue dataset', () => {
    const s = newSave(LEVEL_PACK);
    expect(SCHEMA_VERSION).toBe(5);
    expect(s.settings).toEqual(DEFAULT_SETTINGS);
    expect(s.datasets).toEqual(LEVEL_PACK.datasets);
    expect(s.discovered).toEqual([]);
    expect(s.best).toEqual({});
  });
  it('a mid-game board, moves, recovery path and undo history survive reload', () => {
    const { s, save } = savedMidGame();
    const { save: loaded, notices } = loadSave(createMemoryAdapter(serializeSave(save)), LEVEL_PACK);
    expect(notices).toEqual([]);
    expect(loaded.currentLevelId).toBe(def.id);
    expect(loaded.attempts[def.id]).toEqual(s);
    expect(applyCommand(def, loaded.attempts[def.id]!, { type: 'undo' }).state.board).toBe(def.initial);
  });
  it('completions and discoveries across both genes survive reload', () => {
    const ins = CHAPTER_LEVELS.filter((l) => l.symbol === 'INS');
    const hbb = CHAPTER_LEVELS.filter((l) => l.symbol === 'HBB');
    const save = { ...newSave(LEVEL_PACK), completed: [ins[0]!.id, hbb[0]!.id], discovered: ['INS'] };
    const r = loadSave(createMemoryAdapter(serializeSave(save)), LEVEL_PACK);
    expect(r.save.completed).toEqual([ins[0]!.id, hbb[0]!.id]);
    expect(r.save.discovered).toEqual(['INS', 'HBB']);
    expect(coveredBases(r.save.completed, 'INS')).toBe(ins[0]!.sourceIntervals[0]!.end - ins[0]!.sourceIntervals[0]!.start);
    expect(coveredBases(r.save.completed, 'HBB')).toBe(hbb[0]!.sourceIntervals[0]!.end - hbb[0]!.sourceIntervals[0]!.start);
  });
  it('a fresh device starts a new save', () => {
    const r = loadSave(createMemoryAdapter(null), LEVEL_PACK);
    expect(r.save).toEqual(newSave(LEVEL_PACK));
    expect(r.notices).toEqual([]);
  });
  it('corrupted JSON is backed up and reported, never silently wiped', () => {
    const adapter = createMemoryAdapter('{not json');
    const r = loadSave(adapter, LEVEL_PACK);
    expect(r.recovered).toBe(true);
    expect(r.notices.length).toBe(1);
    expect(adapter.backups).toEqual(['{not json']);
  });
  it('an invalid board (tampered multiset) restarts that board but keeps completion credit', () => {
    const { s, save } = savedMidGame();
    const tampered = { ...save, completed: [CHAPTER_LEVELS[0]!.id], attempts: { [def.id]: { ...s, board: 'Z'.repeat(s.board.length) } } };
    const adapter = createMemoryAdapter(JSON.stringify(tampered));
    const r = loadSave(adapter, LEVEL_PACK);
    expect(r.save.attempts[def.id]).toBeUndefined();
    expect(r.save.completed).toEqual([CHAPTER_LEVELS[0]!.id]);
    expect(r.notices.length).toBe(1);
    expect(adapter.backups.length).toBe(1);
  });
  it('a stale recovery path is rejected so hints are never invalid', () => {
    const { s, save } = savedMidGame();
    const bad = { ...save, attempts: { [def.id]: { ...s, recovery: [] } } };
    expect(loadSave(createMemoryAdapter(JSON.stringify(bad)), LEVEL_PACK).save.attempts[def.id]).toBeUndefined();
  });
  it('a level-pack or dataset change keeps completions and reports restarted boards', () => {
    const { save } = savedMidGame();
    for (const old of [{ ...save, generatorVersion: 'm0', completed: [def.id] }, { ...save, datasets: { ...save.datasets, HBB: 'other' }, completed: [def.id] }]) {
      const r = loadSave(createMemoryAdapter(JSON.stringify(old)), LEVEL_PACK);
      expect(r.save.completed).toEqual([def.id]);
      expect(r.save.attempts).toEqual({});
      expect(r.notices[0]).toMatch(/updated/);
    }
  });
  it('an unknown schema version is backed up, not silently overwritten', () => {
    const adapter = createMemoryAdapter(JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1 }));
    const r = loadSave(adapter, LEVEL_PACK);
    expect(r.recovered).toBe(true);
    expect(adapter.backups.length).toBe(1);
  });
});

describe('M1 (v1) → current migration', () => {
  it('no longer maps M1 level 1 onto a retired sample challenge', () => {
    expect(M1_TO_M2).toEqual({});
  });
  it('a full M1 save keeps prototype history only, with notices, and no campaign credit', () => {
    const raw = JSON.stringify(m1Save(['m1-ins-01', 'm1-ins-02', 'm1-ins-03'], true));
    const adapter = createMemoryAdapter(raw);
    const r = loadSave(adapter, LEVEL_PACK);
    expect(r.save.schemaVersion).toBe(SCHEMA_VERSION);
    expect(r.save.completed).toEqual([]);
    expect(r.save.legacy.m1Completed).toEqual(['m1-ins-01', 'm1-ins-02', 'm1-ins-03']);
    expect(r.save.settings).toEqual({ ...DEFAULT_SETTINGS, reducedMotion: true });
    expect(r.save.attempts).toEqual({});
    expect(coveredBases(r.save.completed, 'INS')).toBe(0);
    expect(r.notices.join(' ')).toMatch(/retired/);
    expect(r.notices.join(' ')).toMatch(/1 and 2 and 3/);
    expect(r.notices.join(' ')).toMatch(/restarted/);
    expect(adapter.backups).toEqual([raw]);
    expect(adapter.labels).toEqual(['m1']);
    expect(r.recovered).toBe(true);
  });
  it('a migrated save round-trips as v2 without further notices or loss', () => {
    const m = migrateV1(m1Save(['m1-ins-01', 'm1-ins-02']), LEVEL_PACK);
    const again = loadSave(createMemoryAdapter(serializeSave(m.save)), LEVEL_PACK);
    expect(again.notices).toEqual([]);
    expect(again.save.completed).toEqual([]);
    expect(again.save.legacy.m1Completed).toEqual(['m1-ins-01', 'm1-ins-02']);
  });
  it('an M1 save with nothing completed migrates cleanly', () => {
    const r = migrateV1(m1Save([]), LEVEL_PACK);
    expect(r.save.completed).toEqual([]);
    expect(r.save.legacy.m1Completed).toEqual([]);
    expect(r.notices).toHaveLength(1);
  });
});

/** Strip M3 fields: the attempt exactly as M2 (schema v2) wrote it. */
function asV2Attempt(a: ReturnType<typeof createInitialState>) {
  const snap = (x: { board: string; moves: number; recovery: unknown }) => ({ board: x.board, moves: x.moves, recovery: x.recovery });
  return { levelId: a.levelId, status: a.status, ...snap(a), history: a.history.map(snap) };
}

describe('M2 (v2) → M3 (v3) migration', () => {
  const mid = LAB_LEVELS.find((l) => l.lab === 'scaffold')!;
  function m2Save() {
    let s = createInitialState(mid);
    for (const sl of mid.certificateSlides.slice(0, 2)) s = applyCommand(mid, s, { type: 'slide', ...sl }).state;
    const v3 = newSave(LEVEL_PACK);
    const raw = {
      ...v3,
      schemaVersion: 2,
      campaignId: 'genome-m2-ins-hbb',
      settings: { reducedMotion: true },
      completed: [LAB_LEVELS[0]!.id],
      discovered: [],
      currentLevelId: mid.id,
      attempts: { [mid.id]: asV2Attempt(s) },
    };
    return { s, raw: JSON.stringify(raw) };
  }
  it('keeps every completion, the in-progress board, moves and undo history, with a notice and a backup', () => {
    const { s, raw } = m2Save();
    const adapter = createMemoryAdapter(raw);
    const r = loadSave(adapter, LEVEL_PACK);
    expect(r.save.schemaVersion).toBe(5);
    expect(r.save.completed).toEqual([LAB_LEVELS[0]!.id]);
    expect(r.save.currentLevelId).toBe(mid.id);
    expect(r.save.settings).toEqual({ ...DEFAULT_SETTINGS, reducedMotion: true });
    const a = r.save.attempts[mid.id]!;
    expect(a).toBeDefined();
    expect(a.board).toBe(s.board);
    expect(a.moves).toBe(s.moves);
    expect(a.recovery).toEqual(s.recovery);
    expect(a.history.map((h) => h.board)).toEqual(s.history.map((h) => h.board));
    expect(a.locks).toEqual([]);
    expect(a.scaffold).toBeNull();
    expect(r.notices[0]).toMatch(/All your progress was kept/);
    expect(adapter.labels).toEqual(['m2']);
    expect(adapter.backups).toEqual([raw]);
    // Upgraded attempt is still playable: undo works and certified hints still finish it.
    expect(applyCommand(mid, a, { type: 'undo' }).state.board).toBe(s.history.at(-1)!.board);
  });
  it('credits energy for codons the player had already completed by normal moves (no more, capped)', () => {
    const { s } = m2Save();
    const up = upgradeAttemptV2(mid, asV2Attempt(s)) as typeof s;
    expect(up.ledger).toEqual(s.ledger);
    expect(energyOf(up)).toBe(energyOf(s));
    expect(energyOf(up)).toBeGreaterThanOrEqual(START_ENERGY);
  });
  it('round-trips as v3 with no further notices', () => {
    const r = loadSave(createMemoryAdapter(m2Save().raw), LEVEL_PACK);
    const again = loadSave(createMemoryAdapter(serializeSave(r.save)), LEVEL_PACK);
    expect(again.notices).toEqual([]);
    expect(again.save).toEqual(r.save);
  });
  it('an M3 attempt with powers in use (lock, scaffold, edit) survives reload', () => {
    const lab = LAB_LEVELS.find((l) => l.lab === 'scaffold')!;
    let st = createInitialState(lab);
    const save0 = newSave(LEVEL_PACK);
    st = applyCommand(lab, st, { type: 'slide', ...lab.certificateSlides[0]! }).state;
    const save = { ...save0, currentLevelId: lab.id, attempts: { [lab.id]: st } };
    const r = loadSave(createMemoryAdapter(serializeSave(save)), LEVEL_PACK);
    expect(r.notices).toEqual([]);
    expect(r.save.attempts[lab.id]).toEqual(st);
  });
  it('settings toggles persist; unknown setting values fall back to defaults', () => {
    const save = { ...newSave(LEVEL_PACK), settings: { reducedMotion: false, sound: true, haptics: false } };
    expect(loadSave(createMemoryAdapter(serializeSave(save)), LEVEL_PACK).save.settings).toEqual({ reducedMotion: false, sound: true, haptics: false });
    const bad = { ...newSave(LEVEL_PACK), settings: { reducedMotion: 'x', sound: 3 } };
    expect(loadSave(createMemoryAdapter(JSON.stringify(bad)), LEVEL_PACK).save.settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe('completion credit', () => {
  it('is idempotent: replaying a level never adds duplicate credit or bases', () => {
    let save = newSave(LEVEL_PACK);
    save = recordCompletion(save, def.id);
    const once = coveredBases(save.completed, def.symbol);
    save = recordCompletion(save, def.id);
    expect(save.completed).toEqual([def.id]);
    expect(coveredBases(save.completed, def.symbol)).toBe(once);
    expect(once).toBe(def.sourceIntervals[0]!.end - def.sourceIntervals[0]!.start);
  });
  it('duplicate and unknown ids in a loaded save are dropped; discovery is recomputed from chapter openers', () => {
    const opener = CHAPTER_LEVELS[0]!;
    const save = { ...newSave(LEVEL_PACK), completed: [opener.id, opener.id, 'bogus', 'ins-01'], discovered: ['INS', 'XYZ'] };
    const r = loadSave(createMemoryAdapter(JSON.stringify(save)), LEVEL_PACK).save;
    expect(r.completed).toEqual([opener.id]);
    expect(r.discovered).toEqual(['INS']);
  });
  it('Enzyme lab completions are kept but add no coverage', () => {
    const save = recordCompletion(newSave(LEVEL_PACK), LAB_LEVELS[0]!.id);
    const r = loadSave(createMemoryAdapter(serializeSave(save)), LEVEL_PACK).save;
    expect(r.completed).toEqual([LAB_LEVELS[0]!.id]);
    expect(coveredBases(r.completed, 'INS') + coveredBases(r.completed, 'HBB')).toBe(0);
  });
});
