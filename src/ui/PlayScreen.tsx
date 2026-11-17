import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyCommand, certifiedHint, createInitialState, energyOf, fullHint, levelCodons, segmentIn, trackMatches,
  type Command, type CommandResult, type PuzzleState,
} from '../engine/engine.ts';
import { codonComplete, OPENING_LEVEL_ID, POWER_COST, powersEnabled, SCAFFOLD_TURNS, scaffoldCandidates, type ScaffoldCandidate } from '../engine/powers.ts';
import type { Axis, Base, Cell, LevelDefinition, Move, Power } from '../engine/types.ts';
import { CAMPAIGN_LEVELS, LAB_LEVELS, isDiscovered, runOf } from '../campaign/campaign.ts';
import { assemblyStatus } from '../campaign/assembly.ts';
import { symbolLabel, symbolSequence } from '../engine/tokens.ts';
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

interface Props {
  def: LevelDefinition;
  save: SaveData;
  persist: (next: SaveData) => void;
  reducedMotion: boolean;
  onPlay: (levelId: string) => void;
  onMap: () => void;
  onCard: (symbol: string) => void;
  onPowerArmed?: (armed: boolean) => void;
  hintMode: boolean | null;
  onHintModeChange: (enabled: boolean) => void;
}

export function PlayScreen({ def, save, persist, reducedMotion, onPlay, onMap, onCard, onPowerArmed, hintMode, onHintModeChange }: Props) {
  const attempt = save.attempts[def.id];
  const alreadyCompleted = save.completed.includes(def.id);
  const bestForLevel = save.best[def.id];
  const puzzle = useMemo(() => attempt ?? (alreadyCompleted ? solvedDisplayState(def, bestForLevel) : createInitialState(def)), [attempt, alreadyCompleted, def, bestForLevel]);
  const gene = GENES[def.symbol]!;
  // Campaign sliding puzzles use only Undo, Hint and Restart. Enzyme Lab remains optional.
  const powers = !!def.lab && powersEnabled(def);
  const [selected, setSelected] = useState<Cell>(() => defaultSelection(def, puzzle));
  const [animation, setAnimation] = useState<MoveAnimation | null>(null);
  const [celebrate, setCelebrate] = useState<{ newBases: number; discovered: boolean; assembled: boolean; replayed: boolean } | null>(null);
  const [preview, setPreview] = useState<SlidePreview | null>(null);
  const [targeting, setTargeting] = useState<Power | null>(null);
  const [pending, setPending] = useState<PowerPreview | null>(null);
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
    const r = applyCommand(def, puzzle, { type: 'slide', ...preview }, powers);
    if (r.accepted) shownBoard = r.state.board;
  } else if (previewResult?.accepted && pending?.power === 'crispr') shownBoard = previewResult.state.board;
  const matches = trackMatches(def, shownBoard);
  const solvedView = puzzle.status === 'solved';
  const energy = energyOf(puzzle);

  // Derive guidance from the committed state. Memoisation avoids rerunning the bounded
  // solver for each pointer preview or render; power targeting temporarily hides hints.
  const activeHint = useMemo(() => {
    if (puzzle.status === 'solved' || targeting) return null;
    if (hintMode === true) return fullHint(def, puzzle);
    if (hintMode === null && (def.tutorial || def.id === OPENING_LEVEL_ID) && puzzle.moves === 0) return certifiedHint(def, puzzle);
    return null;
  }, [def, puzzle, hintMode, targeting]);
  const showGestureCue = activeHint?.kind === 'drag' && (def.tutorial || def.id === OPENING_LEVEL_ID) && puzzle.moves === 0;
  const dragHint = activeHint?.kind === 'drag' && !solvedView ? activeHint : null;
  const hintCell = dragHint ? hintDisplayCell(def, puzzle.board, dragHint.slide, dragHint.segment) : null;

  const segmentOf = useCallback((origin: Cell, axis: Axis) => segmentIn(def, puzzle, origin, axis), [def, puzzle]);

  const clearPower = () => {
    setTargeting(null);
    setPending(null);
  };
  useEffect(() => {
    onPowerArmed?.(!!targeting);
    return () => onPowerArmed?.(false);
  }, [targeting, onPowerArmed]);

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
              setCelebrate({ newBases: 0, discovered: false, assembled: false, replayed: alreadyCompleted });
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
              setCelebrate({ newBases: assemblyStatus(next.completed, gene).covered - before, discovered: discoveredNow, assembled: assembledNow, replayed: alreadyCompleted });
            }
            sound = 'win';
            break;
          }
        }
      }
      if (sound) cue(sound);
      persist(next);
      return true;
    },
    [def, gene, save, persist, cue, powersUsed, alreadyCompleted, setPreview, setAnimation, setSelected, setPowersUsed, setCelebrate],
  );

  const dispatch = useCallback((command: Command): boolean => commit(applyCommand(def, puzzle, command, powers)), [commit, def, puzzle, powers]);

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

  const toggleHint = () => {
    clearPower();
    const enabled = hintMode !== true;
    onHintModeChange(enabled);
    if (enabled) {
      const quick = certifiedHint(def, puzzle);
      if (quick?.kind === 'drag') setSelected(hintDisplayCell(def, puzzle.board, quick.slide, quick.segment));
    }
  };

  // ---- power targeting ------------------------------------------------------------------
  const pickPower = (p: Power) => {
    if (!powers) return;
    if (targeting === p) return clearPower();
    const free = puzzle.freeUses.includes(p);
    if (!free && energy < POWER_COST[p]) {
      cue('reject');
      return;
    }
    if (p === 'ligase' && puzzle.locks.length) { cue('reject'); return; }
    if (p === 'scaffold' && puzzle.scaffold) { cue('reject'); return; }
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
    if (targeting === 'crispr') {
      if (puzzle.locks.includes(cell)) { cue('reject'); return; }
      setSelected(cell);
      setPending({ power: 'crispr', cell, base: null, pos: 0 });
    } else if (targeting === 'ligase') {
      const codon = levelCodons(def).find((c) => c.cells.includes(cell));
      if (!codon || !codonComplete(puzzle.board, codon)) { cue('reject'); return; }
      setSelected(cell);
      setPending({ power: 'ligase', cells: codon.cells });
    } else {
      setSelected(cell);
    }
  };
  const onPickGap = (candidate: ScaffoldCandidate) => {
    setPending({ power: 'scaffold', candidate });
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
    let detail = '';
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
        if (pending.base && pending.base !== cur) {
          detail = `Base ${pending.pos + 1}: ${cur} → ${pending.base}, giving ${after}. ${t ? `Target ${t.group} position ${pos + 1} wants ${want}: ${want === after ? '✓ it will match (equality is by sequence).' : '✗ it will not match.'}` : 'Not a target cell (decoy).'}`;
        }
      } else {
        if (pending.base && pending.base !== cur) {
          detail = `${cur} → ${pending.base}. ${t ? `Target ${t.group} position ${pos + 1} wants ${t.expected[pos]}: ${t.expected[pos] === pending.base ? '✓ it will match.' : '✗ it will not match.'}` : 'Not a target cell (filler only).'}`;
        }
      }
    } else if (pending?.power === 'ligase') {
      title = `Ligase: bond ${pending.cells.map((c) => symbolLabel(def, puzzle.custom, puzzle.board[c]!)).join('')}`;
      detail = def.tokens
        ? 'Stop every row and column through it from rotating (both axes). Release any time for free. Undo will refund'
        : 'Stop every row and column through them from rotating (both axes). Release any time for free. Undo will refund';
    } else if (pending?.power === 'scaffold') {
      title = 'Scaffold: Join cells across the gap';
      detail = `The two segments skip the gap for the next ${SCAFFOLD_TURNS} rotations`;
    }
    panel = (
      <PowerPanel
        power={targeting}
        title={title}
        detail={detail}
        costText={costText}
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
  const nextLevel = def.lab ? LAB_LEVELS[labIndex + 1] : campaignIndex >= 0 ? CAMPAIGN_LEVELS.slice(campaignIndex+1).find(l=>!save.legacyReferenceLevels?.includes(l.id)) : undefined;
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
      <TargetPanel def={def} matches={matches} committedMatches={trackMatches(def, puzzle.board)} solved={solvedView} custom={puzzle.custom} />

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
          recoveryHint={!powers && (activeHint?.kind === 'undo' || activeHint?.kind === 'restart') ? activeHint.kind : undefined}
          onPick={pickPower}
          onRelease={() => dispatch({ type: 'release' })}
          canUndo={puzzle.history.length > 0}
          canRestart={puzzle.moves > 0 || puzzle.history.length > 0}
          onUndo={() => dispatch({ type: 'undo' })}
          hintEnabled={hintMode === true}
          onHint={toggleHint}
          onRestart={() => dispatch({ type: 'restart' })}
        />
      )}

      {powers && activeHint?.kind === 'undo' && !solvedView && (
        <div className="solved-bar">
          <button type="button" className="primary" onClick={() => rewind(activeHint.count)} data-testid="rewind">Undo ×{activeHint.count}</button>
          <button type="button" onClick={() => dispatch({ type: 'restart' })}>Restart (free)</button>
        </div>
      )}
      {powers && activeHint?.kind === 'restart' && !solvedView && (
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
          replayed={celebrate.replayed}
          assembled={celebrate.assembled || (!def.lab && assembly.verified && runOf(def.symbol).at(-1)?.id === def.id)}
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
