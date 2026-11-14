import type { LevelDefinition } from '../engine/types.ts';
import type { GeneAsset } from '../genomics/genes.ts';
import { sha256Hex } from '../genomics/sha256.ts';
import { ALL_LEVELS } from './campaign.ts';

/**
 * M4 full-CDS assembly. Coverage = the union of CDS intervals of completed chapter puzzles
 * (Enzyme labs never count). Complementary strands and replays add nothing, and
 * overlapping intervals are counted once. A gene is **assembled** only when the reconstruction —
 * every base taken from the target pieces the player actually completed, in CDS order, with no
 * auto-fill — covers the whole CDS, equals the pinned reference byte-for-byte and its SHA-256 matches
 * the manifest checksum.
 */
const countsFor = (l: LevelDefinition): boolean => !l.lab;

/** The DNA a completed level contributes, as [offset, bases] pieces (coding tracks + restored repair piece). */
export function levelContribution(def: LevelDefinition): { offset: number; seq: string }[] {
  const out: { offset: number; seq: string }[] = [];
  const seqOf = (sym: string): string => (def.tokens ? def.tokens[sym]!.seq : sym);
  for (const t of def.tracks) {
    if (t.strand !== 'coding') continue; // the complementary strand is never counted
    let off = t.source.start;
    for (const sym of t.expected) {
      const s = seqOf(sym);
      out.push({ offset: off, seq: s });
      off += s.length;
    }
  }
  if (def.repair) out.push({ offset: def.repair.sourceOffset, seq: seqOf(def.repair.expected) });
  return out;
}

export interface AssemblyStatus {
  symbol: string;
  cdsLength: number;
  /** Distinct CDS bases covered by completed puzzles (union). */
  covered: number;
  /** Player-assembled CDS with '·' for bases not yet covered. */
  assembled: string;
  complete: boolean;
  /** Byte-for-byte equal to the pinned reference. */
  exact: boolean;
  /** SHA-256 of the reconstruction (only when complete). */
  sha256: string | null;
  checksumMatches: boolean;
  /** complete && exact && checksum matches. */
  verified: boolean;
}

export function assemblyStatus(completedIds: readonly string[], gene: GeneAsset, levels: readonly LevelDefinition[] = ALL_LEVELS): AssemblyStatus {
  const L = gene.cdsLength;
  const bases: (string | null)[] = new Array<string | null>(L).fill(null);
  let conflict = false;
  const done = new Set(completedIds);
  for (const def of levels) {
    if (def.symbol !== gene.symbol || !countsFor(def) || !done.has(def.id)) continue;
    for (const { offset, seq } of levelContribution(def)) {
      for (let i = 0; i < seq.length; i++) {
        const at = offset + i;
        if (at < 0 || at >= L) { conflict = true; continue; }
        if (bases[at] !== null && bases[at] !== seq[i]) conflict = true;
        bases[at] = seq[i]!;
      }
    }
  }
  const covered = bases.filter((b) => b !== null).length;
  const assembled = bases.map((b) => b ?? '·').join('');
  const complete = covered === L && !conflict;
  const exact = complete && assembled === gene.sequence;
  const sha256 = complete ? sha256Hex(assembled) : null;
  const checksumMatches = sha256 !== null && sha256 === gene.sequenceSha256;
  return { symbol: gene.symbol, cdsLength: L, covered, assembled, complete, exact, sha256, checksumMatches, verified: complete && exact && checksumMatches };
}

/** Distinct bases covered (cheap, no checksum). */
export const assembledBases = (completedIds: readonly string[], gene: GeneAsset): number => assemblyStatus(completedIds, gene).covered;
