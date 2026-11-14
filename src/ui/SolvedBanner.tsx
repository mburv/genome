import type { LevelBest } from '../persistence/save.ts';
import { parMoves, starsFor } from '../persistence/score.ts';
import type { LevelDefinition } from '../engine/types.ts';

interface Props {
  def: LevelDefinition;
  /** Mixed mechanics have no comparable sliding par or best score. */
  unranked?: boolean;
  nextLabel?: string;
  mapLabel?: string;
  moves: number;
  best?: LevelBest | undefined;
  pulse: boolean;
  hasNext: boolean;
  onReplay: () => void;
  onNext: () => void;
  onMap: () => void;
}

const starGlyphs = (n: 1 | 2 | 3) =>
  Array.from({ length: 3 }, (_, i) => (
    <span key={i} className={i < n ? 'filled' : 'empty'}>{i < n ? '★' : '☆'}</span>
  ));

/** Calm post-solve / reopen banner: result, best, Replay and Next. */
export function SolvedBanner({ def, moves, best, pulse, hasNext, onReplay, onNext, onMap, unranked = false, nextLabel = 'Next level →', mapLabel = 'Level map' }: Props) {
  const par = parMoves(def);
  const shown = unranked ? null : best?.moves ?? (moves > 0 ? moves : null);
  const stars = shown != null ? starsFor(shown, par) : null;
  const thisSolve = moves > 0 ? `${moves} ${moves === 1 ? 'move' : 'moves'}` : null;
  const bestText = best && (thisSolve == null || best.moves !== moves) ? `Best ${best.moves}` : best ? `Best ${best.moves}` : null;
  const result = [thisSolve, bestText, shown != null ? (shown <= par ? 'at par' : `par ${par}`) : null].filter(Boolean).join(' · ');
  return (
    <aside className="solved-banner" data-testid="solved-banner" aria-label="Level solved">
      <div className="solved-banner-head">
        <span className="solved-kicker">Solved</span>
        <span className="solved-result" data-testid="solved-result">
          {result || 'Already completed'}
          {stars != null && (
            <span className="solved-stars" data-testid="solved-stars" aria-label={`${stars} of 3 stars`}>
              {starGlyphs(stars)}
            </span>
          )}
        </span>
      </div>
      <div className="solved-banner-actions">
        <button type="button" className={`primary${pulse ? ' pulse' : ''}`} onClick={onReplay} data-testid="replay">Replay</button>
        {hasNext
          ? <button type="button" onClick={onNext} data-testid="next-level">{nextLabel}</button>
          : <button type="button" onClick={onMap} data-testid="solved-map">{mapLabel}</button>}
      </div>
    </aside>
  );
}
