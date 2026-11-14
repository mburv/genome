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
 * 1-base intro puzzles (the former INS/HBB sample boards). Still generated into
 * levels.generated.json so the pinned chapter pack stays byte-identical (mask uniqueness
 * and starting indexes). They are live campaign levels again — not a separate sample track.
 */
export const INTRO_LEVELS: readonly LevelDefinition[] = m2.levels.filter((l) => !l.lab);
export const INTRO_IDS: readonly string[] = INTRO_LEVELS.map((l) => l.id);
const LABS: readonly LevelDefinition[] = m2.levels.filter((l) => l.lab);

const GENE_ORDER: readonly string[] = [...new Set(chapters.levels.map((l) => l.symbol))];

export const CAMPAIGN_ID = 'genome-m4-assembly';
/** First 1-base intro of the first catalogue gene; new players start here. */
export const OPENING_LEVEL_ID = INTRO_LEVELS[0]!.id;

function runFor(symbol: string): LevelDefinition[] {
  return [
    ...INTRO_LEVELS.filter((l) => l.symbol === symbol),
    ...chapters.levels.filter((l) => l.symbol === symbol),
  ];
}

/**
 * Live level pack: for each catalogue gene, 1-base intros (INS and HBB) then multi-base
 * assembly chapters; Enzyme labs last. Difficulty ramps 1-base → 3/6/12/24-base tiles.
 */
export const LEVEL_PACK: LevelPack = {
  campaignId: CAMPAIGN_ID,
  generatorVersion: m2.generatorVersion,
  tokenGeneratorVersion: chapters.generatorVersion,
  catalogueId: chapters.catalogueId,
  datasets: { ...chapters.datasets, ...m2.datasets },
  levels: [...GENE_ORDER.flatMap((symbol) => runFor(symbol)), ...LABS],
};
export const ALL_LEVELS: readonly LevelDefinition[] = LEVEL_PACK.levels;
/** Non-lab campaign puzzles in play order (intros then chapters, per gene). */
export const CAMPAIGN_LEVELS: readonly LevelDefinition[] = ALL_LEVELS.filter((l) => !l.lab);
/** M4 assembly chapter puzzles, grouped per gene in chapter order. */
export const CHAPTER_LEVELS: readonly LevelDefinition[] = ALL_LEVELS.filter((l) => l.chapter);
export const chapterOf = (symbol: string): LevelDefinition[] => CHAPTER_LEVELS.filter((l) => l.symbol === symbol);
export const introOf = (symbol: string): LevelDefinition[] => INTRO_LEVELS.filter((l) => l.symbol === symbol);
/** A gene's full campaign run: 1-base intros (if any) then assembly chapters. */
export const runOf = (symbol: string): LevelDefinition[] => CAMPAIGN_LEVELS.filter((l) => l.symbol === symbol);
/** Enzyme-lab tutorial levels: one free use of their power, no coverage credit. */
export const LAB_LEVELS: readonly LevelDefinition[] = ALL_LEVELS.filter((l) => l.lab);
/** Live campaign puzzles of a gene (intros then chapters). */
export const levelsForGene = (symbol: string, levels: readonly LevelDefinition[] = CAMPAIGN_LEVELS): LevelDefinition[] =>
  levels.filter((l) => l.symbol === symbol && !l.lab);

/** Position of a puzzle in its gene's run (intros + chapters), 1-based. */
export function runProgress(def: LevelDefinition): { part: number; of: number } | null {
  if (def.lab) return null;
  const run = runOf(def.symbol);
  const i = run.findIndex((l) => l.id === def.id);
  return i >= 0 ? { part: i + 1, of: run.length } : null;
}

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
 * Discovery (separate from assembly): the first puzzle of the gene's campaign run is complete
 * (a 1-base intro when the gene has one, otherwise the chapter opener).
 */
export const isDiscovered = (completedIds: readonly string[], symbol: string): boolean => {
  const opener = runOf(symbol)[0];
  return !!opener && completedIds.includes(opener.id);
};

/** Next unfinished campaign puzzle in catalogue order, or the opening level. */
export function nextCampaignId(completedIds: readonly string[]): string {
  const next = CAMPAIGN_LEVELS.find((l) => !completedIds.includes(l.id));
  return next?.id ?? OPENING_LEVEL_ID;
}

/** @deprecated Use nextCampaignId; kept so older call sites keep compiling during the rename. */
export const nextChapterId = nextCampaignId;
