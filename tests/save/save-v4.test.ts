import { describe, expect, it } from 'vitest';
import { applyCommand, createInitialState } from '../../src/engine/engine.ts';
import { CHAPTER_LEVELS, INTRO_IDS, LAB_LEVELS, LEVEL_PACK, runOf } from '../../src/campaign/campaign.ts';
import { createMemoryAdapter, loadSave, newSave, recordAssembly, recordCompletion, serializeSave, SCHEMA_VERSION } from '../../src/persistence/save.ts';

/** An attempt exactly as M3 (schema v3) wrote it: no `custom` table. */
function asV3(a: ReturnType<typeof createInitialState>) {
  const strip = (x: Record<string, unknown>) => { const rest = { ...x }; delete rest.custom; return rest; };
  return { ...strip(a as unknown as Record<string, unknown>), history: a.history.map((h) => strip(h as unknown as Record<string, unknown>)) };
}

function m3Save() {
  const mid = LAB_LEVELS[1]!;
  let s = createInitialState(mid);
  for (const sl of mid.certificateSlides.slice(0, 2)) s = applyCommand(mid, s, { type: 'slide', ...sl }).state;
  const v4 = newSave(LEVEL_PACK);
  const rest: Record<string, unknown> = { ...v4 };
  for (const k of ['assembled', 'tokenGeneratorVersion', 'catalogueId']) delete rest[k];
  const raw = {
    ...rest,
    schemaVersion: 3,
    campaignId: 'genome-m3-lab',
    datasets: { INS: LEVEL_PACK.datasets.INS, HBB: LEVEL_PACK.datasets.HBB },
    completed: [...INTRO_IDS.slice(0, 5), LAB_LEVELS[0]!.id],
    discovered: [],
    currentLevelId: mid.id,
    attempts: { [mid.id]: asV3(s) },
    settings: { reducedMotion: false, sound: true, haptics: false },
  };
  return { mid, s, raw: JSON.stringify(raw) };
}

describe('M3 (v3) → current (v6) migration', () => {
  it('keeps every completion, lab credit, settings and the in-progress board; backs up as m3 with a notice', () => {
    const { mid, s, raw } = m3Save();
    const adapter = createMemoryAdapter(raw);
    const r = loadSave(adapter, LEVEL_PACK);
    expect(r.save.schemaVersion).toBe(SCHEMA_VERSION);
    expect(r.save.completed).toEqual([...INTRO_IDS.slice(0, 5), LAB_LEVELS[0]!.id]);
    expect(r.save.settings).toEqual({ reducedMotion: false, sound: true, haptics: false });
    const a = r.save.attempts[mid.id]!;
    expect(a.board).toBe(s.board);
    expect(a.moves).toBe(s.moves);
    expect(a.custom).toEqual({});
    expect(a.history.every((h) => typeof h.custom === 'object')).toBe(true);
    expect(applyCommand(mid, a, { type: 'undo' }).state.board).toBe(s.history.at(-1)!.board);
    expect(r.save.assembled).toEqual([]);
    expect(adapter.labels).toEqual(['m3']);
    expect(adapter.backups).toEqual([raw]);
    expect(r.notices.join(' ')).toMatch(/full gene assembly/);
    expect(r.notices.join(' ')).not.toMatch(/retired/);
    expect(r.notices.join(' ')).toMatch(/All your progress was kept/);
    expect(r.notices.join(' ')).toMatch(/continue from where the 1-base intros left off/);
  });
  it('round-trips as v6 with no further notices', () => {
    const r = loadSave(createMemoryAdapter(m3Save().raw), LEVEL_PACK);
    const again = loadSave(createMemoryAdapter(serializeSave(r.save)), LEVEL_PACK);
    expect(again.notices).toEqual([]);
    expect(again.save).toEqual(r.save);
  });
});

describe('assembly records', () => {
  it('recordAssembly only accepts a verified reconstruction and is idempotent', () => {
    let save = newSave(LEVEL_PACK);
    const run = runOf('INS');
    for (const l of run.slice(0, -1)) save = recordCompletion(save, l.id);
    expect(recordAssembly(save, 'INS').assembled).toEqual([]);
    save = recordCompletion(save, run.at(-1)!.id);
    save = recordAssembly(save, 'INS');
    expect(save.assembled).toEqual(['INS']);
    expect(recordAssembly(save, 'INS')).toBe(save);
    const r = loadSave(createMemoryAdapter(serializeSave(save)), LEVEL_PACK);
    expect(r.save.assembled).toEqual(['INS']);
    expect(r.notices).toEqual([]);
  });
  it('a forged assembly claim is re-verified on load, cleared with a notice, and completions are kept', () => {
    const save = { ...newSave(LEVEL_PACK), completed: [CHAPTER_LEVELS[0]!.id], assembled: ['INS'] };
    const adapter = createMemoryAdapter(serializeSave(save));
    const r = loadSave(adapter, LEVEL_PACK);
    expect(r.save.assembled).toEqual([]);
    expect(r.save.completed).toEqual([CHAPTER_LEVELS[0]!.id]);
    expect(r.notices.join(' ')).toMatch(/re-verified/);
    expect(adapter.backups).toHaveLength(1);
  });
  it('rewinds a legacy powered campaign board to its last unpowered snapshot and keeps completions', () => {
    const def = CHAPTER_LEVELS.find((l) => l.tier === 12 && l.certificateSlides.length > 1)!;
    const initial = createInitialState(def);
    const first = def.certificateSlides[0]!;
    const prior = applyCommand(def, initial, { type: 'slide', ...first }).state;
    expect(prior.status).toBe('playing');
    const funded = { ...prior, ledger: { ...prior.ledger, earned: 7 } };
    const cell = def.tracks[0]!.cells[0]!;
    const seq = def.tokens![funded.board[cell]!]!.seq;
    const edited = applyCommand(def, funded, { type: 'edit', cell, base: seq[0] === 'A' ? 'C' : 'A', pos: 0 });
    expect(edited.accepted).toBe(true);
    expect(edited.state.status).toBe('playing');
    const save = { ...newSave(LEVEL_PACK), completed:['ins-01'], currentLevelId: def.id, attempts: { [def.id]: edited.state }, tutorialsSeen:['slide','slide-splice','slide-repair','slide-replicate'] };
    const adapter = createMemoryAdapter(serializeSave(save));
    const r = loadSave(adapter, LEVEL_PACK);
    const restored = r.save.attempts[def.id]!;
    expect(r.notices.join(' ')).toContain('powered sliding attempt');
    expect(restored.board).toEqual(prior.board);
    expect(restored.moves).toEqual(prior.moves);
    expect(restored.history).toEqual(prior.history);
    expect(restored.edits).toBe(0);
    expect(restored.custom).toEqual({});
    expect(r.save.completed).toEqual(['ins-01']);
    expect(r.save.tutorialsSeen).toEqual(save.tutorialsSeen);
    expect(adapter.backups).toHaveLength(1);
    expect(loadSave(createMemoryAdapter(serializeSave(r.save)),LEVEL_PACK).notices).toEqual([]);
  });
});

describe('v4 → v7 intro-level restore', () => {
  it('keeps matching intro completions, labs, bests and settings; drops remapped INS/HBB chapter credit', () => {
    const opener = CHAPTER_LEVELS[0]!;
    const lab = LAB_LEVELS[0]!;
    const base = { ...newSave(LEVEL_PACK) };
    const raw = JSON.stringify({
      ...base,
      schemaVersion: 4,
      currentLevelId: 'ins-06',
      completed: ['ins-01', 'ins-02', opener.id, lab.id],
      discovered: ['INS', 'HBB'],
      assembled: [],
      attempts: {},
      best: { 'ins-01': { moves: 1, powersUsed: 0 }, [opener.id]: { moves: 2, powersUsed: 0 }, [lab.id]: { moves: 3, powersUsed: 0 } },
      settings: { reducedMotion: true, sound: true, haptics: false },
    });
    const adapter = createMemoryAdapter(raw);
    const r = loadSave(adapter, LEVEL_PACK);
    expect(r.save.schemaVersion).toBe(SCHEMA_VERSION);
    expect(r.save.completed).toEqual(['ins-01', 'ins-02', lab.id]);
    expect(r.save.discovered).toEqual(['INS']);
    expect(r.save.best).toEqual({ 'ins-01': { moves: 1, powersUsed: 0 }, [lab.id]: { moves: 3, powersUsed: 0 } });
    expect(r.save.settings).toEqual({ reducedMotion: true, sound: true, haptics: false });
    expect(r.save.currentLevelId).toBe('ins-06');
    expect(r.notices.join(' ')).toMatch(/intro levels in the main campaign/);
    expect(r.notices.join(' ')).toMatch(/continue from where the 1-base intros left off/);
    expect(r.notices.join(' ')).not.toMatch(/retired/);
    expect(adapter.labels).toEqual(['m4']);
    const again = loadSave(createMemoryAdapter(serializeSave(r.save)), LEVEL_PACK);
    expect(again.notices).toEqual([]);
    expect(again.save).toEqual(r.save);
  });
});

describe('v5 → v7 intro-level restore', () => {
  it('restores intro completions and bests from the m4 backup', () => {
    const opener = CHAPTER_LEVELS[0]!;
    const lab = LAB_LEVELS[0]!;
    const v4 = JSON.stringify({
      ...newSave(LEVEL_PACK),
      schemaVersion: 4,
      currentLevelId: 'ins-06',
      completed: ['ins-01', 'ins-02', opener.id, lab.id],
      discovered: ['INS'],
      assembled: [],
      attempts: {},
      best: { 'ins-01': { moves: 1, powersUsed: 0 }, 'ins-02': { moves: 2, powersUsed: 0 }, [opener.id]: { moves: 2, powersUsed: 0 }, [lab.id]: { moves: 3, powersUsed: 0 } },
      settings: { reducedMotion: true, sound: true, haptics: false },
    });
    const v5 = JSON.stringify({
      ...newSave(LEVEL_PACK),
      schemaVersion: 5,
      currentLevelId: opener.id,
      completed: [opener.id, lab.id],
      discovered: ['INS'],
      assembled: [],
      attempts: {},
      best: { [opener.id]: { moves: 2, powersUsed: 0 }, [lab.id]: { moves: 3, powersUsed: 0 } },
      settings: { reducedMotion: true, sound: true, haptics: false },
    });
    const adapter = createMemoryAdapter(v5);
    adapter.backup(v4, 'm4');
    const r = loadSave(adapter, LEVEL_PACK);
    expect(r.save.schemaVersion).toBe(SCHEMA_VERSION);
    expect(r.save.completed).toEqual([lab.id, 'ins-01', 'ins-02']);
    expect(r.save.discovered).toEqual(['INS']);
    expect(r.save.best).toEqual({
      [lab.id]: { moves: 3, powersUsed: 0 },
      'ins-01': { moves: 1, powersUsed: 0 },
      'ins-02': { moves: 2, powersUsed: 0 },
    });
    expect(r.save.currentLevelId).toBe(opener.id);
    expect(r.save.settings).toEqual({ reducedMotion: true, sound: true, haptics: false });
    expect(r.notices.join(' ')).toMatch(/have been restored/);
    expect(adapter.labels).toEqual(['m4', 'm5']);
    const again = loadSave(createMemoryAdapter(serializeSave(r.save)), LEVEL_PACK);
    expect(again.notices).toEqual([]);
    expect(again.save).toEqual(r.save);
  });

  it('keeps chapter progress when the m4 backup is missing', () => {
    const opener = CHAPTER_LEVELS[0]!;
    const v5 = JSON.stringify({
      ...newSave(LEVEL_PACK),
      schemaVersion: 5,
      currentLevelId: opener.id,
      completed: [opener.id],
      discovered: ['INS'],
      assembled: [],
      attempts: {},
      best: { [opener.id]: { moves: 2, powersUsed: 0 } },
    });
    const r = loadSave(createMemoryAdapter(v5), LEVEL_PACK);
    expect(r.save.schemaVersion).toBe(SCHEMA_VERSION);
    expect(r.save.completed).toEqual([]);
    expect(r.save.discovered).toEqual([]); // chapter opener is no longer the first INS puzzle
    expect(r.save.best).toEqual({});
    expect(r.notices.join(' ')).toMatch(/intro puzzles are back in the main campaign/);
    expect(r.notices.join(' ')).not.toMatch(/have been restored/);
  });
});

describe('v6 → v7 non-overlapping chapters', () => {
  it('keeps intro, lab and other-gene progress, resets INS/HBB chapter credit, and writes an m6 backup', () => {
    const lab = LAB_LEVELS[0]!.id;
    const other = CHAPTER_LEVELS.find((l) => l.symbol === 'HBA1')!.id;
    const raw = JSON.stringify({
      ...newSave(LEVEL_PACK),
      schemaVersion: 6,
      currentLevelId: 'ins-c01',
      completed: ['ins-01', 'ins-02', 'ins-c01', 'hbb-c01', other, lab],
      discovered: ['INS', 'HBB', 'HBA1'],
      assembled: [],
      attempts: { 'ins-c01': { levelId: 'ins-c01' } },
      best: { 'ins-01': { moves: 1, powersUsed: 0 }, 'ins-c01': { moves: 4, powersUsed: 0 }, [other]: { moves: 5, powersUsed: 0 } },
      settings: { reducedMotion: true, sound: true, haptics: false },
    });
    const adapter = createMemoryAdapter(raw);
    const r = loadSave(adapter, LEVEL_PACK);
    expect(r.save.schemaVersion).toBe(SCHEMA_VERSION);
    expect(r.save.completed).toEqual(['ins-01', 'ins-02', other, lab]);
    expect(r.save.best).toEqual({ 'ins-01': { moves: 1, powersUsed: 0 }, [other]: { moves: 5, powersUsed: 0 } });
    expect(r.save.attempts['ins-c01']).toBeUndefined();
    expect(r.save.currentLevelId).toBe('ins-c01');
    expect(r.save.settings).toEqual({ reducedMotion: true, sound: true, haptics: false });
    expect(r.save.discovered).toEqual(['INS', 'HBA1']);
    expect(r.notices.join(' ')).toMatch(/continue from where the 1-base intros left off/);
    expect(r.notices.join(' ')).toMatch(/ins-c01/);
    expect(adapter.labels).toEqual(['m6']);
    const again = loadSave(createMemoryAdapter(serializeSave(r.save)), LEVEL_PACK);
    expect(again.notices).toEqual([]);
    expect(again.save).toEqual(r.save);
  });
});
