import { levelsForGene } from '../campaign/campaign.ts';
import type { LevelDefinition } from '../engine/types.ts';
import { GENES } from '../genomics/genes.ts';
import { POWER_LABEL } from './PowerTray.tsx';

export interface PlayHeading {
  /** Large title: the gene symbol, or the lab power name. */
  title: string;
  /** Small progress (e.g. "4/8") or lab tag ("PRACTICE"), shown at locus size. */
  progress: string | null;
  /** Official full name, already in the small-line letter case (uppercase). */
  fullName: string | null;
  locus: string;
}

/** Compact play-screen heading: symbol, fraction + official name, and RefSeq locus. */
export function playHeading(def: LevelDefinition): PlayHeading {
  const gene = GENES[def.symbol]!;
  const locus = `CHROMOSOME ${gene.chromosome} · ${gene.transcript}`;
  const fullName = gene.fullName ? gene.fullName.toUpperCase() : null;
  if (def.lab) return { title: POWER_LABEL[def.lab], progress: 'PRACTICE', fullName, locus };
  if (def.chapter) return { title: gene.symbol, progress: `${def.chapter.part}/${def.chapter.of}`, fullName, locus };
  const own = levelsForGene(def.symbol);
  const position = own.findIndex((l) => l.id === def.id) + 1;
  return { title: gene.symbol, progress: `${position}/${own.length}`, fullName, locus };
}
