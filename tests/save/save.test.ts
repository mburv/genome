import { describe, expect, it } from 'vitest';
import { applyCommand, createInitialState } from '../../src/engine/engine.ts';
import { LEVEL_PACK, LEVELS, coveredBases, sampleBases } from '../../src/campaign/campaign.ts';
import { createMemoryAdapter, loadSave, migrateV1, newSave, recordCompletion, serializeSave, M1_TO_M2, SCHEMA_VERSION } from '../../src/persistence/save.ts';

const def = LEVELS[1]!;

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

describe('save / reload (v2)', () => {
  it('schema is v2 and records the campaign and both datasets', () => {
    const s = newSave(LEVEL_PACK);
    expect(SCHEMA_VERSION).toBe(2);
    expect(s.datasets).toEqual(LEVEL_PACK.datasets);
    expect(s.discovered).toEqual([]);
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
    const save = { ...newSave(LEVEL_PACK), completed: LEVELS.slice(0, 7).map((l) => l.id), discovered: ['INS'] };
    const r = loadSave(createMemoryAdapter(serializeSave(save)), LEVEL_PACK);
    expect(r.save.completed).toEqual(save.completed);
    expect(r.save.discovered).toEqual(['INS']);
    expect(coveredBases(r.save.completed, 'INS')).toBe(51);
    expect(coveredBases(r.save.completed, 'HBB')).toBe(9);
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
    const tampered = { ...save, completed: [LEVELS[0]!.id], attempts: { [def.id]: { ...s, board: s.board.replace(/[ACG]/, 'T') } } };
    const adapter = createMemoryAdapter(JSON.stringify(tampered));
    const r = loadSave(adapter, LEVEL_PACK);
    expect(r.save.attempts[def.id]).toBeUndefined();
    expect(r.save.completed).toEqual([LEVELS[0]!.id]);
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

describe('M1 (v1) → M2 (v2) migration', () => {
  it('maps only the identical challenge: M1 level 1 → ins-01', () => {
    expect(M1_TO_M2).toEqual({ 'm1-ins-01': 'ins-01' });
    const l = LEVELS.find((x) => x.id === 'ins-01')!;
    expect(l.mode).toBe('sequence');
    expect(l.sourceIntervals).toEqual([{ start: 0, end: 9 }]);
  });
  it('a full M1 save keeps every completion: level 1 as credit, levels 2–3 as legacy history, with notices', () => {
    const raw = JSON.stringify(m1Save(['m1-ins-01', 'm1-ins-02', 'm1-ins-03'], true));
    const adapter = createMemoryAdapter(raw);
    const r = loadSave(adapter, LEVEL_PACK);
    expect(r.save.schemaVersion).toBe(2);
    expect(r.save.completed).toEqual(['ins-01']);
    expect(r.save.legacy.m1Completed).toEqual(['m1-ins-01', 'm1-ins-02', 'm1-ins-03']);
    expect(r.save.settings.reducedMotion).toBe(true);
    expect(r.save.attempts).toEqual({});
    expect(coveredBases(r.save.completed, 'INS')).toBe(9);
    expect(r.notices.join(' ')).toMatch(/carries over/);
    expect(r.notices.join(' ')).toMatch(/2 and 3/);
    expect(r.notices.join(' ')).toMatch(/restarted/);
    expect(adapter.backups).toEqual([raw]);
    expect(adapter.labels).toEqual(['m1']);
    expect(r.recovered).toBe(true);
  });
  it('a migrated save round-trips as v2 without further notices or loss', () => {
    const m = migrateV1(m1Save(['m1-ins-01', 'm1-ins-02']), LEVEL_PACK);
    const again = loadSave(createMemoryAdapter(serializeSave(m.save)), LEVEL_PACK);
    expect(again.notices).toEqual([]);
    expect(again.save.completed).toEqual(['ins-01']);
    expect(again.save.legacy.m1Completed).toEqual(['m1-ins-01', 'm1-ins-02']);
  });
  it('an M1 save with nothing completed migrates cleanly', () => {
    const r = migrateV1(m1Save([]), LEVEL_PACK);
    expect(r.save.completed).toEqual([]);
    expect(r.save.legacy.m1Completed).toEqual([]);
    expect(r.notices).toHaveLength(1);
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
    expect(once).toBe(9);
  });
  it('the M2 sample covers exactly 51 bases per gene (no full-gene claim)', () => {
    expect(sampleBases('INS')).toBe(51);
    expect(sampleBases('HBB')).toBe(51);
  });
  it('duplicate and unknown ids in a loaded save are dropped', () => {
    const save = { ...newSave(LEVEL_PACK), completed: [def.id, def.id, 'bogus'], discovered: ['INS', 'XYZ'] };
    const r = loadSave(createMemoryAdapter(JSON.stringify(save)), LEVEL_PACK).save;
    expect(r.completed).toEqual([def.id]);
    expect(r.discovered).toEqual(['INS']);
  });
});
