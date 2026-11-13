import { useCallback, useRef, useState } from 'react';
import { applyCommand, createInitialState, recoverySlideHint, trackMatches, type Command, type PuzzleState } from '../engine/engine.ts';
import { applySlide } from '../engine/grid.ts';
import type { Axis, Cell, LevelDefinition, Move } from '../engine/types.ts';
import { LEVELS, coveredBases, isDiscovered, levelsForGene, sampleBases } from '../campaign/campaign.ts';
import { GENES } from '../genomics/genes.ts';
import { recordCompletion, type SaveData } from '../persistence/save.ts';
import { Board, type MoveAnimation, type SlidePreview } from './Board.tsx';
import { TargetPanel } from './TargetPanel.tsx';
import { WinCard } from './WinCard.tsx';
import { describeSlide, hintDisplayCell } from './hintCell.ts';
import { MODE_BLURB, MODE_GLYPH, MODE_LABEL } from './modes.ts';

function defaultSelection(def: LevelDefinition, state: PuzzleState): Cell {
  const hint = recoverySlideHint(def, state);
  return hint ? hintDisplayCell(def, state.board, hint) : def.tracks[0]!.cells[0]!;
}

interface Props {
  def: LevelDefinition;
  save: SaveData;
  persist: (next: SaveData) => void;
  reducedMotion: boolean;
  onPlay: (levelId: string) => void;
  onMap: () => void;
  onCard: (symbol: string) => void;
}

export function PlayScreen({ def, save, persist, reducedMotion, onPlay, onMap, onCard }: Props) {
  const puzzle = save.attempts[def.id] ?? createInitialState(def);
  const gene = GENES[def.symbol]!;
  const [selected, setSelected] = useState<Cell>(() => defaultSelection(def, puzzle));
  const [hintVisible, setHintVisible] = useState(false);
  const [animation, setAnimation] = useState<MoveAnimation | null>(null);
  const [celebrate, setCelebrate] = useState<{ newBases: number; discovered: boolean } | null>(null);
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState<SlidePreview | null>(null);
  const nonce = useRef(0);

  // While dragging, target feedback reflects the whole-cell position under the finger (not committed).
  const shownBoard = preview && puzzle.status === 'playing' ? applySlide(def.mask, puzzle.board, preview.origin, preview.axis, preview.steps).board : puzzle.board;
  const matches = trackMatches(def, shownBoard);
  const hint = puzzle.status === 'playing' ? recoverySlideHint(def, puzzle) : null;
  const showGestureCue = def.tutorial && puzzle.moves === 0 && puzzle.status === 'playing';
  const shownHint = hintVisible || showGestureCue ? hint : null;
  const hintCell = shownHint ? hintDisplayCell(def, puzzle.board, shownHint) : null;
  const solvedView = puzzle.status === 'solved';

  const dispatch = useCallback(
    (command: Command): boolean => {
      setPreview(null);
      const result = applyCommand(def, puzzle, command);
      if (!result.accepted) {
        if (result.reason === 'immobile') setStatus('That tile is boxed in by gaps on this axis — try the other direction.');
        else if (result.reason === 'no-op') setStatus('Nothing changed: every tile in that segment is the same letter.');
        else if (result.reason === 'no-history') setStatus('Nothing to undo yet.');
        return false;
      }
      let next: SaveData = { ...save, attempts: { ...save.attempts, [def.id]: result.state } };
      for (const ev of result.events) {
        if (ev.type === 'moved') {
          nonce.current += 1;
          setAnimation({ nonce: nonce.current, segment: ev.segment, axis: ev.move.axis, direction: ev.move.direction });
          setStatus('');
        }
        if (ev.type === 'slid') setStatus('');
        if (ev.type === 'undone') setStatus('Move undone.');
        if (ev.type === 'restarted') {
          setStatus('Board restarted.');
          setSelected(defaultSelection(def, result.state));
        }
        if (ev.type === 'solved') {
          const before = coveredBases(next.completed, def.symbol);
          next = recordCompletion(next, def.id);
          const discoveredNow = isDiscovered(next.completed, def.symbol) && !next.discovered.includes(def.symbol);
          if (discoveredNow) next = { ...next, discovered: [...next.discovered, def.symbol] };
          setCelebrate({ newBases: coveredBases(next.completed, def.symbol) - before, discovered: discoveredNow });
          setStatus('Solved!');
        }
      }
      setHintVisible(false);
      persist(next);
      return true;
    },
    [def, puzzle, save, persist],
  );

  const onMove = useCallback((move: Move) => {
    dispatch({ type: 'rotate', move });
  }, [dispatch]);
  const onSlide = useCallback((origin: Cell, axis: Axis, steps: number) => dispatch({ type: 'slide', origin, axis, steps }), [dispatch]);

  const showHint = () => {
    if (!hint) return;
    setHintVisible(true);
    setSelected(hintDisplayCell(def, puzzle.board, hint));
    setStatus(`Hint: ${describeSlide(hint)}. Recovery hint — it leads back to a certified solution, not necessarily the shortest.`);
  };
  const directional = (axis: Axis, direction: 1 | -1) => onMove({ origin: selected, axis, direction });

  const covered = coveredBases(save.completed, def.symbol);
  const sample = sampleBases(def.symbol);
  const nextLevel = LEVELS[def.index + 1];
  const own = levelsForGene(def.symbol);
  const position = own.findIndex((l) => l.id === def.id) + 1;
  const par = def.metrics.solver.status === 'optimal' ? `Par ${def.metrics.solver.optimal}` : `Par ≤ ${def.metrics.certificateDrags}`;

  return (
    <>
      <section className="panel info" aria-label="Level information">
        <div className="row-between muted small">
          <span>CHROMOSOME {gene.chromosome} · {gene.transcript}</span>
          <span data-testid="level-label">Level {def.index + 1} / {LEVELS.length}</span>
        </div>
        <div className="row-between">
          <h2 className="gene">{gene.symbol} <span>· {position}/{own.length}</span></h2>
          <span className={`mode mode-${def.mode}`} data-testid="mode-label">{MODE_GLYPH[def.mode]} {MODE_LABEL[def.mode]}</span>
        </div>
        <div className="progress" role="progressbar" aria-label={`${gene.symbol} sample bases sequenced`} aria-valuemin={0} aria-valuemax={sample} aria-valuenow={covered}>
          <i style={{ width: `${(100 * covered) / sample}%` }} />
        </div>
        <div className="row-between muted small">
          <span data-testid="progress-text">{covered} / {sample} {gene.symbol} sample bases</span>
          <span>{par} · {def.metrics.rating}</span>
        </div>
      </section>

      <TargetPanel def={def} matches={matches} solved={solvedView} />

      <Board
        def={def}
        board={puzzle.board}
        matches={matches}
        selected={selected}
        hint={shownHint}
        hintCell={hintCell}
        repaired={solvedView}
        showGestureCue={showGestureCue}
        locked={solvedView}
        reducedMotion={reducedMotion}
        animation={animation}
        onMove={onMove}
        onSlide={onSlide}
        onPreview={setPreview}
        onSelect={setSelected}
      />

      <div className="row-between small meta">
        <span data-testid="moves">{puzzle.moves} {puzzle.moves === 1 ? 'move' : 'moves'}</span>
        <span className="muted">Selected R{Math.floor(selected / 9) + 1} · C{(selected % 9) + 1}</span>
      </div>

      <div className="dpad" aria-label="Slide the selected tile's segment one cell">
        <button type="button" onClick={() => directional('row', -1)} disabled={solvedView} aria-label="Slide row left">←</button>
        <button type="button" onClick={() => directional('col', -1)} disabled={solvedView} aria-label="Slide column up">↑</button>
        <button type="button" onClick={() => directional('col', 1)} disabled={solvedView} aria-label="Slide column down">↓</button>
        <button type="button" onClick={() => directional('row', 1)} disabled={solvedView} aria-label="Slide row right">→</button>
      </div>
      <div className="actions">
        <button type="button" onClick={() => dispatch({ type: 'undo' })} disabled={solvedView || puzzle.history.length === 0}>Undo</button>
        <button type="button" onClick={showHint} disabled={solvedView || !hint}>Hint</button>
        <button type="button" onClick={() => dispatch({ type: 'restart' })} disabled={solvedView || puzzle.moves === 0}>Restart</button>
      </div>

      <p className="status" role="status" aria-live="polite" data-testid="status">
        {status ||
          (showGestureCue
            ? 'Drag the glowing tile in the arrow’s direction — the whole line slides with your finger. Or tap it and use the arrow buttons.'
            : solvedView
              ? 'Solved. Replay or move on when ready.'
              : `${MODE_BLURB[def.mode]} Drag any tile to slide its row or column segment — gaps block movement.`)}
      </p>

      {solvedView && !celebrate && (
        <div className="solved-bar">
          <button type="button" onClick={() => dispatch({ type: 'restart' })}>Replay</button>
          {nextLevel && <button type="button" className="primary" onClick={() => onPlay(nextLevel.id)}>Next level →</button>}
        </div>
      )}

      {celebrate && (
        <WinCard
          def={def}
          moves={puzzle.moves}
          newBases={celebrate.newBases}
          discovered={celebrate.discovered}
          covered={covered}
          sample={sample}
          cdsLength={gene.cdsLength}
          allDone={save.completed.length === LEVELS.length}
          reducedMotion={reducedMotion}
          hasNext={!!nextLevel}
          onNext={() => (nextLevel ? onPlay(nextLevel.id) : onMap())}
          onMap={onMap}
          onCard={() => onCard(def.symbol)}
          onClose={() => setCelebrate(null)}
        />
      )}
    </>
  );
}
