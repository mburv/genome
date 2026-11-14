import { describe, expect, it } from 'vitest';
import { applyCommand, createInitialState } from '../../src/engine/engine.ts';
import { CHAPTER_LEVELS, LAB_LEVELS, LEVEL_PACK, RETIRED_SAMPLE_IDS, chapterOf } from '../../src/campaign/campaign.ts';
import { createMemoryAdapter, loadSave, newSave, recordAssembly, recordCompletion, serializeSave } from '../../src/persistence/save.ts';

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
    completed: [...RETIRED_SAMPLE_IDS.slice(0, 5), LAB_LEVELS[0]!.id],
    discovered: [],
    currentLevelId: mid.id,
    attempts: { [mid.id]: asV3(s) },
    settings: { reducedMotion: false, sound: true, haptics: false },
  };
  return { mid, s, raw: JSON.stringify(raw) };
}

describe('M3 (v3) → current (v5) migration', () => {
  it('keeps every completion, lab credit, settings and the in-progress board; backs up as m3 with a notice', () => {
    const { mid, s, raw } = m3Save();
    const adapter = createMemoryAdapter(raw);
    const r = loadSave(adapter, LEVEL_PACK);
    expect(r.save.schemaVersion).toBe(5);
    expect(r.save.completed).toEqual([LAB_LEVELS[0]!.id]);
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
    expect(r.notices.join(' ')).toMatch(/retired/);
    expect(r.notices[0]).toMatch(/All your progress was kept/);
  });
  it('round-trips as v5 with no further notices', () => {
    const r = loadSave(createMemoryAdapter(m3Save().raw), LEVEL_PACK);
    const again = loadSave(createMemoryAdapter(serializeSave(r.save)), LEVEL_PACK);
    expect(again.notices).toEqual([]);
    expect(again.save).toEqual(r.save);
  });
});

describe('assembly records', () => {
  it('recordAssembly only accepts a verified reconstruction and is idempotent', () => {
    let save = newSave(LEVEL_PACK);
    const ch = chapterOf('INS');
    for (const l of ch.slice(0, -1)) save = recordCompletion(save, l.id);
    expect(recordAssembly(save, 'INS').assembled).toEqual([]);
    save = recordCompletion(save, ch.at(-1)!.id);
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
  it('a CRISPR-edited chapter board (custom tokens) survives reload', () => {
    const def = CHAPTER_LEVELS.find((l) => l.tier === 12)!;
    let s: ReturnType<typeof createInitialState> = { ...createInitialState(def), ledger: { earned: 7, credited: [] } };
    const cell = def.tracks[0]!.cells[0]!;
    const seq = def.tokens![s.board[cell]!]!.seq;
    s = applyCommand(def, s, { type: 'edit', cell, base: seq[0] === 'A' ? 'C' : 'A', pos: 0 }).state;
    const save = { ...newSave(LEVEL_PACK), currentLevelId: def.id, attempts: { [def.id]: s } };
    const r = loadSave(createMemoryAdapter(serializeSave(save)), LEVEL_PACK);
    expect(r.notices).toEqual([]);
    expect(r.save.attempts[def.id]).toEqual(s);
  });
});

describe('v4 → v5 sample-campaign retirement', () => {
  it('drops sample progress, keeps chapters, labs, bests and settings, and retargets the current level', () => {
    const opener = CHAPTER_LEVELS[0]!;
    const lab = LAB_LEVELS[0]!;
    const v5 = { ...newSave(LEVEL_PACK) };
    const raw = JSON.stringify({
      ...v5,
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
    expect(r.save.schemaVersion).toBe(5);
    expect(r.save.completed).toEqual([opener.id, lab.id]);
    expect(r.save.discovered).toEqual(['INS']);
    expect(r.save.best).toEqual({ [opener.id]: { moves: 2, powersUsed: 0 }, [lab.id]: { moves: 3, powersUsed: 0 } });
    expect(r.save.settings).toEqual({ reducedMotion: true, sound: true, haptics: false });
    expect(r.save.currentLevelId).toBe(CHAPTER_LEVELS[1]!.id);
    expect(r.notices.join(' ')).toMatch(/retired/);
    expect(r.notices.join(' ')).toMatch(/Sample-level completions no longer count/);
    expect(adapter.labels).toEqual(['m4']);
    const again = loadSave(createMemoryAdapter(serializeSave(r.save)), LEVEL_PACK);
    expect(again.notices).toEqual([]);
    expect(again.save).toEqual(r.save);
  });
});
