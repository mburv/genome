import type { LevelDefinition } from '../engine/types.ts';
import { GENES } from '../genomics/genes.ts';
import { runProgress } from '../campaign/campaign.ts';
import { POWER_LABEL } from './PowerTray.tsx';

export interface PlayHeading {
  /** Large title: the gene symbol, or the lab power name. */
  title: string;
  /** Small progress (e.g. "4/14") or lab tag ("PRACTICE"), shown at locus size. */
  progress: string | null;
  /** Official full name, already in the small-line letter case (uppercase). */
  fullName: string | null;
  locus: string;
}

/** Compact play-screen heading: symbol, run fraction + official name, and RefSeq locus. */
export function playHeading(def: LevelDefinition): PlayHeading {
  const gene = GENES[def.symbol]!;
  const locus = `CHROMOSOME ${gene.chromosome} · ${gene.transcript}`;
  const fullName = gene.fullName ? gene.fullName.toUpperCase() : null;
  if (def.lab) return { title: POWER_LABEL[def.lab], progress: 'PRACTICE', fullName, locus };
  const run = runProgress(def);
  const progress = run ? `${run.part}/${run.of}` : null;
  return { title: gene.symbol, progress, fullName, locus };
}
