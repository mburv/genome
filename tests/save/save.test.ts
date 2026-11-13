import { describe, expect, it } from 'vitest';
import { applyCommand, createInitialState } from '../../src/engine/engine.ts';
import { LEVEL_PACK, LEVELS, coveredBases, sampleBases } from '../../src/campaign/campaign.ts';
import { createMemoryAdapter, loadSave, newSave, recordCompletion, serializeSave, SCHEMA_VERSION } from '../../src/persistence/save.ts';

const def = LEVELS[1]!;

function savedMidGame() {
  let s = createInitialState(def);
  s = applyCommand(def, s, { type: 'rotate', move: def.certificate[0]! }).state;
  const save = { ...newSave(LEVEL_PACK), currentLevelId: def.id, attempts: { [def.id]: s } };
  return { s, save };
}

describe('save / reload', () => {
  it('a mid-game board, moves, recovery path and undo history survive reload', () => {
    const { s, save } = savedMidGame();
    const adapter = createMemoryAdapter(serializeSave(save));
    const { save: loaded, notices } = loadSave(adapter, LEVEL_PACK);
    expect(notices).toEqual([]);
    expect(loaded.currentLevelId).toBe(def.id);
    expect(loaded.attempts[def.id]).toEqual(s);
    const undone = applyCommand(def, loaded.attempts[def.id]!, { type: 'undo' }).state;
    expect(undone.board).toBe(def.initial);
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
  it('a level-pack version change keeps completions and reports restarted boards', () => {
    const { save } = savedMidGame();
    const old = { ...save, generatorVersion: 'm0', completed: [def.id] };
    const r = loadSave(createMemoryAdapter(JSON.stringify(old)), LEVEL_PACK);
    expect(r.save.completed).toEqual([def.id]);
    expect(r.save.attempts).toEqual({});
    expect(r.notices[0]).toMatch(/updated/);
  });
  it('an unknown schema version is backed up, not silently overwritten', () => {
    const adapter = createMemoryAdapter(JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1 }));
    const r = loadSave(adapter, LEVEL_PACK);
    expect(r.recovered).toBe(true);
    expect(adapter.backups.length).toBe(1);
  });
});

describe('completion credit', () => {
  it('is idempotent: replaying a level never adds duplicate credit or bases', () => {
    let save = newSave(LEVEL_PACK);
    save = recordCompletion(save, def.id);
    const once = coveredBases(save.completed);
    save = recordCompletion(save, def.id);
    expect(save.completed).toEqual([def.id]);
    expect(coveredBases(save.completed)).toBe(once);
    expect(once).toBe(9);
  });
  it('M1 sample covers exactly 27 bases of the 333-base CDS (no full-gene claim)', () => {
    expect(sampleBases()).toBe(27);
  });
  it('duplicate ids in a loaded save are de-duplicated', () => {
    const save = { ...newSave(LEVEL_PACK), completed: [def.id, def.id, 'bogus'] };
    expect(loadSave(createMemoryAdapter(JSON.stringify(save)), LEVEL_PACK).save.completed).toEqual([def.id]);
  });
});
