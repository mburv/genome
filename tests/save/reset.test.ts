import { describe, expect, it } from 'vitest';
import { applyCommand, createInitialState } from '../../src/engine/engine.ts';
import { LEVEL_PACK, LEVELS } from '../../src/campaign/campaign.ts';
import {
  SAVE_KEY,
  clearProgressStorage,
  isGameProgressKey,
  newSave,
  recordBest,
  recordCompletion,
  resetProgress,
} from '../../src/persistence/save.ts';

function memoryStore(init: Record<string, string> = {}) {
  const data = { ...init };
  return {
    get data() { return data; },
    get length() { return Object.keys(data).length; },
    key(i: number) { return Object.keys(data)[i] ?? null; },
    getItem(name: string) { return Object.hasOwn(data, name) ? data[name]! : null; },
    setItem(name: string, value: string) { data[name] = value; },
    removeItem(name: string) { delete data[name]; },
  };
}

describe('resetProgress', () => {
  it('clears campaign progress but keeps the player’s settings', () => {
    const def = LEVELS[0]!;
    let s = createInitialState(def);
    s = applyCommand(def, s, { type: 'slide', ...def.certificateSlides[0]! }).state;
    let save = newSave(LEVEL_PACK);
    save = recordCompletion(save, def.id);
    save = recordBest(save, def.id, { moves: 1, powersUsed: 0 });
    save = {
      ...save,
      currentLevelId: LEVELS[2]!.id,
      discovered: ['INS'],
      assembled: ['HBB'],
      attempts: { [def.id]: s },
      legacy: { m1Completed: ['m1-ins-02'] },
      settings: { reducedMotion: true, sound: true, haptics: false },
    };

    const next = resetProgress(LEVEL_PACK, save.settings);
    expect(next).toEqual({
      ...newSave(LEVEL_PACK),
      settings: { reducedMotion: true, sound: true, haptics: false },
    });
    expect(next.completed).toEqual([]);
    expect(next.discovered).toEqual([]);
    expect(next.assembled).toEqual([]);
    expect(next.attempts).toEqual({});
    expect(next.best).toEqual({});
    expect(next.legacy).toEqual({ m1Completed: [] });
    expect(next.currentLevelId).toBe(LEVEL_PACK.levels[0]!.id);
    expect(next.settings).toEqual(save.settings);
    expect(next.settings).not.toBe(save.settings);
    expect(save.completed).toEqual([def.id]);
  });
});

describe('progress storage keys', () => {
  it('identifies the live save and every backup slot, and no other key', () => {
    expect(isGameProgressKey('genome-save')).toBe(true);
    expect(isGameProgressKey('genome-save-backup')).toBe(true);
    expect(isGameProgressKey('genome-save-backup-m1')).toBe(true);
    expect(isGameProgressKey('genome-save-backup-m2')).toBe(true);
    expect(isGameProgressKey('genome-save-backup-m3')).toBe(true);
    expect(isGameProgressKey('genome-save-settings')).toBe(false);
    expect(isGameProgressKey('other-app')).toBe(false);
    expect(SAVE_KEY).toBe('genome-save');
  });

  it('removes progress keys and leaves anything else alone', () => {
    const storage = memoryStore({
      'genome-save': '{"progress":true}',
      'genome-save-backup': 'old',
      'genome-save-backup-m1': 'm1',
      'genome-save-backup-m2': 'm2',
      'unrelated': 'keep',
    });
    expect(clearProgressStorage(storage)).toEqual([
      'genome-save',
      'genome-save-backup',
      'genome-save-backup-m1',
      'genome-save-backup-m2',
    ]);
    expect(storage.data).toEqual({ unrelated: 'keep' });
    expect(clearProgressStorage(storage)).toEqual([]);
  });
});
