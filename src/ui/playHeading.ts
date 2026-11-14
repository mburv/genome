import { levelsForGene } from '../campaign/campaign.ts';
import type { LevelDefinition } from '../engine/types.ts';
import { GENES } from '../genomics/genes.ts';
import { POWER_LABEL } from './PowerTray.tsx';

/** Compact play-screen heading: current gene (or lab) and its RefSeq locus. */
export function playHeading(def: LevelDefinition): { title: string; locus: string } {
  const gene = GENES[def.symbol]!;
  const locus = `CHROMOSOME ${gene.chromosome} · ${gene.transcript}`;
  if (def.lab) return { title: `${POWER_LABEL[def.lab]} · practice`, locus };
  if (def.chapter) return { title: `${gene.symbol} · ${def.chapter.part}/${def.chapter.of}`, locus };
  const own = levelsForGene(def.symbol);
  const position = own.findIndex((l) => l.id === def.id) + 1;
  return { title: `${gene.symbol} · ${position}/${own.length}`, locus };
}
