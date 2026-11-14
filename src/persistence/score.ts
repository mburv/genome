import type { LevelDefinition } from '../engine/types.ts';

/** Informational par: the proven optimum when known, otherwise the certificate length in drags. */
export function parMoves(def: LevelDefinition): number {
  return def.metrics.solver.status === 'optimal' && def.metrics.solver.optimal != null
    ? def.metrics.solver.optimal
    : def.metrics.certificateDrags;
}

/**
 * 3 stars at or under par, 2 stars within +2 or 1.5× par (whichever is looser), otherwise 1.
 * Completing the level always earns at least one star.
 */
export function starsFor(moves: number, par: number): 1 | 2 | 3 {
  if (moves <= par) return 3;
  if (moves <= Math.max(par + 2, Math.ceil(par * 1.5))) return 2;
  return 1;
}
