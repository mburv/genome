import pack from './levels.generated.json';
import chapterPack from './chapters.generated.json';
import type { Interval, LevelDefinition } from '../engine/types.ts';

export interface LevelPack {
  campaignId: string;
  generatorVersion: string;
  /** M4: generator version of the token chapters (absent before M4). */
  tokenGeneratorVersion?: string;
  catalogueId?: string;
  /** Pinned dataset id per gene symbol. */
  datasets: Record<string, string>;
  levels: LevelDefinition[];
}

const m2 = pack as unknown as LevelPack;
const chapters = chapterPack as unknown as { catalogueId: string; generatorVersion: string; datasets: Record<string, string>; levels: LevelDefinition[] };

/**
 * Retired 12-level INS/HBB sample campaign, still generated into levels.generated.json so the
 * pinned chapter pack stays byte-identical (mask uniqueness and starting indexes). Not part of
 * the live campaign or saves.
 */
export const RETIRED_SAMPLE_LEVELS: readonly LevelDefinition[] = m2.levels.filter((l) => !l.lab);
export const RETIRED_SAMPLE_IDS: readonly string[] = RETIRED_SAMPLE_LEVELS.map((l) => l.id);
const LABS: readonly LevelDefinition[] = m2.levels.filter((l) => l.lab);

export const CAMPAIGN_ID = 'genome-m4-assembly';
/** First full-sequence chapter puzzle of the first catalogue gene; new players start here. */
export const OPENING_LEVEL_ID = chapters.levels[0]!.id;

/**
 * Live level pack: every assembly chapter, then the three Enzyme labs. The retired sample
 * challenges are omitted.
 */
export const LEVEL_PACK: LevelPack = {
  campaignId: CAMPAIGN_ID,
  generatorVersion: m2.generatorVersion,
  tokenGeneratorVersion: chapters.generatorVersion,
  catalogueId: chapters.catalogueId,
  datasets: { ...chapters.datasets, ...m2.datasets },
  levels: [...chapters.levels, ...LABS],
};
export const ALL_LEVELS: readonly LevelDefinition[] = LEVEL_PACK.levels;
/** M4 assembly chapter puzzles, grouped per gene in chapter order. */
export const CHAPTER_LEVELS: readonly LevelDefinition[] = ALL_LEVELS.filter((l) => l.chapter);
export const chapterOf = (symbol: string): LevelDefinition[] => CHAPTER_LEVELS.filter((l) => l.symbol === symbol);
/** Enzyme-lab tutorial levels: one free use of their power, no coverage credit. */
export const LAB_LEVELS: readonly LevelDefinition[] = ALL_LEVELS.filter((l) => l.lab);
/** @deprecated Use CHAPTER_LEVELS; kept as an alias for the live campaign puzzles of a gene. */
export const levelsForGene = (symbol: string, levels: readonly LevelDefinition[] = CHAPTER_LEVELS): LevelDefinition[] =>
  levels.filter((l) => l.symbol === symbol && !l.lab);

export function levelById(id: string): LevelDefinition | undefined {
  return ALL_LEVELS.find((l) => l.id === id);
}

/** Size of the union of CDS intervals of completed (non-lab) levels for one gene. Replays never add duplicate coverage. */
export function coveredBases(completedIds: readonly string[], symbol: string, levels: readonly LevelDefinition[] = ALL_LEVELS): number {
  const intervals: Interval[] = levels
    .filter((l) => !l.lab && l.symbol === symbol && completedIds.includes(l.id))
    .flatMap((l) => l.sourceIntervals)
    .sort((a, b) => a.start - b.start);
  let total = 0;
  let end = -1;
  for (const iv of intervals) {
    const start = Math.max(iv.start, end);
    if (iv.end > start) total += iv.end - start;
    end = Math.max(end, iv.end);
  }
  return total;
}

/**
 * Discovery (separate from assembly): the first puzzle of the gene's assembly chapter is complete.
 */
export const isDiscovered = (completedIds: readonly string[], symbol: string): boolean => {
  const opener = CHAPTER_LEVELS.find((l) => l.symbol === symbol && l.chapter!.part === 1);
  return !!opener && completedIds.includes(opener.id);
};

/** Next unfinished chapter puzzle in catalogue order, or the opening level. */
export function nextChapterId(completedIds: readonly string[]): string {
  const next = CHAPTER_LEVELS.find((l) => !completedIds.includes(l.id));
  return next?.id ?? OPENING_LEVEL_ID;
}
