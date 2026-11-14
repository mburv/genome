import { useCallback, useRef, useState } from 'react';
import {
  applyCommand, certifiedHint, createInitialState, energyOf, fullHint, levelCodons, segmentIn, trackMatches,
  type Command, type CommandResult, type Hint, type PuzzleState, type RejectReason,
} from '../engine/engine.ts';
import { codonComplete, OPENING_LEVEL_ID, POWER_COST, powersEnabled, scaffoldCandidates, type ScaffoldCandidate } from '../engine/powers.ts';
import type { Axis, Base, Cell, LevelDefinition, Move, Power } from '../engine/types.ts';
import { CAMPAIGN_LEVELS, LAB_LEVELS, isDiscovered } from '../campaign/campaign.ts';
import { assemblyStatus } from '../campaign/assembly.ts';
import { symbolLabel, symbolSequence } from '../engine/tokens.ts';
import { SeqLetters, tokenStyle } from './TokenFace.tsx';
import { GENES } from '../genomics/genes.ts';
import { recordAssembly, recordBest, recordCompletion, solvedDisplayState, type SaveData } from '../persistence/save.ts';
import { Board, type MoveAnimation, type PowerPreview, type SlidePreview } from './Board.tsx';
import { TargetPanel } from './TargetPanel.tsx';
import { SolvedBanner } from './SolvedBanner.tsx';
import { WinCard } from './WinCard.tsx';
import { PowerPanel, PowerTray, POWER_LABEL } from './PowerTray.tsx';
import { hintDisplayCell } from './hintCell.ts';
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
  'powers-unavailable': 'Powers are available after the first puzzle.',
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

const stateKey = (s: PuzzleState): string => `${s.board}|${s.moves}|${s.history.length}|${s.locks.join()}|${s.scaffold?.remaining ?? 0}|${s.edits}|${Object.keys(s.custom).length}`;

export function PlayScreen({ def, save, persist, reducedMotion, onPlay, onMap, onCard }: Props) {
  const attempt = save.attempts[def.id];
  const alreadyCompleted = save.completed.includes(def.id);
  const puzzle = attempt ?? (alreadyCompleted ? solvedDisplayState(def, save.best[def.id]) : createInitialState(def));
  const gene = GENES[def.symbol]!;
  const powers = powersEnabled(def);
  const [selected, setSelected] = useState<Cell>(() => defaultSelection(def, puzzle));
  const [hintRes, setHintRes] = useState<{ key: string; hint: Hint } | null>(null);
  const [animation, setAnimation] = useState<MoveAnimation | null>(null);
  const [celebrate, setCelebrate] = useState<{ newBases: number; discovered: boolean; assembled: boolean } | null>(null);
  const [preview, setPreview] = useState<SlidePreview | null>(null);
  const [targeting, setTargeting] = useState<Power | null>(null);
  const [pending, setPending] = useState<PowerPreview | null>(null);
  const [trayNote, setTrayNote] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [powersUsed, setPowersUsed] = useState(0);
  const [replayPulse, setReplayPulse] = useState(false);
  const nonce = useRef(0);
  const cue = useCallback((c: Cue) => playCue(c, save.settings), [save.settings]);

  // ---- power preview (pure: applyCommand on a copy) -------------------------------------
  const previewCmd: Command | null =
    pending?.power === 'crispr' && pending.base ? { type: 'edit', cell: pending.cell, base: pending.base, pos: pending.pos }
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

  const autoHint = (def.tutorial || def.id === OPENING_LEVEL_ID) && puzzle.moves === 0 && !solvedView ? certifiedHint(def, puzzle) : null;
  const showGestureCue = autoHint?.kind === 'drag';
  const activeHint = hintRes && hintRes.key === stateKey(puzzle) ? hintRes.hint : autoHint;
  const dragHint = activeHint?.kind === 'drag' && !solvedView ? activeHint : null;
  const hintCell = dragHint ? hintDisplayCell(def, puzzle.board, dragHint.slide, dragHint.segment) : null;

  const segmentOf = useCallback((origin: Cell, axis: Axis) => segmentIn(def, puzzle, origin, axis), [def, puzzle]);

  const clearPower = () => {
    setTargeting(null);
    setPending(null);
    setPanelError(null);
  };

  const commit = useCallback(
    (result: CommandResult): boolean => {
      setPreview(null);
      if (!result.accepted) {
        if (result.reason !== 'solved') cue('reject');
        return false;
      }
      let next: SaveData = { ...save, attempts: { ...save.attempts, [def.id]: result.state } };
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
            sound = 'undo';
            break;
          case 'restarted':
            setSelected(defaultSelection(def, result.state));
            setPowersUsed(0);
            break;
          case 'spent':
            setPowersUsed((n) => n + 1);
            sound = 'power';
            break;
          case 'edited':
            break;
          case 'bonded':
            break;
          case 'released':
            sound = 'release';
            break;
          case 'scaffolded':
            break;
          case 'scaffold-expired':
            sound = 'expire';
            break;
          case 'energy':
            if (ev.gained > 0) sound = 'energy';
            break;
          case 'solved': {
            const used = powersUsed + result.events.filter((e) => e.type === 'spent').length;
            if (def.lab) {
              next = recordCompletion(next, def.id);
              next = recordBest(next, def.id, { moves: result.state.moves, powersUsed: used });
              setCelebrate({ newBases: 0, discovered: false, assembled: false });
            } else {
              // Bases are counted as a union over every completed chapter puzzle of the gene.
              const before = assemblyStatus(next.completed, gene).covered;
              next = recordCompletion(next, def.id);
              next = recordBest(next, def.id, { moves: result.state.moves, powersUsed: used });
              const discoveredNow = isDiscovered(next.completed, def.symbol) && !next.discovered.includes(def.symbol);
              if (discoveredNow) next = { ...next, discovered: [...next.discovered, def.symbol] };
              const wasAssembled = next.assembled.includes(def.symbol);
              next = recordAssembly(next, def.symbol);
              const assembledNow = !wasAssembled && next.assembled.includes(def.symbol);
              setCelebrate({ newBases: assemblyStatus(next.completed, gene).covered - before, discovered: discoveredNow, assembled: assembledNow });
            }
            sound = 'win';
            break;
          }
        }
      }
      setTrayNote(null);
      setPanelError(null);
      if (sound) cue(sound);
      setHintRes(null);
      persist(next);
      return true;
    },
    [def, gene, save, persist, cue, powersUsed],
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
  };

  const presentHint = (h: Hint | null) => {
    if (!h) return;
    setHintRes({ key: stateKey(puzzle), hint: h });
    if (h.kind === 'drag') setSelected(hintDisplayCell(def, puzzle.board, h.slide, h.segment));
  };

  const showHint = () => {
    clearPower();
    // The certified path is instant; only after powers change the board is a bounded search needed.
    const quick = certifiedHint(def, puzzle);
    if (quick) return presentHint(quick);
    presentHint(fullHint(def, puzzle));
  };

  // ---- power targeting ------------------------------------------------------------------
  const pickPower = (p: Power) => {
    if (targeting === p) return clearPower();
    setHintRes(null);
    setTrayNote(null);
    setPanelError(null);
    const free = puzzle.freeUses.includes(p);
    if (!free && energy < POWER_COST[p]) {
      cue('reject');
      return setTrayNote(`${POWER_LABEL[p]} needs ⚡${POWER_COST[p]} (you have ${energy}).`);
    }
    if (p === 'ligase' && puzzle.locks.length) { cue('reject'); return setTrayNote(REJECT_TEXT['bond-active']!); }
    if (p === 'scaffold' && puzzle.scaffold) { cue('reject'); return setTrayNote(REJECT_TEXT['scaffold-active']!); }
    setTargeting(p);
    setPending(null);
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
      if (puzzle.locks.includes(cell)) return setPanelError(REJECT_TEXT.locked!);
      setPanelError(null);
      setPending({ power: 'crispr', cell, base: null, pos: 0 });
    } else if (targeting === 'ligase') {
      const codon = levelCodons(def).find((c) => c.cells.includes(cell));
      if (!codon) return setPanelError(REJECT_TEXT['not-a-codon']!);
      if (!codonComplete(puzzle.board, codon)) return setPanelError(def.tokens ? 'That piece isn’t in place yet.' : 'That codon isn’t complete yet — finish its three bases first.');
      setPanelError(null);
      setPending({ power: 'ligase', cells: codon.cells });
    }
  };
  const onPickGap = (candidate: ScaffoldCandidate) => {
    setPending({ power: 'scaffold', candidate });
    setPanelError(null);
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
    let detail = targeting === 'crispr' ? 'Tap any unbonded tile on the board.' : targeting === 'ligase' ? (completeCodons.length ? (def.tokens ? 'Tap a highlighted piece.' : 'Tap a highlighted codon.') : def.tokens ? 'No target piece in place yet.' : 'No complete codon yet — finish a 3-base piece first.') : gaps.length ? 'Tap a glowing gap.' : 'No 1–2 cell gap between two segments on this board.';
    let basePicker;
    let posPicker;
    if (pending?.power === 'crispr') {
      const sym = puzzle.board[pending.cell]!;
      const seq = symbolSequence(def, puzzle.custom, sym);
      const cur = seq[pending.pos] as Base;
      const t = def.tracks.find((x) => x.cells.includes(pending.cell));
      const pos = t ? t.cells.indexOf(pending.cell) : -1;
      title = `CRISPR: row ${Math.floor(pending.cell / 9) + 1}, column ${(pending.cell % 9) + 1}`;
      basePicker = { current: cur, chosen: pending.base, onPick: (b: Base) => setPending({ ...pending, base: b }) };
      if (def.tokens) {
        posPicker = { seq, chosen: pending.pos, onPick: (i: number) => setPending({ ...pending, pos: i, base: null }) };
        const after = pending.base ? seq.slice(0, pending.pos) + pending.base + seq.slice(pending.pos + 1) : seq;
        const want = t ? symbolSequence(def, puzzle.custom, t.expected[pos]!) : '';
        detail = !pending.base ? `Piece ${seq} (${seq.length} bases). Base ${pending.pos + 1} is ${cur}. Pick a new base.`
          : pending.base === cur ? 'Same base — no change, nothing spent.'
            : `Base ${pending.pos + 1}: ${cur} → ${pending.base}, giving ${after}. ${t ? `Target ${t.group} position ${pos + 1} wants ${want}: ${want === after ? '✓ it will match (equality is by sequence).' : '✗ it will not match.'}` : 'Not a target cell (decoy).'} Hints switch to a fresh search after an edit.`;
      } else {
        detail = !pending.base ? `Currently ${cur}. Pick a base.`
          : pending.base === cur ? 'Same base — no change, nothing spent.'
            : `${cur} → ${pending.base}. ${t ? `Target ${t.group} position ${pos + 1} wants ${t.expected[pos]}: ${t.expected[pos] === pending.base ? '✓ it will match.' : '✗ it will not match.'}` : 'Not a target cell (filler only).'} Hints switch to a fresh search after an edit.`;
      }
    } else if (pending?.power === 'ligase') {
      title = `Ligase: bond ${pending.cells.map((c) => symbolLabel(def, puzzle.custom, puzzle.board[c]!)).join('')}`;
      detail = def.tokens
        ? 'This piece will stop every row and column through it from rotating (both axes). Release any time for free; undo refunds.'
        : 'These three tiles will stop every row and column through them from rotating (both axes). Release any time for free; undo refunds.';
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
        error={err ?? panelError}
        canConfirm={!!previewResult?.accepted}
        basePicker={basePicker}
        posPicker={posPicker}
        onConfirm={confirmPower}
        onCancel={() => clearPower()}
      />
    );
  }

  const assembly = assemblyStatus(save.completed, gene);
  const labIndex = LAB_LEVELS.findIndex((l) => l.id === def.id);
  const campaignIndex = CAMPAIGN_LEVELS.findIndex((l) => l.id === def.id);
  const nextLevel = def.lab ? LAB_LEVELS[labIndex + 1] : campaignIndex >= 0 ? CAMPAIGN_LEVELS[campaignIndex + 1] : undefined;
  const powerPreview: PowerPreview | null = pending;

  const best = save.best[def.id];
  const replay = () => {
    setCelebrate(null);
    setReplayPulse(false);
    dispatch({ type: 'restart' });
  };
  const nudgeReplay = () => {
    if (reducedMotion) return;
    setReplayPulse(false);
    requestAnimationFrame(() => setReplayPulse(true));
  };

  return (
    <>
      <TargetPanel def={def} matches={matches} solved={solvedView} custom={puzzle.custom} />

      <div className="board-stage">
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
        custom={puzzle.custom}
        onLockedInteract={nudgeReplay}
      />
      {solvedView && !celebrate && (
        <SolvedBanner
          def={def}
          moves={puzzle.moves}
          best={best}
          pulse={replayPulse}
          hasNext={!!nextLevel}
          onReplay={replay}
          onNext={() => (nextLevel ? onPlay(nextLevel.id) : onMap())}
          onMap={onMap}
        />
      )}
      </div>

      <div className="under-board" data-testid="under-board">
      {panel ?? (
        <>
      <div className="row-between small meta">
        <span data-testid="moves">{puzzle.moves} {puzzle.moves === 1 ? 'move' : 'moves'}</span>
        {best && <span className="muted" data-testid="best">Best {best.moves}</span>}
        <span className="muted">Selected R{Math.floor(selected / 9) + 1} · C{(selected % 9) + 1}</span>
      </div>
      {def.tokens && puzzle.board[selected] !== '.' && <TokenInspector def={def} puzzle={puzzle} cell={selected} />}

      {!solvedView && (
        <PowerTray
          energy={energy}
          powersEnabled={powers}
          freeUses={puzzle.freeUses}
          locks={puzzle.locks}
          scaffold={puzzle.scaffold}
          active={targeting}
          disabled={solvedView}
          highlightRelease={activeHint?.kind === 'release'}
          onPick={pickPower}
          onRelease={() => dispatch({ type: 'release' })}
          canUndo={puzzle.history.length > 0}
          canRestart={puzzle.moves > 0 || puzzle.history.length > 0}
          onUndo={() => dispatch({ type: 'undo' })}
          onHint={showHint}
          onRestart={() => dispatch({ type: 'restart' })}
          notice={trayNote ?? undefined}
        />
      )}

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
        </>
      )}
      </div>


      {celebrate && (
        <WinCard
          def={def}
          moves={puzzle.moves}
          powersUsed={powersUsed}
          newBases={celebrate.newBases}
          assembled={celebrate.assembled}
          assembledBases={assembly.covered}
          cdsLength={gene.cdsLength}
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

/** Tap-to-inspect: the full sequence and provenance of the selected multi-base tile. */
function TokenInspector({ def, puzzle, cell }: { def: LevelDefinition; puzzle: PuzzleState; cell: Cell }) {
  const sym = puzzle.board[cell]!;
  const seq = symbolSequence(def, puzzle.custom, sym);
  const t = def.tokens?.[sym];
  const track = def.tracks.find((x) => x.cells.includes(cell));
  const want = track ? symbolSequence(def, puzzle.custom, track.expected[track.cells.indexOf(cell)]!) : null;
  const where = t?.kind === 'decoy' && t.source
    ? `decoy — real ${def.symbol} CDS ${t.source.start + 1}–${t.source.end}, not part of this target`
    : t?.kind === 'target' ? (t.strand === 'complement' ? 'target piece (aligned complement)' : `target piece — ${def.symbol} CDS ${t.source!.start + 1}–${t.source!.end}`)
      : 'edited by CRISPR (not reference sequence)';
  return (
    <div className="inspector small" data-testid="token-inspector" aria-live="polite">
      <span className="insp-head">
        <span className={`tok-chip insp-chip ${t ? '' : 'edited'}`} style={tokenStyle(def, sym)} data-testid="inspector-chip" data-seq={seq}>{symbolLabel(def, puzzle.custom, sym)}</span>
        <span className="mono seq"><SeqLetters seq={seq} group={3} /></span>
      </span>
      <span className="muted">{seq.length} bases · {where}{want ? ` · target here: ${want === seq ? '✓ match' : want}` : ''}</span>
    </div>
  );
}
