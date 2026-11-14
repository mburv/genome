import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { applyLab, createLab, labHint, LAB_IDS, LAB_META, LAB_REFERENCE, DEFAULT_LAB_SPEC, mutationExpected as expectedMutation, mutationCount as countMutations, reverseComplement, adjacent, type LabResult, type LabId, type LabState, type LabAction, type DNA } from '../engine/mechanicsLab.ts';
import { TargetShell } from './TargetPanel.tsx';
import { PowerTray } from './PowerTray.tsx';
import { WinCard } from './WinCard.tsx';
import { SolvedBanner } from './SolvedBanner.tsx';
import { ALL_LEVELS, OPENING_LEVEL_ID } from '../campaign/campaign.ts';
import { INS } from '../genomics/genes.ts';
import type { LevelDefinition } from '../engine/types.ts';
import { labExtractedSequence } from '../engine/mechanicsLab.ts';
import { type MixedStage } from '../campaign/mixed.ts';

export function MechanicsMenu({ onPlay, onBack }: { onPlay: (id: LabId) => void; onBack: () => void }) {
  return <section className="mechanics-menu" data-testid="mechanics-menu">
    <div className="row-between"><h2 className="gene">Mechanics Lab</h2><button type="button" onClick={onBack}>Map</button></div>
    <p className="muted small">Six practice puzzle types. All use a 9×9 board and reference DNA. Practice here without changing your gene progress.</p>
    {LAB_IDS.map((id, i) => <button type="button" key={id} className="mechanic-entry" onClick={() => onPlay(id)} data-testid={'mechanic-' + id}>
      <span className="mechanic-icon">{LAB_META[id].icon}</span><span><b>{i + 1}. {LAB_META[id].title}</b><small>{LAB_META[id].short}</small></span><span aria-hidden="true">→</span>
    </button>)}
  </section>;
}

const cellPoint = (c: number): [number, number] => [c % 9 + .5, Math.floor(c / 9) + .5];
const pathPoints = (path: readonly number[]): string => path.map(c => cellPoint(c).join(',')).join(' ');
const pathColors = ['#2a6e4f', '#2b5f9e', '#8c5a10'];
const pathFills = ['var(--mint)', 'var(--sky)', 'var(--butter)'];
type WinCredit = { newBases: number; replayed: boolean; assembled: boolean };
type Session = { state: LabState; history: LabState[]; actions: LabAction[]; message: string; celebration: WinCredit | null };
type CrushDrag = { a: number; b: number; fraction: number };
type CrushAnimation = { a: number; b: number; stage: 'swap' | 'return' | 'clear' | 'fall'; result: LabResult; action: LabAction; credit: WinCredit };
const crushTiming = { swap: 145, return: 145, clear: 200, fall: 320 } as const;

function acceptResult(prev: Session, result: LabResult, action: LabAction, credit: WinCredit | null = null): Session {
  return { state: result.state, history: result.state === prev.state ? prev.history : [...prev.history, prev.state], actions: result.state === prev.state ? prev.actions : [...prev.actions, action], message: result.message || prev.message, celebration: result.state.won && !prev.state.won ? credit : prev.celebration };
}
function crushDirection(a: number, dx: number, dy: number, pitch: number, board: readonly string[]): CrushDrag | null {
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const distance = horizontal ? dx : dy;
  if (Math.abs(distance) < 2 || pitch <= 0) return null;
  const b = a + Math.sign(distance) * (horizontal ? 1 : 9);
  if (b < 0 || b >= 81 || !adjacent(a, b) || board[b] === '.') return null;
  return { a, b, fraction: Math.min(1, Math.abs(distance) / pitch) };
}
function swapTransform(cell: number, motion: CrushDrag): string | undefined {
  if (cell !== motion.a && cell !== motion.b) return undefined;
  const from = cell === motion.a ? motion.a : motion.b;
  const to = cell === motion.a ? motion.b : motion.a;
  const dx = (to % 9 - from % 9) * motion.fraction;
  const dy = (Math.floor(to / 9) - Math.floor(from / 9)) * motion.fraction;
  return 'translate(calc(' + (dx * 100) + '% + ' + dx + 'px), calc(' + (dy * 100) + '% + ' + dy + 'px))';
}

interface CampaignPlay {
  def: LevelDefinition; completed: boolean; onCard: () => void; hasNext: boolean;
  stage: MixedStage; initialActions: readonly LabAction[]; part: number; of: number; covered: number;
  assembled: boolean; onProgress: (actions: readonly LabAction[], state: LabState) => void; onNext: () => void;
}
export function MechanicsPlay({ id, onBack, onNext, reducedMotion, campaign, hintMode, onHintModeChange }: { id: LabId; onBack: () => void; onNext: (id: LabId) => void; reducedMotion: boolean; campaign?: CampaignPlay; hintMode?: boolean | null; onHintModeChange?: (enabled: boolean) => void }) {
  const meta = LAB_META[id];
  const spec = campaign?.stage.spec ?? DEFAULT_LAB_SPEC;
  const { TRACE_TARGET, CRUSH_TARGETS, READ_CELLS, ASSEMBLY_CELLS, ASSEMBLY_TARGET, MUTATION_ROWS, CONNECTION_PAIRS, CUT_STRANDS, CUT_SITES, CUT_TARGET } = spec;
  const readAt = (c: number) => READ_CELLS.findIndex(row => row.includes(c));
  const endAt = (c: number) => CONNECTION_PAIRS.findIndex(p => p.start === c || p.end === c);
  const startAt = (c: number) => CONNECTION_PAIRS.findIndex(p => p.start === c);
  const mutationExpected = (c: number) => expectedMutation(c, spec);
  const mutationCount = (board: readonly string[]) => countMutations(board, spec);
  const [session, setSession] = useState<Session>(() => {
    const initial: Session = { state: createLab(id, spec), history: [], actions: [], message: '', celebration: null };
    return (campaign?.initialActions ?? []).reduce((prev, action) => acceptResult(prev, applyLab(prev.state, action), action), initial);
  });
  const [selected, setSelected] = useState<number | null>(null);
  const [localHint, setHint] = useState(false);
  const hint = id === 'trace' && campaign ? hintMode === true : localHint;
  const toggleHint = () => { if (id === 'trace' && campaign && onHintModeChange) onHintModeChange(!hint); else setHint(v => !v); };
  const gesture = useRef<{ pointer: number; start: number; last: number; pair: number; read: number; x: number; y: number; pitch: number } | null>(null);
  const [crushDrag, setCrushDrag] = useState<CrushDrag | null>(null);
  const [crushAnimation, setCrushAnimation] = useState<CrushAnimation | null>(null);
  const busy = crushAnimation !== null;
  const { state } = session;
  // All mechanics share the sliding completion dialog. Wait until the final
  // gesture has ended so the same touch cannot activate a new overlay button.
  const [gestureActive, setGestureActive] = useState(false);
  const [winReady, setWinReady] = useState(state.won);
  useEffect(() => {
    if (!state.won || gestureActive) return;
    const timer = window.setTimeout(() => setWinReady(true), 180);
    return () => window.clearTimeout(timer);
  }, [state.won, gestureActive]);
  const credit: WinCredit = {
    newBases: campaign && !campaign.completed ? campaign.stage.sequence.length : 0,
    replayed: campaign?.completed ?? false,
    assembled: !!campaign && !campaign.assembled && !campaign.completed && campaign.covered + campaign.stage.sequence.length === INS.cdsLength,
  };
  const onProgress = campaign?.onProgress;
  useEffect(() => { onProgress?.(session.actions, state); }, [onProgress, session.actions, state]);
  const boardRef = useRef<HTMLDivElement>(null);
  const dispatch = (action: LabAction) => setSession(prev => {
    const result = applyLab(prev.state, action);
    return acceptResult(prev, result, action, credit);
  });
  // Only presentation is delayed. Commit the exact engine result once, after the final frame.
  useEffect(() => {
    if (!crushAnimation) return;
    const { stage, result, action, credit } = crushAnimation;
    const timer = window.setTimeout(() => {
      if (stage === 'swap') setCrushAnimation({ ...crushAnimation, stage: result.crush ? 'clear' : 'return' });
      else if (stage === 'clear') setCrushAnimation({ ...crushAnimation, stage: 'fall' });
      else {
        setSession(prev => acceptResult(prev, result, action, credit));
        setCrushAnimation(null);
      }
    }, crushTiming[stage]);
    return () => window.clearTimeout(timer);
  }, [crushAnimation]);
  const startCrushSwap = (a: number, b: number) => {
    if (busy || state.won) return;
    setSelected(null);
    setCrushDrag(null);
    const action: LabAction = { type: 'swap', a, b };
    const result = applyLab(state, action);
    if (!adjacent(a, b) || state.board[b] === '.' || reducedMotion) {
      setSession(prev => acceptResult(prev, result, action));
      return;
    }
    setCrushAnimation({ a, b, stage: 'swap', result, action, credit });
  };
  const animationFrame = crushAnimation?.result.crush;
  const displayBoard = crushAnimation?.stage === 'clear' && animationFrame ? animationFrame.swapped
    : crushAnimation?.stage === 'fall' ? crushAnimation.result.state.board : state.board;
  const swapMotion = crushAnimation && (crushAnimation.stage === 'swap' || crushAnimation.stage === 'return')
    ? { a: crushAnimation.a, b: crushAnimation.b, fraction: crushAnimation.stage === 'swap' ? 1 : 0 }
    : crushDrag;
  const falling = new Map(crushAnimation?.stage === 'fall' ? animationFrame?.falls.map(f => [f.to, f]) : []);
  const reset = () => { setWinReady(false); setGestureActive(false); setSession({ state: createLab(id, spec), history: [], actions: [], message: '', celebration: null }); setSelected(null); };
  const undo = () => { setWinReady(false); setSession(prev => { const last = prev.history.at(-1); return last ? { state: last, history: prev.history.slice(0, -1), actions: prev.actions.slice(0, -1), message: 'Undone.', celebration: null } : prev; }); setSelected(null); };
  const choose = (cell: number) => {
    if (state.won || busy || state.board[cell] === '.') return;
    if (id === 'trace') dispatch({ type: 'trace', cell });
    else if (id === 'crush') {
      if (selected === null || selected === cell) setSelected(selected === cell ? null : cell);
      else startCrushSwap(selected, cell);
    } else if (id === 'assembly') {
      const read = readAt(cell);
      if (read >= 0) setSelected(read);
      else if (selected !== null && ASSEMBLY_CELLS.includes(cell)) dispatch({ type: 'place', read: selected, offset: cell - ASSEMBLY_CELLS[0]! });
    } else if (id === 'mutation') { if (mutationExpected(cell)) setSelected(cell); }
    else if (id === 'connections') {
      const pair = startAt(cell);
      if (pair >= 0) { setSelected(pair); dispatch({ type: 'route', pair, cell }); }
      else if (selected !== null) dispatch({ type: 'route', pair: selected, cell });
    } else dispatch({ type: 'cut', cell });
  };
  const cellFromPoint = (e: PointerEvent<HTMLDivElement>): number | null => {
    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-lab-cell]');
    if (!hit || !boardRef.current?.contains(hit)) return null;
    return Number(hit.dataset.labCell);
  };
  const pointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (state.won || busy || e.button !== 0 || gesture.current) return;
    const cell = cellFromPoint(e);
    if (cell === null || state.board[cell] === '.') return;
    const pair = startAt(cell);
    const read = readAt(cell);
    const pitch = (e.currentTarget.getBoundingClientRect().width + 1) / 9;
    gesture.current = { pointer: e.pointerId, start: cell, last: cell, pair: pair >= 0 ? pair : selected ?? -1, read, x: e.clientX, y: e.clientY, pitch };
    e.currentTarget.setPointerCapture(e.pointerId);
    setGestureActive(true);
    if (id !== 'crush') choose(cell);
  };
  const pointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId || state.won || busy) return;
    if (id === 'crush') {
      setCrushDrag(crushDirection(g.start, e.clientX - g.x, e.clientY - g.y, g.pitch, state.board));
      return;
    }
    const cell = cellFromPoint(e);
    if (cell === null || cell === g.last || state.board[cell] === '.') return;
    g.last = cell;
    if (id === 'trace') dispatch({ type: 'trace', cell });
    else if (id === 'connections' && g.pair >= 0) dispatch({ type: 'route', pair: g.pair, cell });
  };
  const pointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    if (id === 'crush') {
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      const motion = crushDirection(g.start, dx, dy, g.pitch, state.board);
      gesture.current = null;
      setGestureActive(false);
      if (motion && motion.fraction >= .35) startCrushSwap(motion.a, motion.b);
      else {
        setCrushDrag(null);
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) choose(g.start);
      }
      return;
    }
    const cell = cellFromPoint(e);
    setGestureActive(false);
    if (id === 'assembly' && g.read >= 0 && cell !== null && ASSEMBLY_CELLS.includes(cell)) dispatch({ type: 'place', read: g.read, offset: cell - ASSEMBLY_CELLS[0]! });
    gesture.current = null;
  };
  const index = LAB_IDS.indexOf(id);
  const next = LAB_IDS[index + 1];
  const target = id === 'crush' ? CRUSH_TARGETS.join(' ') : id === 'restriction' ? CUT_TARGET : '';
  const progress = id === 'trace' ? state.trace.length + '/' + TRACE_TARGET.length + ' bases'
    : id === 'crush' ? state.collected + '/' + CRUSH_TARGETS.length + ' codons'
    : id === 'assembly' ? state.placements.filter(p => p >= 0).length + '/3 reads'
    : id === 'mutation' ? mutationCount(state.board) + ' mismatches'
    : id === 'connections' ? state.routes.filter((p, i) => p.at(-1) === CONNECTION_PAIRS[i]!.end).length + '/3 pairs'
    : state.cuts.length + '/2 cuts';
  const board = (
    <div ref={boardRef} className={'mechanics-board mode-lab-' + id + (id === 'trace' ? ' board trace-board' : '') + (crushDrag ? ' crush-dragging' : '') + (crushAnimation ? ' crush-' + crushAnimation.stage : '')} data-testid="mechanics-board" data-crush-phase={crushDrag ? 'drag' : crushAnimation?.stage ?? 'idle'} aria-busy={busy} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { gesture.current = null; setCrushDrag(null); setGestureActive(false); }} onLostPointerCapture={() => { gesture.current = null; setCrushDrag(null); setGestureActive(false); }}>
      {displayBoard.map((b, c) => {
        if (b === '.') return <div key={c} className={id === 'trace' ? "lab-hole cell hole" : "lab-hole"} data-lab-cell={c} aria-hidden="true" />;
        const pair = endAt(c), read = readAt(c), route = state.routes.findIndex(p => p.includes(c));
        const chosen = id === 'assembly' ? selected === read && read >= 0 : id === 'connections' ? selected === pair && pair >= 0 : selected === c;
        const mutationTarget = id === 'mutation' ? mutationExpected(c) : null;
        const isTop = id === 'mutation' && MUTATION_ROWS.some(r => c >= r.top && c < r.top + r.seq.length);
        const moving = !!swapMotion && (c === swapMotion.a || c === swapMotion.b);
        const clear = crushAnimation?.stage === 'clear' && animationFrame?.matched.includes(c);
        const fall = falling.get(c);
        const classes = ['lab-cell', id === 'trace' ? 'cell tile' : '', id === 'trace' && hint && !state.won && state.trace.every((p,i)=>p===spec.TRACE_PATH[i]) && spec.TRACE_PATH[state.trace.length]===c ? 'hinted' : '', mutationTarget ? (b === mutationTarget ? 'mutation-correct' : 'mutation-mismatch') : '', moving ? 'crush-moving' : '', clear ? 'crush-clearing' : '', fall ? 'crush-falling' : '', fall?.from === null ? 'crush-new' : '', /^[ACGT]$/.test(b) ? 'b-' + b : '', chosen ? 'selected' : '', state.trace.includes(c) ? 'traced' : '', route >= 0 ? 'routed' : '', isTop ? 'reference' : '', id === 'assembly' && ASSEMBLY_CELLS.includes(c) ? 'assembly-slot' : '', id === 'assembly' && ASSEMBLY_CELLS.includes(c) && b === ASSEMBLY_TARGET[c - ASSEMBLY_CELLS[0]!] ? 'assembly-correct' : '', id !== 'crush' && state.fresh.includes(c) ? 'fresh' : '', state.cuts.includes(c) ? 'cut' : ''].filter(Boolean).join(' ');
        const endpoint = id === 'connections' && pair >= 0;
        const connectionColor = id === 'connections' ? (endpoint ? pair : route) : -1;
        const cutSite = id === 'restriction' && CUT_SITES.includes(c);
        const badge = id === 'mutation' && c % 9 === 1 ? (isTop ? 'REF' : 'R' + (Math.floor(c / 9) + 1)) : endpoint ? String(pair + 1) + (CONNECTION_PAIRS[pair]!.start === c ? '→' : '←') : cutSite ? (state.cuts.includes(c) ? '✓' : '✂') : id === 'assembly' && read >= 0 && READ_CELLS[read]![0] === c ? 'R' + (read + 1) : id === 'assembly' && ASSEMBLY_CELLS.includes(c) ? String(c - ASSEMBLY_CELLS[0]! + 1) : '';
        const motionStyle: CSSProperties = { transform: swapMotion ? swapTransform(c, swapMotion) : undefined, ...(fall ? { '--fall-rows': fall.rows } : {}) } as CSSProperties;
        return <button key={c} type="button" className={classes} data-lab-cell={c} data-base={b} data-testid={'lab-cell-' + c} aria-label={'Row ' + (Math.floor(c / 9) + 1) + ' column ' + (c % 9 + 1) + ': ' + (b === '·' ? 'empty' : b) + (badge ? ', ' + badge : '')} aria-pressed={chosen} disabled={state.won && !gestureActive} onClick={e => { if (e.detail === 0) choose(c); }} data-connection-pair={connectionColor >= 0 ? connectionColor + 1 : undefined} style={connectionColor >= 0 ? { ...motionStyle, borderColor: pathColors[connectionColor], background: pathFills[connectionColor] } : motionStyle}>
          <span className={id === 'trace' ? 'letter' : undefined}>{b === '·' ? '' : b}</span>{badge && <small>{badge}</small>}
        </button>;
      })}
      <svg className="lab-lines" viewBox="0 0 9 9" aria-hidden="true">
        {id === 'trace' && state.trace.length > 1 && <polyline points={pathPoints(state.trace)} stroke="#2b5f9e" />}
        {id === 'connections' && state.routes.map((p, i) => p.length > 1 && <polyline key={i} points={pathPoints(p)} stroke={pathColors[i]} />)}
        {id === 'restriction' && CUT_STRANDS.map((strand, s) => strand.slice(0, -1).map((c, i) => !state.cuts.includes(c) && <polyline key={s + ':' + c} points={pathPoints([c, strand[i + 1]!])} stroke="#52524e" className="cut-line" />))}
      </svg>
    </div>
  );
  const winDef = campaign?.def ?? ALL_LEVELS.find(l=>l.id===OPENING_LEVEL_ID)!;
  const hasNext = campaign?.hasNext ?? !!next;
  const advance = campaign ? campaign.onNext : () => next ? onNext(next) : onBack();
  const nextLabel = campaign ? 'Next level →' : 'Next mechanic →';
  const winTitle: Record<LabId,string> = {
    trace:'Fragment traced', crush:'Codons collected', assembly:'Fragment assembled',
    mutation:'Mismatches repaired', connections:'Strands connected', restriction:'Fragment isolated',
  };
  // Lab connections are an abstract routing exercise: their complete pair sequences
  // are in the labels, whereas campaign endpoints encode the exact two-base fragment.
  const extracted = state.won ? !campaign && id==='connections'
    ? spec.CONNECTION_PAIRS.map(p=>p.seq).join('') : labExtractedSequence(state) : null;
  const closeWin = () => setSession(prev=>({...prev,celebration:null}));
  const popup = state.won && winReady && session.celebration && extracted !== null &&
    <WinCard def={winDef} mechanic={{title:winTitle[id],sequence:extracted,practice:!campaign,nextLabel}}
      moves={state.moves} powersUsed={0} newBases={session.celebration.newBases}
      replayed={session.celebration.replayed} assembled={session.celebration.assembled && !!campaign?.assembled}
      assembledBases={campaign?.covered ?? 0} cdsLength={INS.cdsLength} reducedMotion={reducedMotion}
      hasNext={hasNext} onNext={advance} onMap={onBack} onCard={campaign?.onCard ?? onBack} onClose={closeWin} />;
  const solved = state.won && winReady && !session.celebration &&
    <SolvedBanner def={winDef} moves={state.moves} unranked pulse={false} hasNext={hasNext}
      nextLabel={nextLabel} mapLabel={campaign?'Level map':'Lab menu'} onReplay={reset} onNext={advance} onMap={onBack} />;
  // Tracing uses exactly the same screen chrome as a classic sliding level.
  // Only the board interaction and the reference-progress feedback differ.
  if (id === 'trace') return <>
    <TargetShell reserveHeight defId={campaign?.stage.id ?? 'lab-trace'} label="Target sequence" solved={state.won} committedKey={String(state.trace.length)}>
      <div className="row-between small">
        <span className="target-title">DNA Tracing</span>
        <span className="muted" data-testid="mixed-range">{campaign ? 'INS CDS ' + (campaign.stage.start + 1) + '–' + campaign.stage.end + ' · ' + TRACE_TARGET.length + ' bp' : 'INS · practice'}</span>
      </div>
      <div className="clue-stack mode-sequence">
        <div className="clue-part"><b className="badge">1</b><div className="clue-tokens">
          {[...TRACE_TARGET].map((b,i)=><span key={i} className={'strip-cell b-'+b+(i<state.trace.length?' ok':'')} data-clue-unit="" data-clue-done={String(i<state.trace.length)} data-clue-index={i+1} data-testid={i===0?'target-strip':undefined}>{b}</span>)}
        </div></div>
      </div>
    </TargetShell>
    <div className="board-stage">
      {board}
      {solved}
    </div>
    <div className="under-board" data-testid="under-board">
      <div className="row-between small meta"><span data-testid="moves">{state.moves} {state.moves===1?'move':'moves'}</span><span className="muted" data-testid="lab-progress">{progress}</span>{campaign&&<span className="muted" data-testid="mixed-coverage">{campaign.covered}/333 bp assembled</span>}</div>
      {!state.won && <PowerTray energy={0} powersEnabled={false} freeUses={[]} locks={[]} scaffold={null} active={null} disabled={false} highlightRelease={false} onPick={()=>undefined} onRelease={()=>undefined} canUndo={session.history.length>0} canRestart={state.moves>0} onUndo={undo} hintEnabled={hint} onHint={toggleHint} onRestart={reset} />}
      {hint&&!state.won&&<p className="lab-hint small" role="status">{labHint(state)}</p>}
      <span className="trace-status muted small" role="status" data-testid="lab-message">{session.message || 'Trace the reference in order.'}</span>
      {!campaign && <button type="button" className="trace-lab-back" onClick={onBack}>Back to Mechanics Lab</button>}
    </div>
    {popup}
  </>;
  return <section className="mechanics-play" data-testid="mechanics-play">
    <div className="mechanic-heading"><button type="button" onClick={onBack} aria-label={campaign ? "Back to level map" : "Back to Mechanics Lab"}>{campaign ? "← Map" : "← Lab"}</button><div><h2 className="gene">{meta.title}</h2><span className="muted tiny">{campaign ? 'CDS ' + (campaign.stage.start + 1) + '–' + campaign.stage.end : 'CHALLENGE ' + (index + 1) + '/6 · INS'}</span></div></div>
    {id !== 'mutation' && <p className="mechanic-instructions">{campaign && id === 'restriction' ? 'BsaI cuts at the marked bonds outside its recognition sites. Isolate the reference fragment; synthetic adapters and the decoy do not count.' : meta.instructions}</p>}
    {campaign && <div className="mixed-coverage"><span data-testid="mixed-range">INS CDS {campaign.stage.start + 1}–{campaign.stage.end} · {campaign.stage.sequence.length} bp</span><span data-testid="mixed-coverage">{campaign.covered}/333 bp assembled</span></div>}
    <div className="mechanic-target">
      <div className="row-between"><b className="small">{id === 'crush' ? 'Next codon' : 'Objective'}</b><span className="small muted" data-testid="lab-progress">{progress}</span></div>
      {id === 'crush' && <div className="lab-codons">{CRUSH_TARGETS.map((c, i) => <span key={i} className={i < state.collected ? 'done' : i === state.collected ? 'current' : ''}>{c}</span>)}</div>}
      {id === 'assembly' && <><div className="small muted">Reference sequence · 5′ → 3′</div><div className="lab-sequence assembly-reference" data-testid="assembly-reference">{[...ASSEMBLY_TARGET].map((b, i) => <span key={i} className={'b-' + b + (state.board[ASSEMBLY_CELLS[i]!] === b ? ' assembled-match' : '')} aria-label={'Slot ' + (i + 1) + ': ' + b}>{b}<small>{i + 1}</small></span>)}</div></>}
      {id === 'mutation' && <div className="mutation-reference" data-testid="mutation-reference" role="group" aria-label="Target complementary strands, 3 prime to 5 prime">
        {MUTATION_ROWS.map(({ bottom, seq }) => {
          const row = Math.floor(bottom / 9) + 1;
          return <div className="mutation-reference-row" key={bottom}>
            <span className="mutation-row-label">Row {row}</span>
            {[...seq].map((_, i) => {
              const cell = bottom + i, want = mutationExpected(cell)!;
              const ok = state.board[cell] === want;
              return <span key={cell} className={'mutation-target-base b-' + want + (ok ? ' matched' : ' mismatch') + (selected === cell ? ' selected' : '')} data-testid={'mutation-target-' + cell} aria-label={'Row ' + row + ', column ' + (cell % 9 + 1) + ': target ' + want + ', ' + (ok ? 'correct' : 'needs repair')}>{want}</span>;
            })}
          </div>;
        })}
      </div>}
      {id === 'connections' && <div className="lab-codons">{CONNECTION_PAIRS.map((p, i) => <span key={i} style={{ borderColor: pathColors[i], background: pathFills[i] }}>{i + 1}: {p.seq} ↔ {reverseComplement(p.seq)}</span>)}</div>}
      {id === 'restriction' && <div className="mono small restriction-target" data-testid="restriction-target" aria-label={'Target sequence: ' + target}>{[...target].map((b, i) => <span key={i} className={'restriction-target-base b-' + b} data-base={b}>{b}</span>)}</div>}
    </div>
    <div className="lab-board-stage">{board}{solved}</div>
    {id === 'mutation' && selected !== null && <p className="small mutation-selection" data-testid="mutation-selection">Row {Math.floor(selected / 9) + 1}, column {selected % 9 + 1} · Current {state.board[selected]} → Target {mutationExpected(selected)}</p>}
    {id === 'mutation' && <div className="lab-base-picker" aria-label="Choose replacement base">{(['A','C','G','T'] as DNA[]).map(b => <button type="button" className={'b-' + b} key={b} disabled={selected === null || state.won} onClick={() => { if (selected !== null) dispatch({ type: 'edit', cell: selected, base: b }); }} data-testid={'lab-base-' + b}>{b}</button>)}</div>}
    {!state.won && <div className="lab-controls"><button type="button" onClick={undo} disabled={busy || !session.history.length}>Undo</button><button type="button" className={hint ? 'primary' : ''} aria-pressed={hint} onClick={toggleHint}>Hint</button><button type="button" onClick={reset} disabled={busy}>Replay</button></div>}
    {!campaign && state.won && !session.celebration && id!=='trace' && <button type="button" onClick={undo} disabled={!session.history.length}>Undo</button>}
    {hint && !state.won && <p className="lab-hint small" role="status">{labHint(state)}</p>}
    <p className="lab-message small" role="status" data-testid="lab-message">{session.message || 'Ready.'}</p>
    {popup}
    <p className="muted tiny">{campaign && id === 'restriction' ? 'BsaI recognizes GGTCTC and cuts outside that motif; the synthetic adapters are not credited.' : meta.biology} Reference: {LAB_REFERENCE.symbol} · {LAB_REFERENCE.transcript}.</p>
  </section>;
}
