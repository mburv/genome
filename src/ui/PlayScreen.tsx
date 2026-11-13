import { useCallback, useRef, useState } from 'react';
import {
  applyCommand, certifiedHint, createInitialState, energyOf, fullHint, levelCodons, segmentIn, trackMatches,
  type Command, type CommandResult, type Hint, type PuzzleState, type RejectReason,
} from '../engine/engine.ts';
import { codonComplete, POWER_COST, powersEnabled, scaffoldCandidates, type ScaffoldCandidate } from '../engine/powers.ts';
import type { Axis, Base, Cell, LevelDefinition, Move, Power } from '../engine/types.ts';
import { LAB_LEVELS, LEVELS, coveredBases, isDiscovered, levelsForGene, sampleBases } from '../campaign/campaign.ts';
import { GENES } from '../genomics/genes.ts';
import { recordCompletion, type SaveData } from '../persistence/save.ts';
import { Board, type MoveAnimation, type PowerPreview, type SlidePreview } from './Board.tsx';
import { TargetPanel } from './TargetPanel.tsx';
import { WinCard } from './WinCard.tsx';
import { PowerPanel, PowerTray, POWER_LABEL } from './PowerTray.tsx';
import { describeSlide, hintDisplayCell } from './hintCell.ts';
import { MODE_BLURB, MODE_GLYPH, MODE_LABEL } from './modes.ts';
import { playCue, type Cue } from './feedback.ts';

function defaultSelection(def: LevelDefinition, state: PuzzleState): Cell {
  const h = certifiedHint(def, state);
  return h?.kind === 'drag' ? hintDisplayCell(def, state.board, h.slide, h.segment) : def.tracks[0]!.cells[0]!;
}

const REJECT_TEXT: Partial<Record<RejectReason, string>> = {
  immobile: 'That tile is boxed in by gaps on this axis — try the other direction.',
  'no-op': 'Nothing changed: every tile in that segment is the same letter.',
  'no-history': 'Nothing to undo yet.',
  locked: 'Bonded tiles can’t move on either axis. Release the bond (free) to move them.',
  energy: 'Not enough energy. Earn +1 for each reference codon you complete with a normal move.',
  'same-base': 'Same base — nothing to change (and nothing spent).',
  'codon-incomplete': 'Only a complete, correct codon can be bonded.',
  'not-a-codon': 'Bond a codon: three matching bases of a numbered target, in frame.',
  'bond-active': 'Only one bond at a time — release the current one first (free).',
  'scaffold-active': 'Only one scaffold at a time — wait for it to expire or undo it.',
  'scaffold-conflict': 'A bond can’t sit on the scaffold track.',
  'invalid-target': 'That target isn’t valid for this power.',
  'powers-unavailable': 'Powers unlock from level 4.',
};

const LAB_INTRO: Record<Power, string> = {
  crispr: 'Enzyme lab — CRISPR (one free use here, normally ⚡4): tap CRISPR, tap a wrong target tile, pick the right base, check the preview, then Confirm. Undo reverses an edit.',
  ligase: 'Enzyme lab — Ligase (one free use here, normally ⚡2): complete a 3-base piece, then tap Ligase and tap that piece. Bonded tiles can’t be dragged along any row or column. Release is always free.',
  scaffold: 'Enzyme lab — Scaffold (one free use here, normally ⚡3): tap Scaffold, then a glowing gap. The two segments beside it rotate as one track for the next 3 rotations.',
};

interface Props {
  def: LevelDefinition;
  save: SaveData;
  persist: (next: SaveData) => void;
  reducedMotion: boolean;
  onPlay: (levelId: string) => void;
  onMap: () => void;
  onCard: (symbol: string) => void;
}

const stateKey = (s: PuzzleState): string => `${s.board}|${s.moves}|${s.history.length}|${s.locks.join()}|${s.scaffold?.remaining ?? 0}|${s.edits}`;

export function PlayScreen({ def, save, persist, reducedMotion, onPlay, onMap, onCard }: Props) {
  const puzzle = save.attempts[def.id] ?? createInitialState(def);
  const gene = GENES[def.symbol]!;
  const powers = powersEnabled(def);
  const [selected, setSelected] = useState<Cell>(() => defaultSelection(def, puzzle));
  const [hintRes, setHintRes] = useState<{ key: string; hint: Hint } | null>(null);
  const [animation, setAnimation] = useState<MoveAnimation | null>(null);
  const [celebrate, setCelebrate] = useState<{ newBases: number; discovered: boolean } | null>(null);
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState<SlidePreview | null>(null);
  const [targeting, setTargeting] = useState<Power | null>(null);
  const [pending, setPending] = useState<PowerPreview | null>(null);
  const [powersUsed, setPowersUsed] = useState(0);
  const nonce = useRef(0);
  const cue = useCallback((c: Cue) => playCue(c, save.settings), [save.settings]);

  // ---- power preview (pure: applyCommand on a copy) -------------------------------------
  const previewCmd: Command | null =
    pending?.power === 'crispr' && pending.base ? { type: 'edit', cell: pending.cell, base: pending.base }
      : pending?.power === 'ligase' ? { type: 'bond', cell: pending.cells[0]! }
        : pending?.power === 'scaffold' ? { type: 'scaffold', axis: pending.candidate.axis, gap: pending.candidate.gap }
          : null;
  const previewResult: CommandResult | null = previewCmd ? applyCommand(def, puzzle, previewCmd) : null;

  // While dragging, target feedback reflects the whole-cell position under the finger (not committed).
  let shownBoard = puzzle.board;
  if (preview && puzzle.status === 'playing') {
    const r = applyCommand(def, puzzle, { type: 'slide', ...preview });
    if (r.accepted) shownBoard = r.state.board;
  } else if (previewResult?.accepted && pending?.power === 'crispr') shownBoard = previewResult.state.board;
  const matches = trackMatches(def, shownBoard);
  const solvedView = puzzle.status === 'solved';
  const energy = energyOf(puzzle);

  const autoHint = def.tutorial && puzzle.moves === 0 && !solvedView ? certifiedHint(def, puzzle) : null;
  const showGestureCue = autoHint?.kind === 'drag';
  const activeHint = hintRes && hintRes.key === stateKey(puzzle) ? hintRes.hint : autoHint;
  const dragHint = activeHint?.kind === 'drag' && !solvedView ? activeHint : null;
  const hintCell = dragHint ? hintDisplayCell(def, puzzle.board, dragHint.slide, dragHint.segment) : null;

  const segmentOf = useCallback((origin: Cell, axis: Axis) => segmentIn(def, puzzle, origin, axis), [def, puzzle]);

  const clearPower = () => {
    setTargeting(null);
    setPending(null);
  };

  const commit = useCallback(
    (result: CommandResult): boolean => {
      setPreview(null);
      if (!result.accepted) {
        setStatus(REJECT_TEXT[result.reason!] ?? '');
        if (result.reason !== 'solved') cue('reject');
        return false;
      }
      let next: SaveData = { ...save, attempts: { ...save.attempts, [def.id]: result.state } };
      const notes: string[] = [];
      let sound: Cue | null = null;
      for (const ev of result.events) {
        switch (ev.type) {
          case 'moved':
            nonce.current += 1;
            setAnimation({ nonce: nonce.current, segment: ev.segment, axis: ev.move.axis, direction: ev.move.direction });
            sound ??= 'move';
            break;
          case 'slid':
            sound ??= 'move';
            break;
          case 'undone':
            notes.push('Undone — board, bonds, scaffold and any energy spent are restored. Earned codon energy is kept.');
            sound = 'undo';
            break;
          case 'restarted':
            notes.push('Board restarted: a fresh attempt with fresh energy.');
            setSelected(defaultSelection(def, result.state));
            setPowersUsed(0);
            break;
          case 'spent':
            setPowersUsed((n) => n + 1);
            sound = 'power';
            break;
          case 'edited':
            notes.push(`CRISPR edit: ${ev.from} → ${ev.to}. Undo reverses it and refunds the energy.`);
            break;
          case 'bonded':
            notes.push('Codon bonded: its tiles now block rotation on both axes. Release is free.');
            break;
          case 'released':
            notes.push('Bond released (free). Rows and columns move freely again.');
            sound = 'release';
            break;
          case 'scaffolded':
            notes.push('Scaffold placed: the two segments rotate as one track for the next 3 rotations.');
            break;
          case 'scaffold-expired':
            notes.push('Scaffold expired after 3 rotations.');
            sound = 'expire';
            break;
          case 'energy':
            notes.push(ev.gained > 0 ? `+${ev.gained} energy: ${ev.codons} codon${ev.codons > 1 ? 's' : ''} completed.` : 'Codon completed (energy is full at 9).');
            if (ev.gained > 0) sound = 'energy';
            break;
          case 'solved': {
            if (def.lab) {
              next = recordCompletion(next, def.id);
              setCelebrate({ newBases: 0, discovered: false });
            } else {
              const before = coveredBases(next.completed, def.symbol);
              next = recordCompletion(next, def.id);
              const discoveredNow = isDiscovered(next.completed, def.symbol) && !next.discovered.includes(def.symbol);
              if (discoveredNow) next = { ...next, discovered: [...next.discovered, def.symbol] };
              setCelebrate({ newBases: coveredBases(next.completed, def.symbol) - before, discovered: discoveredNow });
            }
            notes.push('Solved!');
            sound = 'win';
            break;
          }
        }
      }
      setStatus(notes.join(' '));
      if (sound) cue(sound);
      setHintRes(null);
      persist(next);
      return true;
    },
    [def, save, persist, cue],
  );

  const dispatch = useCallback((command: Command): boolean => commit(applyCommand(def, puzzle, command)), [commit, def, puzzle]);

  const onMove = useCallback((move: Move) => {
    dispatch({ type: 'rotate', move });
  }, [dispatch]);
  const onSlide = useCallback((origin: Cell, axis: Axis, steps: number) => dispatch({ type: 'slide', origin, axis, steps }), [dispatch]);

  const rewind = (count: number) => {
    let s = puzzle;
    for (let i = 0; i < count; i++) {
      const r = applyCommand(def, s, { type: 'undo' });
      if (!r.accepted) break;
      s = r.state;
    }
    commit({ state: s, events: [{ type: 'undone' }], accepted: true });
    setStatus('Back at a certified position. Hint will guide you from here.');
  };

  const presentHint = (h: Hint | null) => {
    if (!h) return setStatus('');
    setHintRes({ key: stateKey(puzzle), hint: h });
    if (h.kind === 'drag') {
      setSelected(hintDisplayCell(def, puzzle.board, h.slide, h.segment));
      setStatus(
        `Hint: ${describeSlide(h.slide)}. ` +
          (h.source === 'certified'
            ? 'Recovery hint — it leads back to a certified solution, not necessarily the shortest.'
            : 'Found by a fresh search from this position (powers changed the board), shortest within the search limit.'),
      );
    } else if (h.kind === 'release') setStatus('Hint: release the bond (free) — it blocks the certified path.');
    else if (h.kind === 'undo') setStatus(`No verified move from here within the search limit. Undo ×${h.count} returns to a certified position.`);
    else setStatus('No verified move from here. Restart (free) for a fresh attempt.');
  };

  const showHint = () => {
    clearPower();
    // The certified path is instant; only after powers change the board is a bounded search needed.
    const quick = certifiedHint(def, puzzle);
    if (quick) return presentHint(quick);
    setStatus('Thinking…');
    // Let the status paint first; the bounded search takes up to ~200 ms on a phone.
    setTimeout(() => presentHint(fullHint(def, puzzle)), 0);
  };

  // ---- power targeting ------------------------------------------------------------------
  const pickPower = (p: Power) => {
    if (targeting === p) return clearPower();
    setHintRes(null);
    const free = puzzle.freeUses.includes(p);
    if (!free && energy < POWER_COST[p]) {
      cue('reject');
      return setStatus(`${POWER_LABEL[p]} needs ⚡${POWER_COST[p]} (you have ${energy}). Earn +1 for each reference codon you complete with a normal move.`);
    }
    if (p === 'ligase' && puzzle.locks.length) return setStatus(REJECT_TEXT['bond-active']!);
    if (p === 'scaffold' && puzzle.scaffold) return setStatus(REJECT_TEXT['scaffold-active']!);
    setTargeting(p);
    setPending(null);
    setStatus(
      p === 'crispr' ? 'CRISPR: tap the tile to edit.'
        : p === 'ligase' ? 'Ligase: tap a tile of a complete codon (highlighted).'
          : 'Scaffold: tap a glowing gap (↔ joins a row, ↕ a column).',
    );
  };
  const completeCodons = levelCodons(def).filter((c) => codonComplete(puzzle.board, c) && !c.cells.some((x) => puzzle.scaffold?.cells.includes(x)));
  const targetTiles = new Set<Cell>(
    targeting === 'crispr' ? [...def.mask].flatMap((ch, i) => (ch === '#' && !puzzle.locks.includes(i) ? [i] : []))
      : targeting === 'ligase' ? completeCodons.flatMap((c) => c.cells) : [],
  );
  const gaps: ScaffoldCandidate[] = targeting === 'scaffold' ? scaffoldCandidates(def.mask, puzzle.locks) : [];
  const onTarget = (cell: Cell) => {
    setSelected(cell);
    if (targeting === 'crispr') {
      if (puzzle.locks.includes(cell)) return setStatus(REJECT_TEXT.locked!);
      setPending({ power: 'crispr', cell, base: null });
      setStatus('Pick the new base. The targets show the result before you confirm.');
    } else if (targeting === 'ligase') {
      const codon = levelCodons(def).find((c) => c.cells.includes(cell));
      if (!codon) return setStatus(REJECT_TEXT['not-a-codon']!);
      if (!codonComplete(puzzle.board, codon)) return setStatus('That codon isn’t complete yet — finish its three bases first.');
      setPending({ power: 'ligase', cells: codon.cells });
      setStatus('');
    }
  };
  const onPickGap = (candidate: ScaffoldCandidate) => {
    setPending({ power: 'scaffold', candidate });
    setStatus('');
  };
  const confirmPower = () => {
    if (previewCmd && dispatch(previewCmd)) clearPower();
  };

  let panel: React.ReactNode = null;
  if (targeting) {
    const free = puzzle.freeUses.includes(targeting);
    const cost = free ? 0 : POWER_COST[targeting];
    const costText = free ? 'Free tutorial use' : `⚡${cost} → ${energy - cost} left`;
    let title = `${POWER_LABEL[targeting]}: choose a target`;
    let detail = targeting === 'crispr' ? 'Tap any unbonded tile on the board.' : targeting === 'ligase' ? (completeCodons.length ? 'Tap a highlighted codon.' : 'No complete codon yet — finish a 3-base piece first.') : gaps.length ? 'Tap a glowing gap.' : 'No 1–2 cell gap between two segments on this board.';
    let basePicker;
    if (pending?.power === 'crispr') {
      const cur = puzzle.board[pending.cell] as Base;
      const t = def.tracks.find((x) => x.cells.includes(pending.cell));
      const pos = t ? t.cells.indexOf(pending.cell) : -1;
      title = `CRISPR: row ${Math.floor(pending.cell / 9) + 1}, column ${(pending.cell % 9) + 1}`;
      basePicker = { current: cur, chosen: pending.base, onPick: (b: Base) => setPending({ ...pending, base: b }) };
      detail = !pending.base ? `Currently ${cur}. Pick a base.`
        : pending.base === cur ? 'Same base — no change, nothing spent.'
          : `${cur} → ${pending.base}. ${t ? `Target ${t.group} position ${pos + 1} wants ${t.expected[pos]}: ${t.expected[pos] === pending.base ? '✓ it will match.' : '✗ it will not match.'}` : 'Not a target cell (filler only).'} Hints switch to a fresh search after an edit.`;
    } else if (pending?.power === 'ligase') {
      title = `Ligase: bond ${pending.cells.map((c) => puzzle.board[c]).join('')}`;
      detail = 'These three tiles will stop every row and column through them from rotating (both axes). Release any time for free; undo refunds.';
    } else if (pending?.power === 'scaffold') {
      title = `Scaffold: join ${pending.candidate.cells.length} cells across the ${pending.candidate.axis === 'row' ? 'row' : 'column'} gap`;
      detail = 'The two segments rotate as one cyclic track, skipping the gap, for the next 3 rotations (any rotation counts; powers don’t). Only one scaffold at a time.';
    }
    const err = previewResult && !previewResult.accepted ? REJECT_TEXT[previewResult.reason!] ?? 'Not possible.' : null;
    panel = (
      <PowerPanel
        power={targeting}
        title={title}
        detail={detail}
        costText={costText}
        error={err}
        canConfirm={!!previewResult?.accepted}
        basePicker={basePicker}
        onConfirm={confirmPower}
        onCancel={() => { clearPower(); setStatus('Cancelled — nothing spent.'); }}
      />
    );
  }

  const covered = coveredBases(save.completed, def.symbol);
  const sample = sampleBases(def.symbol);
  const labIndex = LAB_LEVELS.findIndex((l) => l.id === def.id);
  const nextLevel = def.lab ? LAB_LEVELS[labIndex + 1] : LEVELS[def.index + 1];
  const own = levelsForGene(def.symbol);
  const position = own.findIndex((l) => l.id === def.id) + 1;
  const par = def.metrics.solver.status === 'optimal' ? `Par ${def.metrics.solver.optimal}` : `Par ≤ ${def.metrics.certificateDrags}`;
  const powerPreview: PowerPreview | null = pending;

  const defaultStatus = showGestureCue
    ? 'Drag the glowing tile in the arrow’s direction — the whole line slides with your finger. Or tap it and use the arrow buttons.'
    : solvedView ? 'Solved. Replay or move on when ready.'
      : def.lab && puzzle.freeUses.length ? LAB_INTRO[def.lab]
        : `${MODE_BLURB[def.mode]} Drag any tile to slide its row or column segment — gaps block movement.`;

  return (
    <>
      <section className="panel info" aria-label="Level information">
        <div className="row-between muted small">
          <span>CHROMOSOME {gene.chromosome} · {gene.transcript}</span>
          <span data-testid="level-label">{def.lab ? `Enzyme lab ${labIndex + 1} / ${LAB_LEVELS.length}` : `Level ${def.index + 1} / ${LEVELS.length}`}</span>
        </div>
        <div className="row-between">
          <h2 className="gene">{def.lab ? <>{POWER_LABEL[def.lab]} <span>· practice</span></> : <>{gene.symbol} <span>· {position}/{own.length}</span></>}</h2>
          <span className={`mode mode-${def.mode}`} data-testid="mode-label">{MODE_GLYPH[def.mode]} {MODE_LABEL[def.mode]}</span>
        </div>
        {def.lab ? (
          <p className="muted small lab-note">Practice level: uses {gene.symbol} bases already in the campaign; adds no coverage.</p>
        ) : (
          <>
            <div className="progress" role="progressbar" aria-label={`${gene.symbol} sample bases sequenced`} aria-valuemin={0} aria-valuemax={sample} aria-valuenow={covered}>
              <i style={{ width: `${(100 * covered) / sample}%` }} />
            </div>
            <div className="row-between muted small">
              <span data-testid="progress-text">{covered} / {sample} {gene.symbol} sample bases</span>
              <span>{par} · {def.metrics.rating}</span>
            </div>
          </>
        )}
      </section>

      <TargetPanel def={def} matches={matches} solved={solvedView} />

      <Board
        def={def}
        board={puzzle.board}
        matches={matches}
        selected={selected}
        hint={dragHint?.slide ?? null}
        hintSegment={dragHint?.segment ?? []}
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
        segmentOf={segmentOf}
        locks={puzzle.locks}
        scaffold={puzzle.scaffold}
        targeting={targeting ? { power: targeting, tiles: targetTiles, gaps } : null}
        powerPreview={powerPreview}
        onTarget={onTarget}
        onPickGap={onPickGap}
      />

      <div className="row-between small meta">
        <span data-testid="moves">{puzzle.moves} {puzzle.moves === 1 ? 'move' : 'moves'}</span>
        <span className="muted">Selected R{Math.floor(selected / 9) + 1} · C{(selected % 9) + 1}</span>
      </div>

      {powers && !solvedView && (
        <PowerTray
          energy={energy}
          freeUses={puzzle.freeUses}
          locks={puzzle.locks}
          scaffold={puzzle.scaffold}
          active={targeting}
          disabled={solvedView}
          highlightRelease={activeHint?.kind === 'release'}
          onPick={pickPower}
          onRelease={() => dispatch({ type: 'release' })}
        />
      )}

      {panel ?? (
        <>
          <div className="dpad" aria-label="Slide the selected tile's segment one cell">
            <button type="button" onClick={() => onMove({ origin: selected, axis: 'row', direction: -1 })} disabled={solvedView} aria-label="Slide row left">←</button>
            <button type="button" onClick={() => onMove({ origin: selected, axis: 'col', direction: -1 })} disabled={solvedView} aria-label="Slide column up">↑</button>
            <button type="button" onClick={() => onMove({ origin: selected, axis: 'col', direction: 1 })} disabled={solvedView} aria-label="Slide column down">↓</button>
            <button type="button" onClick={() => onMove({ origin: selected, axis: 'row', direction: 1 })} disabled={solvedView} aria-label="Slide row right">→</button>
          </div>
          <div className="actions">
            <button type="button" onClick={() => dispatch({ type: 'undo' })} disabled={solvedView || puzzle.history.length === 0}>Undo</button>
            <button type="button" onClick={showHint} disabled={solvedView}>Hint</button>
            <button type="button" onClick={() => dispatch({ type: 'restart' })} disabled={solvedView || (puzzle.moves === 0 && puzzle.history.length === 0)}>Restart</button>
          </div>
        </>
      )}

      <p className="status" role="status" aria-live="polite" data-testid="status">{status || defaultStatus}</p>
      {activeHint?.kind === 'undo' && !solvedView && (
        <div className="solved-bar">
          <button type="button" className="primary" onClick={() => rewind(activeHint.count)} data-testid="rewind">Undo ×{activeHint.count}</button>
          <button type="button" onClick={() => dispatch({ type: 'restart' })}>Restart (free)</button>
        </div>
      )}
      {activeHint?.kind === 'restart' && !solvedView && (
        <div className="solved-bar">
          <button type="button" className="primary" onClick={() => dispatch({ type: 'restart' })} data-testid="restart-hint">Restart (free)</button>
        </div>
      )}

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
          powersUsed={powersUsed}
          newBases={celebrate.newBases}
          discovered={celebrate.discovered}
          covered={covered}
          sample={sample}
          cdsLength={gene.cdsLength}
          allDone={LEVELS.every((l) => save.completed.includes(l.id))}
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
