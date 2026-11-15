import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { applyLab, createLab, labHint, traceHintCell, connectionHint, findCrushSwap, LAB_IDS, LAB_META, DEFAULT_LAB_SPEC, mutationExpected as expectedMutation, mutationCount as countMutations, reverseComplement, adjacent, labDecode,labLabel,labReplacementOptions, type LabResult, type LabId, type LabState, type LabAction } from '../engine/mechanicsLab.ts';
import { TargetShell } from './TargetPanel.tsx';
import { PowerTray } from './PowerTray.tsx';
import { WinCard } from './WinCard.tsx';
import { SolvedBanner } from './SolvedBanner.tsx';
import { ALL_LEVELS, OPENING_LEVEL_ID } from '../campaign/campaign.ts';
import { GENES, INS } from '../genomics/genes.ts';
import type { LevelDefinition } from '../engine/types.ts';
import { Barcode,SeqLetters,TokenFace,tierClass,tokenStyle } from './TokenFace.tsx';
import { labExtractedSequence } from '../engine/mechanicsLab.ts';
import { type MixedStage } from '../campaign/mixed.ts';
import { playCue, prepareFeedback, type FeedbackOptions } from './feedback.ts';

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
type CrushAnimation = { a: number; b: number; stage: 'swap' | 'return' | 'clear' | 'fall'; frame: number; result: LabResult; action: LabAction; credit: WinCredit };
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
  stage: MixedStage; seedTrace: boolean; initialActions: readonly LabAction[]; part: number; of: number; covered: number;
  assembled: boolean; onProgress: (actions: readonly LabAction[], state: LabState) => void; onNext: () => void;
}
interface BonusPlay { stage: MixedStage; label:string; hasNext:boolean; completed:boolean; onComplete:(state:LabState)=>void; onNext:()=>void }
export function MechanicsPlay({ id, onBack, onNext, reducedMotion, feedback, campaign, bonus, hintMode, onHintModeChange }: { id: LabId; onBack: () => void; onNext: (id: LabId) => void; reducedMotion: boolean; feedback: FeedbackOptions; campaign?: CampaignPlay; bonus?: BonusPlay; hintMode?: boolean | null; onHintModeChange?: (enabled: boolean) => void }) {
  const meta = LAB_META[id];
  const spec = campaign?.stage.spec ?? bonus?.stage.spec ?? DEFAULT_LAB_SPEC;
  const gene=campaign?GENES[campaign.def.symbol]!:INS;
  const tokenDef=spec.tokens&&(campaign||bonus)?{...(campaign?.def??ALL_LEVELS[0]!),tokens:spec.tokens}:null;
  const face=(b:string)=>spec.tokens?.[b]?<TokenFace seq={labDecode(spec,b)} label={labLabel(spec,b)}/>:b==='·'?'':b;
  const chipClass=(b:string)=>spec.tokens?.[b]?'lab-token tok '+tierClass(labDecode(spec,b).length):'b-'+b;
  const chipStyle=(b:string)=>tokenDef?tokenStyle(tokenDef,b):undefined;
  const { TRACE_TARGET, CRUSH_TARGETS, READ_CELLS, ASSEMBLY_CELLS, ASSEMBLY_TARGET, MUTATION_ROWS, CONNECTION_PAIRS, CUT_STRANDS, CUT_SITES, CUT_TARGET } = spec;
  const readAt = (c: number) => READ_CELLS.findIndex(row => row.includes(c));
  const endAt = (c: number) => CONNECTION_PAIRS.findIndex(p => p.start === c || p.end === c);
  const startAt = (c: number) => CONNECTION_PAIRS.findIndex(p => p.start === c);
  const mutationExpected = (c: number) => expectedMutation(c, spec);
  const mutationCount = (board: readonly string[]) => countMutations(board, spec);
  const [session, setSession] = useState<Session>(() => {
    const initial: Session = { state: createLab(id, spec, campaign?.seedTrace ?? true), history: [], actions: [], message: '', celebration: null };
    return (campaign?.initialActions ?? []).reduce((prev, action) => acceptResult(prev, applyLab(prev.state, action), action), initial);
  });
  // The latest committed session is available to rapid pointer events before React rerenders.
  // Feedback stays outside state updaters, so StrictMode and saved-action replay cannot duplicate it.
  const sessionRef = useRef(session);
  const updateSession = useCallback((next: Session) => { sessionRef.current = next; setSession(next); }, []);
  const [selected, setSelected] = useState<number | null>(null);
  const [localHint, setHint] = useState(false);
  const hint = campaign || bonus ? hintMode === true : localHint;
  const toggleHint = () => { if ((campaign || bonus) && onHintModeChange) onHintModeChange(!hint); else setHint(v => !v); };
  const gesture = useRef<{ pointer: number; start: number; last: number; pair: number; read: number; x: number; y: number; pitch: number } | null>(null);
  const [crushDrag, setCrushDrag] = useState<CrushDrag | null>(null);
  const [crushAnimation, setCrushAnimation] = useState<CrushAnimation | null>(null);
  const busy = crushAnimation !== null;
  const { state } = session;
  const traceHint = id === 'trace' && hint ? traceHintCell(state) : null;
  const routeHint = id === 'connections' && hint ? connectionHint(state, selected) : null;
  const crushHint = id === 'crush' && hint && !busy && !crushDrag ? findCrushSwap(state) : null;
  const crushRecovery = id === 'crush' && hint && !busy && !crushDrag && !state.won && !crushHint && session.history.length > 0;
  // Prefer the selected read if it can be corrected; otherwise guide the next legal placement.
  const assemblyCandidates = id === 'assembly' && hint && !state.won
    ? spec.READ_STARTS.map((offset, read) => ({ read, offset })).filter(({read, offset}) =>
        state.placements[read] !== offset && applyLab(state, {type:'place', read, offset}).state !== state)
    : [];
  const assemblyHint = assemblyCandidates.find(candidate => candidate.read === selected) ?? assemblyCandidates[0];
  const assemblyRecovery = id === 'assembly' && hint && !state.won && !assemblyHint && session.history.length > 0;
  const mutationMismatch = (c: number) => {
    const want = mutationExpected(c);
    return want !== null && state.board[c] !== want;
  };
  // Hint mode selects a real mismatch, not a stale repaired cell. An explicitly
  // selected mismatch takes priority; otherwise advance to the first remaining one.
  const firstMismatch = id === 'mutation' && hint && !state.won ? state.board.findIndex((_,c) => mutationMismatch(c)) : -1;
  const mutationHint = firstMismatch < 0 ? null : selected !== null && mutationMismatch(selected) ? selected : firstMismatch;
  const mutationSelection = id === 'mutation' ? mutationHint ?? selected : null;
  const mutationHintBase = mutationHint === null ? null : mutationExpected(mutationHint);
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
    replayed: campaign?.completed ?? bonus?.completed ?? false,
    assembled: !!campaign && !campaign.assembled && !campaign.completed && campaign.covered + campaign.stage.sequence.length === gene.cdsLength,
  };
  const onProgress = campaign?.onProgress;
  useEffect(() => { onProgress?.(session.actions, state); }, [onProgress, session.actions, state]);
  const onBonusComplete=bonus?.onComplete;
  useEffect(()=>{if(state.won)onBonusComplete?.(state);},[onBonusComplete,state]);
  const boardRef = useRef<HTMLDivElement>(null);
  const commitResult = useCallback((result: LabResult, action: LabAction, earned: WinCredit) => {
    const prev = sessionRef.current;
    if (prev.state.won) return;
    updateSession(acceptResult(prev, result, action, earned));
    if (result.state !== prev.state) playCue(result.state.won ? 'win' : 'move', feedback);
    else if (result.message) playCue('reject', feedback);
  }, [feedback, updateSession]);
  const dispatch = (action: LabAction) => {
    commitResult(applyLab(sessionRef.current.state, action), action, credit);
  };
  // Only presentation is delayed. Commit the exact engine result once, after the final frame.
  useEffect(() => {
    if (!crushAnimation) return;
    const { stage, result, action, credit } = crushAnimation;
    const timer = window.setTimeout(() => {
      if (stage === 'swap') setCrushAnimation({ ...crushAnimation, stage: result.crush ? 'clear' : 'return' });
      else if (stage === 'clear') setCrushAnimation({ ...crushAnimation, stage: 'fall' });
      else if (stage === 'fall' && crushAnimation.frame + 1 < (result.crushFrames?.length ?? 0)) setCrushAnimation({ ...crushAnimation, frame: crushAnimation.frame+1, stage:'clear' });
      else {
        commitResult(result, action, credit);
        setCrushAnimation(null);
      }
    }, crushTiming[stage]);
    return () => window.clearTimeout(timer);
  }, [crushAnimation, commitResult]);
  const startCrushSwap = (a: number, b: number) => {
    if (busy || state.won) return;
    setSelected(null);
    setCrushDrag(null);
    const action: LabAction = { type: 'swap', a, b };
    prepareFeedback(feedback);
    const result = applyLab(sessionRef.current.state, action);
    if (!adjacent(a, b) || state.board[b] === '.' || reducedMotion) {
      commitResult(result, action, credit);
      return;
    }
    setCrushAnimation({ a, b, stage: 'swap', frame:0, result, action, credit });
  };
  const animationFrame = crushAnimation?.result.crushFrames?.[crushAnimation.frame];
  const displayBoard = crushAnimation?.stage === 'clear' && animationFrame ? animationFrame.swapped
    : crushAnimation?.stage === 'fall' && animationFrame ? animationFrame.board : state.board;
  const displayCollected = state.collected + (animationFrame && crushAnimation ? crushAnimation.frame + (crushAnimation.stage==='fall'?1:0) : 0);
  const swapMotion = crushAnimation && (crushAnimation.stage === 'swap' || crushAnimation.stage === 'return')
    ? { a: crushAnimation.a, b: crushAnimation.b, fraction: crushAnimation.stage === 'swap' ? 1 : 0 }
    : crushDrag;
  const falling = new Map(crushAnimation?.stage === 'fall' ? animationFrame?.falls.map(f => [f.to, f]) : []);
  const reset = () => { setWinReady(false); setGestureActive(false); updateSession({ state: createLab(id, spec), history: [], actions: [], message: '', celebration: null }); setSelected(null); };
  const undo = () => { setWinReady(false); const prev = sessionRef.current; const last = prev.history.at(-1); if (last) { updateSession({ state: last, history: prev.history.slice(0, -1), actions: prev.actions.slice(0, -1), message: 'Undone.', celebration: null }); playCue('undo', feedback); } setSelected(null); };
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
      else {
        const active = routeHint?.cell === cell ? routeHint.pair : selected;
        if (active !== null) { setSelected(active); dispatch({ type: 'route', pair: active, cell }); }
      }
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
    gesture.current = { pointer: e.pointerId, start: cell, last: cell, pair: pair >= 0 ? pair : routeHint?.cell === cell ? routeHint.pair : selected ?? -1, read, x: e.clientX, y: e.clientY, pitch };
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
    prepareFeedback(feedback);
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
  const progress = id === 'trace' ? state.trace.length + '/' + TRACE_TARGET.length + (spec.tokens?' blocks':' bases')
    : id === 'crush' ? displayCollected + '/' + CRUSH_TARGETS.length + (spec.tokens?' block matches':' codons')
    : id === 'assembly' ? state.placements.filter(p => p >= 0).length + '/3 reads'
    : id === 'mutation' ? mutationCount(state.board) + ' mismatches'
    : id === 'connections' ? state.routes.filter((p, i) => p.at(-1) === CONNECTION_PAIRS[i]!.end).length + '/3 pairs'
    : state.cuts.length + '/2 cuts';
  const board = (
    <div ref={boardRef} className={'mechanics-board mode-lab-' + id + ' board mixed-board' + (id === 'trace' ? ' trace-board' : '')+(spec.tokens?' block-lab-board':'') + (crushDrag ? ' crush-dragging' : '') + (crushAnimation ? ' crush-' + crushAnimation.stage : '')} data-testid="mechanics-board" data-crush-phase={crushDrag ? 'drag' : crushAnimation?.stage ?? 'idle'} data-crush-chain={crushAnimation ? crushAnimation.frame+1 : undefined} aria-busy={busy} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { gesture.current = null; setCrushDrag(null); setGestureActive(false); }} onLostPointerCapture={() => { gesture.current = null; setCrushDrag(null); setGestureActive(false); }}>
      {displayBoard.map((b, c) => {
        if (b === '.') return <div key={c} className={id === 'trace' ? "lab-hole cell hole" : "lab-hole"} data-lab-cell={c} aria-hidden="true" />;
        const pair = endAt(c), read = readAt(c), route = state.routes.findIndex(p => p.includes(c));
        const placedRead = id === 'assembly' && read >= 0 && state.placements[read]! >= 0;
        const chosen = id === 'assembly' ? selected === read && read >= 0 : id === 'connections' ? selected === pair && pair >= 0 : id === 'mutation' ? mutationSelection === c : selected === c;
        const mutationTarget = id === 'mutation' ? mutationExpected(c) : null;
        const isTop = id === 'mutation' && MUTATION_ROWS.some(r => c >= r.top && c < r.top + r.seq.length);
        const moving = !!swapMotion && (c === swapMotion.a || c === swapMotion.b);
        const clear = crushAnimation?.stage === 'clear' && animationFrame?.matched.includes(c);
        const fall = falling.get(c);
        const assemblySource = assemblyHint !== undefined && READ_CELLS[assemblyHint.read]![0] === c;
        const assemblyDestination = assemblyHint !== undefined && ASSEMBLY_CELLS[assemblyHint.offset] === c;
        const classes = ['lab-cell', assemblySource ? 'assembly-hint-source' : '', assemblyDestination ? 'assembly-hint-destination' : '', placedRead ? 'assembly-placed' : '', id === 'trace' ? 'cell tile' : '', traceHint === c ? 'hinted' : '', routeHint?.cell === c ? 'hinted connection-hinted' : '', crushHint?.includes(c) ? 'hinted crush-hinted' : '', mutationHint === c ? 'mutation-hinted' : '', mutationTarget ? (b === mutationTarget ? 'mutation-correct' : 'mutation-mismatch') : '', moving ? 'crush-moving' : '', clear ? 'crush-clearing' : '', fall ? 'crush-falling' : '', fall?.from === null ? 'crush-new' : '', spec.tokens?.[b]?chipClass(b):/^[ACGT]$/.test(b) ? 'b-' + b : '', chosen ? 'selected' : '', state.trace.includes(c) ? 'traced' : '', id === 'trace' && state.trace.slice(0,state.traceStarter).includes(c) ? 'trace-starter' : '', route >= 0 ? 'routed' : '', isTop ? 'reference' : '', id === 'assembly' && ASSEMBLY_CELLS.includes(c) ? 'assembly-slot' : '', id === 'assembly' && ASSEMBLY_CELLS.includes(c) && b === ASSEMBLY_TARGET[c - ASSEMBLY_CELLS[0]!] ? 'assembly-correct' : '', id !== 'crush' && state.fresh.includes(c) ? 'fresh' : '', state.cuts.includes(c) ? 'cut' : ''].filter(Boolean).join(' ');
        const endpoint = id === 'connections' && pair >= 0;
        const connectionColor = id === 'connections' ? (endpoint ? pair : route) : -1;
        const cutSite = id === 'restriction' && CUT_SITES.includes(c);
        const badge = id === 'mutation' && c % 9 === 1 ? (isTop ? 'REF' : 'R' + (Math.floor(c / 9) + 1)) : endpoint ? String(pair + 1) + (CONNECTION_PAIRS[pair]!.start === c ? '→' : '←') : cutSite ? (state.cuts.includes(c) ? '✓' : '✂') : id === 'assembly' && read >= 0 && READ_CELLS[read]![0] === c ? 'R' + (read + 1) : id === 'assembly' && ASSEMBLY_CELLS.includes(c) ? String(c - ASSEMBLY_CELLS[0]! + 1) : '';
        const motionStyle: CSSProperties = { ...chipStyle(b), transform: swapMotion ? swapTransform(c, swapMotion) : undefined, ...(fall ? { '--fall-rows': fall.rows } : {}), ...(routeHint?.cell === c ? { '--connection-hint-color': pathColors[routeHint.pair] } : {}) } as CSSProperties;
        return <button key={c} type="button" className={classes} data-lab-cell={c} data-base={b} data-seq={labDecode(spec,b)} title={spec.tokens?.[b] && labDecode(spec,b).length > 6 ? labDecode(spec,b) : undefined} data-read-placed={id === 'assembly' && read >= 0 ? String(placedRead) : undefined} data-testid={'lab-cell-' + c} aria-label={'Row ' + (Math.floor(c / 9) + 1) + ' column ' + (c % 9 + 1) + ': ' + (b === '·' ? 'empty' : labDecode(spec,b)) + (badge ? ', ' + badge : '') + (traceHint === c ? ', suggested next move' : '') + (routeHint?.cell === c ? ', suggested move for pair ' + (routeHint.pair + 1) : '') + (crushHint?.includes(c) ? ', suggested swap tile' : '') + (id === 'trace' && state.trace.slice(0,state.traceStarter).includes(c) ? ', starter base' : '') + (mutationHint === c ? ', suggested repair' : '') + (assemblySource ? ', suggested read to select' : '') + (assemblyDestination ? ', suggested destination slot' : '') + (placedRead ? ', read ' + (read + 1) + ' placed at slot ' + (state.placements[read]! + 1) : '')} aria-pressed={chosen} disabled={state.won && !gestureActive} onClick={e => { if (e.detail === 0) choose(c); }} data-connection-pair={connectionColor >= 0 ? connectionColor + 1 : undefined} style={connectionColor >= 0 && !spec.tokens?.[b] ? { ...motionStyle, borderColor: pathColors[connectionColor], background: pathFills[connectionColor] } : motionStyle}>
          {spec.tokens?.[b]?face(b):<span className={id === 'trace' ? 'letter' : undefined}>{b === '·' ? '' : b}</span>}{badge && <small style={connectionColor >= 0 && spec.tokens?.[b] ? { color: pathColors[connectionColor] } : undefined}>{badge}</small>}
        </button>;
      })}
      <svg className="lab-lines" viewBox="0 0 9 9" aria-hidden="true">
        {crushHint && <g className="crush-hint-arrow" data-testid="crush-hint-arrow" transform={'translate('+((crushHint[0]%9+crushHint[1]%9+1)/2)+' '+((Math.floor(crushHint[0]/9)+Math.floor(crushHint[1]/9)+1)/2)+') rotate('+(crushHint[1]-crushHint[0]===9?90:0)+')'}>
          <rect x="-.34" y="-.23" width=".68" height=".46" rx=".10" />
          <path d="M -.23 0 H .23 M -.23 0 L -.10 -.12 M -.23 0 L -.10 .12 M .23 0 L .10 -.12 M .23 0 L .10 .12" />
        </g>}
        {id === 'trace' && state.trace.length > 1 && <polyline data-testid="trace-path" points={pathPoints(state.trace)} stroke="#2b5f9e" />}
        {id === 'connections' && state.routes.map((p, i) => p.length > 1 && <polyline key={i} points={pathPoints(p)} stroke={pathColors[i]} />)}
        {id === 'restriction' && CUT_STRANDS.map((strand, s) => strand.slice(0, -1).map((c, i) => !state.cuts.includes(c) && <polyline key={s + ':' + c} points={pathPoints([c, strand[i + 1]!])} stroke="#52524e" className="cut-line" />))}
      </svg>
    </div>
  );
  const winDef = campaign?.def ?? ALL_LEVELS.find(l=>l.id===OPENING_LEVEL_ID)!;
  const hasNext = bonus ? bonus.hasNext : campaign?.hasNext ?? !!next;
  const advance = bonus ? bonus.onNext : campaign ? campaign.onNext : () => next ? onNext(next) : onBack();
  const nextLabel = campaign || bonus ? 'Next level →' : 'Next mechanic →';
  const winTitle: Record<LabId,string> = {
    trace:'Fragment traced', crush:'Codons collected', assembly:'Fragment assembled',
    mutation:'Mismatches repaired', connections:'Strands connected', restriction:'Fragment isolated',
  };
  // Lab connections are an abstract routing exercise: their complete pair sequences
  // are in the labels, whereas campaign endpoints encode the exact two-base fragment.
  const extracted = state.won ? !campaign && !bonus && id==='connections'
    ? spec.CONNECTION_PAIRS.map(p=>p.seq).join('') : labExtractedSequence(state) : null;
  const closeWin = () => updateSession({...sessionRef.current,celebration:null});
  const bonusPopup=bonus && state.won && winReady && session.celebration && extracted!==null && <div className="overlay win-overlay" role="dialog" aria-modal="true" aria-labelledby="bonus-win-title" data-testid="bonus-win"><div className="card win-card"><div className="card-head"><div className="card-head-copy"><p className="muted small">{bonus.label} · REFERENCE FRAGMENT COMPLETE</p><h3 id="bonus-win-title">{winTitle[id]}</h3></div><button type="button" className="win-close" onClick={closeWin} aria-label="Close and view board">×</button></div><p className="mono small" style={{overflowWrap:'anywhere'}}>{extracted}</p><p className="muted small">Reference fragment verified. {bonus.hasNext?'Continue assembling this region.':'Region fully assembled.'}</p><div className="card-actions"><button type="button" onClick={onBack}>Bonus map</button>{hasNext&&<button type="button" className="primary" onClick={advance}>Continue assembly →</button>}</div></div></div>;
  const popup = !bonus && state.won && winReady && session.celebration && extracted !== null &&
    <WinCard def={winDef} mechanic={{title:winTitle[id],sequence:extracted,practice:!campaign,nextLabel,...(campaign?{range:{start:campaign.stage.start,end:campaign.stage.end}}:{})}}
      moves={state.moves} powersUsed={0} newBases={session.celebration.newBases}
      replayed={session.celebration.replayed} assembled={session.celebration.assembled && !!campaign?.assembled}
      assembledBases={campaign?.covered ?? 0} cdsLength={gene.cdsLength} reducedMotion={reducedMotion}
      hasNext={hasNext} onNext={advance} onMap={onBack} onCard={campaign?.onCard ?? onBack} onClose={closeWin} />;
  const solved = state.won && winReady && !session.celebration &&
    <SolvedBanner def={winDef} moves={state.moves} unranked pulse={false} hasNext={hasNext}
      nextLabel={nextLabel} mapLabel={bonus?'Bonus map':campaign?'Level map':'Lab menu'} onReplay={reset} onNext={advance} onMap={onBack} />;
  // All mechanics use the same play-screen chrome as the traditional sliding puzzle.
  // The target content, game board and mechanic-specific inputs remain independent.
  const targetLength = bonus?.stage.sequence.length ?? campaign?.stage.sequence.length ?? (
    id==='trace'?TRACE_TARGET.length : id==='crush'?CRUSH_TARGETS.join('').length :
    id==='assembly'?ASSEMBLY_TARGET.length : id==='mutation'?MUTATION_ROWS.map(r=>r.seq).join('').length :
    id==='connections'?CONNECTION_PAIRS.map(p=>p.seq).join('').length : CUT_TARGET.length);
  return <>
    <TargetShell longClues={id==='mutation'||Object.values(spec.tokens??{}).some(t=>t.seq.length>6)} reserveHeight hideCompleted={id==='crush'} defId={bonus?.stage.id ?? campaign?.stage.id ?? 'lab-'+id} label={id==='crush'?'Target codons':'Target sequence'} solved={state.won} committedKey={id==='crush'?String(displayCollected):String(state.moves)}>
      <div className="row-between small">
        <span className="target-title">{meta.title}</span>
        <span className="muted" data-testid="mixed-range">{bonus ? bonus.label+' · '+targetLength+' bp reference fragment'+(spec.blockSize?' · '+spec.blockSize+'-base blocks':'') : campaign ? gene.symbol+' CDS ' + (campaign.stage.start + 1) + '–' + campaign.stage.end + ' · ' + targetLength + ' bp'+(spec.blockSize?' · '+spec.blockSize+'-base blocks':'') : 'INS · practice'}</span>
      </div>
      {id==='trace' && <div className="clue-stack mode-sequence">
        <div className="clue-part"><b className="badge">1</b><div className="clue-tokens">
          {[...TRACE_TARGET].map((b,i)=><span key={i} className={'strip-cell '+chipClass(b)+(i<state.trace.length?' ok':'')} style={chipStyle(b)} title={labDecode(spec,b)} data-clue-unit="" data-clue-done={String(i<state.trace.length)} data-clue-index={i+1} data-testid={i===0?'target-strip':undefined}>{face(b)}</span>)}
        </div></div>
      </div>}
      {id === 'crush' && <div className={"clue-stack mode-sequence mixed-codon-clues"+(CRUSH_TARGETS.length>6?" long-codon-clues":"")}>{CRUSH_TARGETS.map((c, i) => <div key={i} className="clue-part" data-clue-unit="" data-clue-done={String(i<displayCollected)}><b className="badge">{i+1}</b><div className="clue-tokens">{[...c].map((b,j)=><span key={j} className={'strip-cell '+chipClass(b)+(i<displayCollected?' ok':'')+(i===displayCollected?' current-codon':'')} style={chipStyle(b)} title={labDecode(spec,b)}>{face(b)}</span>)}</div></div>)}</div>}
      {id === 'assembly' && <><div className={'lab-sequence assembly-reference mixed-clues'+(spec.tokens?' block-reference':'')} data-testid="assembly-reference">{[...ASSEMBLY_TARGET].map((b, i) => <span key={i} className={chipClass(b)+(state.board[ASSEMBLY_CELLS[i]!] === b ? ' assembled-match' : '')} style={chipStyle(b)} data-clue-unit="" data-clue-done={String(state.board[ASSEMBLY_CELLS[i]!] === b)} title={spec.tokens?.[b] ? labDecode(spec,b) : undefined} aria-label={'Slot ' + (i + 1) + ': ' + labDecode(spec,b)}>{spec.tokens?.[b] && labDecode(spec,b).length <= 6 ? <><span className="chip-label"><SeqLetters seq={labDecode(spec,b)} /></span>{labDecode(spec,b).length > 3 && <Barcode seq={labDecode(spec,b)} />}</> : face(b)}<small>{i + 1}</small></span>)}</div></>}
      {id === 'mutation' && <div className="mutation-reference mixed-clues" data-testid="mutation-reference" role="group" aria-label="Target complementary strands, 3 prime to 5 prime">
        {MUTATION_ROWS.map(({ bottom, seq }) => {
          const row = Math.floor(bottom / 9) + 1;
          return <div className="mutation-reference-row" key={bottom} data-clue-unit="" data-clue-done={String([...seq].every((_,i)=>state.board[bottom+i]===mutationExpected(bottom+i)))}>
            <span className="mutation-row-label">Row {row}</span>
            {[...seq].map((_, i) => {
              const cell = bottom + i, want = mutationExpected(cell)!;
              const ok = state.board[cell] === want;
              return <span key={cell} className={'mutation-target-base '+chipClass(want)+(ok ? ' matched' : ' mismatch') + (mutationSelection === cell ? ' selected' : '')} data-testid={'mutation-target-' + cell} data-symbol={want} style={chipStyle(want)} aria-label={'Row ' + row + ', column ' + (cell % 9 + 1) + ': target ' + labDecode(spec,want) + ', ' + (ok ? 'correct' : 'needs repair')}>{face(want)}</span>;
            })}
          </div>;
        })}
      </div>}
      {id === 'connections' && <div className="clue-stack mixed-connection-clues" data-testid="connection-target">{CONNECTION_PAIRS.map((p,i)=>{
        const done=state.routes[i]!.at(-1)===p.end;
        return <div key={i} className="clue-part connection-clue" data-clue-unit="" data-clue-done={String(done)}>
          <b className="badge" style={{background:pathColors[i]}}>{i+1}</b>
          <span className={'connection-pair'+(done?' ok':'')} style={{borderColor:pathColors[i],background:pathFills[i]}}>{spec.tokens?<><span className={chipClass(p.seq)} style={chipStyle(p.seq)}>{face(p.seq)}</span> ↔ <span className={chipClass(p.complement!)} style={chipStyle(p.complement!)}>{face(p.complement!)}</span></>:<>{p.seq} ↔ {reverseComplement(p.seq)}</>}</span>
        </div>;
      })}</div>}
      {id === 'restriction' && <div className="mono small restriction-target mixed-clues" data-testid="restriction-target" aria-label={'Target sequence: ' + labDecode(spec,CUT_TARGET)}>{[...CUT_TARGET].map((b, i) => <span key={i} className={'restriction-target-base '+chipClass(b)} style={chipStyle(b)} data-base={b} data-clue-unit="" data-clue-done={String(state.won)}>{face(b)}</span>)}</div>}
    </TargetShell>
    <div className="board-stage">
      {board}
      {solved}
    </div>
    <div className={'under-board mixed-under-board'+(crushRecovery||assemblyRecovery?' crush-hint-recovery':'')} data-testid="under-board">
      <div className="row-between small meta"><span data-testid="moves">{state.moves} {state.moves===1?'move':'moves'}</span><span className="muted" data-testid="lab-progress">{progress}</span>{campaign&&<span className="muted" data-testid="mixed-coverage">{campaign.covered}/{gene.cdsLength} bp assembled</span>}</div>
      {id==='mutation' && !state.won && <div className="base-picker lab-base-picker" aria-label="Choose replacement base">{labReplacementOptions(spec,mutationSelection??spec.MUTATIONS[0]??-1).map(b=><button type="button" style={chipStyle(b)} className={chipClass(b)+(mutationHintBase===b?' mutation-base-hinted':'')} key={b} disabled={mutationSelection===null} aria-label={'Replace with '+labDecode(spec,b)+(mutationHintBase===b?', suggested correction':'')} onClick={()=>{if(mutationSelection!==null) dispatch({type:'edit',cell:mutationSelection,base:b});}} data-testid={'lab-base-'+b}>{face(b)}</button>)}</div>}
      {!state.won && <PowerTray energy={0} powersEnabled={false} freeUses={[]} locks={[]} scaffold={null} active={null} disabled={busy} highlightRelease={false} onPick={()=>undefined} onRelease={()=>undefined} canUndo={session.history.length>0} canRestart={state.moves>0} onUndo={undo} hintEnabled={hint} onHint={toggleHint} onRestart={reset} />}
      {!campaign && !bonus && state.won && !session.celebration && <button type="button" onClick={undo} disabled={!session.history.length}>Undo</button>}
      {id!=='trace'&&id!=='mutation'&&id!=='connections'&&id!=='crush'&&id!=='assembly'&&hint&&!state.won&&<p className="lab-hint small" role="status">{labHint(state)}</p>}
      {id!=='trace' && id!=='mutation' && id!=='crush' && id!=='assembly' && <span className="trace-status muted small" role="status" data-testid="lab-message">{session.message || 'Ready.'}</span>}
      {!campaign && !bonus && <button type="button" className="trace-lab-back" onClick={onBack}>Back to Mechanics Lab</button>}
    </div>
    {popup}
    {bonusPopup}
  </>;
}
