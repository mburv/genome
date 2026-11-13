import { useCallback, useMemo, useRef, useState } from 'react';
import { applyCommand, createInitialState, recoveryHint, trackMatches, trackSequence, type Command, type PuzzleState } from '../engine/engine.ts';
import type { Axis, Cell, LevelDefinition, Move } from '../engine/types.ts';
import { LEVEL_PACK, LEVELS, coveredBases, sampleBases } from '../campaign/campaign.ts';
import { INS } from '../genomics/ins.ts';
import { createLocalStorageAdapter, loadSave, newSave, recordCompletion, serializeSave, type SaveData, type StorageAdapter } from '../persistence/save.ts';
import { Board, dirName, type MoveAnimation, type SlidePreview } from './Board.tsx';
import { applySlide } from '../engine/grid.ts';
import { hintDisplayCell } from './hintCell.ts';

const prefersReducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function defaultSelection(def: LevelDefinition, state: PuzzleState): Cell {
  const hint = recoveryHint(def, state);
  return hint ? hintDisplayCell(def, state.board, hint) : def.tracks[0]!.cells[0]!;
}

export function App({ storage = createLocalStorageAdapter() }: { storage?: StorageAdapter }) {
  const initial = useMemo(() => loadSave(storage, LEVEL_PACK), [storage]);
  const [save, setSave] = useState<SaveData>(initial.save);
  const [notices, setNotices] = useState<string[]>(initial.notices);
  // Write once on load (idempotent) so a fresh/recovered save is stored in the current format.
  const [saveOk, setSaveOk] = useState(() => storage.save(serializeSave(initial.save)));
  const [hintVisible, setHintVisible] = useState(false);
  const [animation, setAnimation] = useState<MoveAnimation | null>(null);
  const [celebrate, setCelebrate] = useState<{ levelId: string; newBases: number } | null>(null);
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState<SlidePreview | null>(null);
  const nonce = useRef(0);

  const def = LEVELS.find((l) => l.id === save.currentLevelId) ?? LEVELS[0]!;
  const puzzle = save.attempts[def.id] ?? createInitialState(def);
  const [selected, setSelected] = useState<Cell>(() => defaultSelection(def, puzzle));
  const reducedMotion = save.settings.reducedMotion || prefersReducedMotion();

  const persist = useCallback(
    (next: SaveData) => {
      setSave(next);
      setSaveOk(storage.save(serializeSave(next)));
    },
    [storage],
  );

  // While dragging, target feedback reflects the whole-cell position under the finger (not committed).
  const shownBoard = preview && puzzle.status === 'playing' ? applySlide(def.mask, puzzle.board, preview.origin, preview.axis, preview.steps).board : puzzle.board;
  const matches = trackMatches(def, shownBoard);
  const hint = puzzle.status === 'playing' ? recoveryHint(def, puzzle) : null;
  const showGestureCue = def.tutorial && puzzle.moves === 0 && puzzle.status === 'playing';
  const shownHint = hintVisible || showGestureCue ? hint : null;
  const hintCell = shownHint ? hintDisplayCell(def, puzzle.board, shownHint) : null;

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
          const before = coveredBases(next.completed);
          next = recordCompletion(next, def.id);
          setCelebrate({ levelId: def.id, newBases: coveredBases(next.completed) - before });
          setStatus('Fragment sequenced!');
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

  const goTo = (levelId: string) => {
    const target = LEVELS.find((l) => l.id === levelId)!;
    const st = save.attempts[levelId] ?? createInitialState(target);
    setSelected(defaultSelection(target, st));
    setCelebrate(null);
    setHintVisible(false);
    setStatus('');
    setAnimation(null);
    persist({ ...save, currentLevelId: levelId });
  };

  const showHint = () => {
    if (!hint) return;
    setHintVisible(true);
    setSelected(hintDisplayCell(def, puzzle.board, hint));
    setStatus(`Hint: slide ${hint.axis === 'row' ? 'row' : 'column'} ${hint.axis === 'row' ? Math.floor(hint.origin / 9) + 1 : (hint.origin % 9) + 1} ${dirName(hint)} one cell. Recovery hint — it leads back to a certified solution, not necessarily the shortest.`);
  };

  const directional = (axis: 'row' | 'col', direction: 1 | -1) => onMove({ origin: selected, axis, direction });

  const track = def.tracks[0]!;
  const current = trackSequence(shownBoard, track.cells);
  const done = save.completed.length;
  const covered = coveredBases(save.completed);
  const sampleTotal = sampleBases();
  const isLast = def.index === LEVELS.length - 1;
  const nextLevel = LEVELS[def.index + 1];
  const solvedView = puzzle.status === 'solved';
  const resetProgress = () => {
    if (!confirm('Erase all GENOME progress on this device?')) return;
    const fresh = newSave(LEVEL_PACK);
    storage.backup(serializeSave(save));
    setCelebrate(null);
    setSelected(defaultSelection(LEVELS[0]!, createInitialState(LEVELS[0]!)));
    persist(fresh);
  };

  return (
    <main className="app">
      <header className="top">
        <div>
          <h1>GENOME</h1>
          <p className="tag">Build what makes you human</p>
        </div>
        <nav className="levels" aria-label="Levels">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`chip ${l.id === def.id ? 'current' : ''} ${save.completed.includes(l.id) ? 'complete' : ''}`}
              onClick={() => goTo(l.id)}
              aria-label={`Level ${l.index + 1}: ${l.title}${save.completed.includes(l.id) ? ', complete' : ''}`}
              aria-current={l.id === def.id ? 'step' : undefined}
            >
              {save.completed.includes(l.id) ? '✓' : l.index + 1}
            </button>
          ))}
        </nav>
      </header>

      {notices.length > 0 && (
        <div className="notice" role="alert">
          {notices.map((n) => (
            <p key={n}>{n}</p>
          ))}
          <button type="button" onClick={() => setNotices([])}>OK</button>
        </div>
      )}

      <section className="panel info" aria-label="Level information">
        <div className="row-between muted small">
          <span>CHROMOSOME {INS.chromosome} · {INS.transcript}</span>
          <span data-testid="level-label">Level {def.index + 1} / {LEVELS.length}</span>
        </div>
        <div className="row-between">
          <h2 className="gene">{INS.symbol} <span>· {INS.name}</span></h2>
          <span className="mode">Sequencing</span>
        </div>
        <div className="progress" role="progressbar" aria-label="M1 sample bases sequenced" aria-valuemin={0} aria-valuemax={sampleTotal} aria-valuenow={covered}>
          <i style={{ width: `${(100 * covered) / sampleTotal}%` }} />
        </div>
        <div className="row-between muted small">
          <span data-testid="progress-text">{covered} / {sampleTotal} sample bases · {done}/{LEVELS.length} levels</span>
          <span>{covered} of {INS.cdsLength} CDS bases</span>
        </div>
      </section>

      <section className="target" aria-label="Target sequence">
        <div className="row-between small">
          <span className="target-title"><b className="badge">{track.group}</b> {def.title}</span>
          <span className="muted">read {track.orientation === 'horizontal' ? 'left → right' : 'top → bottom'} · CDS {track.source.start + 1}–{track.source.end}</span>
        </div>
        <div className="strip" data-testid="target-strip" aria-label={`Target ${track.expected.split('').join(' ')}. Currently ${current.split('').join(' ')}.`}>
          {track.expected.split('').map((b, i) => (
            <span key={i} className={`strip-cell b-${b} ${matches[0]![i] ? 'ok' : ''}`}>
              {b}
            </span>
          ))}
        </div>
      </section>

      <Board
        def={def}
        board={puzzle.board}
        matches={matches}
        selected={selected}
        hint={shownHint}
        hintCell={hintCell}
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

      <div className="dpad" aria-label="Slide the selected tile's segment">
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
              : 'Match the outlined strand. Drag any tile to slide its whole row or column segment — gaps block movement.')}
      </p>

      {solvedView && !celebrate && (
        <div className="solved-bar">
          <button type="button" onClick={() => dispatch({ type: 'restart' })}>Replay</button>
          {nextLevel && <button type="button" className="primary" onClick={() => goTo(nextLevel.id)}>Next level →</button>}
        </div>
      )}

      <details className="panel help">
        <summary>How to play</summary>
        <p>Drag a tile left/right to slide its whole row segment with your finger, or up/down for its column segment — as far as you like. Let go and it snaps to the nearest cell; a quick flick moves one step. Tiles wrap around inside the segment. Dark gaps are holes: they split rows and columns into separate segments and nothing crosses them.</p>
        <p>Make the outlined strand read the target sequence. You can also tap a tile and use the arrow buttons; on a keyboard, arrow keys slide the selected tile and Shift + arrows move the selection.</p>
        <p>Hint gives a recovery move that leads back to a certified solution (not necessarily the shortest). Undo and Restart are always free. No timers, no move limits.</p>
      </details>
      <details className="panel help">
        <summary>About the DNA</summary>
        <p>Targets are slices of the human <b>INS</b> (insulin) coding sequence from NCBI RefSeq <a href={INS.sourceUrl} target="_blank" rel="noopener noreferrer">{INS.transcript}</a> ({INS.keywords.replace(/\.$/, '')}), annotated CDS {INS.cdsLocation}, {INS.cdsLength} bases including the stop codon, translation checked against {INS.protein}.</p>
        <p className="mono small">SHA-256 {INS.sequenceSha256.slice(0, 16)}… · retrieved {INS.retrievedAt.slice(0, 10)}</p>
        <p>This is a reference sequence, not anyone’s personal genome, and the game makes no medical claims. Completing these three samples sequences {sampleTotal} of {INS.cdsLength} INS coding bases — the gene is not assembled yet.</p>
        <label className="toggle">
          <input type="checkbox" checked={save.settings.reducedMotion} onChange={(e) => persist({ ...save, settings: { reducedMotion: e.target.checked } })} /> Reduce motion
        </label>
        <button type="button" className="link" onClick={resetProgress}>Reset progress</button>
      </details>
      <footer className="muted small">{saveOk ? 'Progress is saved on this device.' : 'Progress cannot be saved in this browser (storage unavailable).'} · M1 prototype</footer>

      {celebrate && celebrate.levelId === def.id && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="win-title" data-testid="win">
          <div className="card">
            <p className="muted small">LEVEL {def.index + 1} COMPLETE · {puzzle.moves} {puzzle.moves === 1 ? 'move' : 'moves'}</p>
            <h3 id="win-title">Fragment sequenced</h3>
            <div className="win-strand">
              {track.expected.split('').map((b, i) => (
                <span key={i} className={`strip-cell b-${b} ok`} style={{ animationDelay: reducedMotion ? '0ms' : `${i * 45}ms` }}>
                  {b}
                </span>
              ))}
            </div>
            <p>
              {celebrate.newBases > 0 ? <b>+{celebrate.newBases} INS coding bases</b> : <b>Already counted</b>} <span className="muted">(CDS {track.source.start + 1}–{track.source.end})</span>
            </p>
            <p className="muted small">
              {isLast && save.completed.length === LEVELS.length
                ? `M1 demo complete: ${covered} of ${INS.cdsLength} INS coding bases sequenced. That is a sample — not a fully assembled gene.`
                : celebrate.newBases > 0
                  ? `${covered} of ${INS.cdsLength} INS coding bases sequenced so far.`
                  : 'Replays never add duplicate bases.'}
            </p>
            <div className="card-actions">
              <button type="button" onClick={() => setCelebrate(null)}>View board</button>
              {nextLevel ? (
                <button type="button" className="primary" onClick={() => goTo(nextLevel.id)} autoFocus>Next level →</button>
              ) : (
                <button type="button" className="primary" onClick={() => { setCelebrate(null); dispatch({ type: 'restart' }); }} autoFocus>Replay</button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
