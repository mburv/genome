import { useRef, useState, type PointerEvent } from 'react';
import { applyLab, createLab, labHint, LAB_IDS, LAB_META, LAB_REFERENCE, TRACE_TARGET, CRUSH_TARGETS, READ_CELLS, ASSEMBLY_CELLS, MUTATION_ROWS, mutationExpected, mutationCount, CONNECTION_PAIRS, CUT_STRANDS, CUT_SITES, CUT_TARGET, reverseComplement, type LabId, type LabState, type LabAction, type DNA } from '../engine/mechanicsLab.ts';

export function MechanicsMenu({ onPlay, onBack }: { onPlay: (id: LabId) => void; onBack: () => void }) {
  return <section className="mechanics-menu" data-testid="mechanics-menu">
    <div className="row-between"><h2 className="gene">Mechanics Lab</h2><button type="button" onClick={onBack}>Map</button></div>
    <p className="muted small">Six experimental puzzle types. All use a 9×9 board and reference DNA. Practice only; your gene campaign is unchanged.</p>
    {LAB_IDS.map((id, i) => <button type="button" key={id} className="mechanic-entry" onClick={() => onPlay(id)} data-testid={'mechanic-' + id}>
      <span className="mechanic-icon">{LAB_META[id].icon}</span><span><b>{i + 1}. {LAB_META[id].title}</b><small>{LAB_META[id].short}</small></span><span aria-hidden="true">→</span>
    </button>)}
  </section>;
}

const cellPoint = (c: number): [number, number] => [c % 9 + .5, Math.floor(c / 9) + .5];
const pathPoints = (path: readonly number[]): string => path.map(c => cellPoint(c).join(',')).join(' ');
const pathColors = ['#2a6e4f', '#2b5f9e', '#8c5a10'];
const readAt = (c: number) => READ_CELLS.findIndex(row => row.includes(c));
const endAt = (c: number) => CONNECTION_PAIRS.findIndex(p => p.start === c || p.end === c);
const startAt = (c: number) => CONNECTION_PAIRS.findIndex(p => p.start === c);
type Session = { state: LabState; history: LabState[]; message: string };

export function MechanicsPlay({ id, onBack, onNext }: { id: LabId; onBack: () => void; onNext: (id: LabId) => void }) {
  const meta = LAB_META[id];
  const [session, setSession] = useState<Session>(() => ({ state: createLab(id), history: [], message: '' }));
  const [selected, setSelected] = useState<number | null>(null);
  const [hint, setHint] = useState(false);
  const gesture = useRef<{ pointer: number; start: number; last: number; pair: number; read: number; swapped: boolean } | null>(null);
  const { state } = session;
  const boardRef = useRef<HTMLDivElement>(null);
  const dispatch = (action: LabAction) => setSession(prev => {
    const result = applyLab(prev.state, action);
    return { state: result.state, history: result.state === prev.state ? prev.history : [...prev.history, prev.state], message: result.message || prev.message };
  });
  const reset = () => { setSession({ state: createLab(id), history: [], message: '' }); setSelected(null); };
  const undo = () => { setSession(prev => { const last = prev.history.at(-1); return last ? { state: last, history: prev.history.slice(0, -1), message: 'Undone.' } : prev; }); setSelected(null); };
  const choose = (cell: number) => {
    if (state.won || state.board[cell] === '.') return;
    if (id === 'trace') dispatch({ type: 'trace', cell });
    else if (id === 'crush') {
      if (selected === null || selected === cell) setSelected(selected === cell ? null : cell);
      else { dispatch({ type: 'swap', a: selected, b: cell }); setSelected(null); }
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
    if (state.won || e.button !== 0 || gesture.current) return;
    const cell = cellFromPoint(e);
    if (cell === null || state.board[cell] === '.') return;
    const pair = startAt(cell);
    const read = readAt(cell);
    gesture.current = { pointer: e.pointerId, start: cell, last: cell, pair: pair >= 0 ? pair : selected ?? -1, read, swapped: id === 'crush' && selected !== null && selected !== cell };
    e.currentTarget.setPointerCapture(e.pointerId);
    choose(cell);
  };
  const pointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId || state.won) return;
    const cell = cellFromPoint(e);
    if (cell === null || cell === g.last || state.board[cell] === '.') return;
    g.last = cell;
    if (id === 'trace') dispatch({ type: 'trace', cell });
    else if (id === 'connections' && g.pair >= 0) dispatch({ type: 'route', pair: g.pair, cell });
    else if (id === 'crush' && !g.swapped) { dispatch({ type: 'swap', a: g.start, b: cell }); setSelected(null); g.swapped = true; }
  };
  const pointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    const cell = cellFromPoint(e);
    if (id === 'assembly' && g.read >= 0 && cell !== null && ASSEMBLY_CELLS.includes(cell)) dispatch({ type: 'place', read: g.read, offset: cell - ASSEMBLY_CELLS[0]! });
    gesture.current = null;
  };
  const index = LAB_IDS.indexOf(id);
  const next = LAB_IDS[index + 1];
  const target = id === 'trace' ? TRACE_TARGET : id === 'crush' ? CRUSH_TARGETS.join(' ') : id === 'restriction' ? CUT_TARGET : '';
  const progress = id === 'trace' ? state.trace.length + '/' + TRACE_TARGET.length + ' bases'
    : id === 'crush' ? state.collected + '/' + CRUSH_TARGETS.length + ' codons'
    : id === 'assembly' ? state.placements.filter(p => p >= 0).length + '/3 reads'
    : id === 'mutation' ? mutationCount(state.board) + ' mismatches'
    : id === 'connections' ? state.routes.filter((p, i) => p.at(-1) === CONNECTION_PAIRS[i]!.end).length + '/3 pairs'
    : state.cuts.length + '/2 cuts';
  return <section className="mechanics-play" data-testid="mechanics-play">
    <div className="mechanic-heading"><button type="button" onClick={onBack} aria-label="Back to Mechanics Lab">← Lab</button><div><h2 className="gene">{meta.title}</h2><span className="muted tiny">CHALLENGE {index + 1}/6 · INS</span></div></div>
    <p className="mechanic-instructions">{meta.instructions}</p>
    <div className="mechanic-target">
      <div className="row-between"><b className="small">{id === 'crush' ? 'Next codon' : 'Objective'}</b><span className="small muted" data-testid="lab-progress">{progress}</span></div>
      {id === 'trace' && <div className="lab-sequence">{[...target].map((b, i) => <span key={i} className={'b-' + b + (i < state.trace.length ? ' done' : '')}>{b}</span>)}</div>}
      {id === 'crush' && <div className="lab-codons">{CRUSH_TARGETS.map((c, i) => <span key={i} className={i < state.collected ? 'done' : i === state.collected ? 'current' : ''}>{c}</span>)}</div>}
      {id === 'assembly' && <div className="small muted">Match overlaps · 9-base assembly row</div>}
      {id === 'mutation' && <div className="small muted">A ↔ T · C ↔ G</div>}
      {id === 'connections' && <div className="lab-codons">{CONNECTION_PAIRS.map((p, i) => <span key={i} style={{ borderColor: pathColors[i] }}>{i + 1}: {p.seq} ↔ {reverseComplement(p.seq)}</span>)}</div>}
      {id === 'restriction' && <div className="mono small">{target}</div>}
    </div>
    <div ref={boardRef} className={'mechanics-board mode-lab-' + id} data-testid="mechanics-board" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { gesture.current = null; }} onLostPointerCapture={() => { gesture.current = null; }}>
      {state.board.map((b, c) => {
        if (b === '.') return <div key={c} className="lab-hole" data-lab-cell={c} aria-hidden="true" />;
        const pair = endAt(c), read = readAt(c), route = state.routes.findIndex(p => p.includes(c));
        const chosen = id === 'assembly' ? selected === read && read >= 0 : id === 'connections' ? selected === pair && pair >= 0 : selected === c;
        const isTop = id === 'mutation' && MUTATION_ROWS.some(r => c >= r.top && c < r.top + r.seq.length);
        const classes = ['lab-cell', /^[ACGT]$/.test(b) ? 'b-' + b : '', chosen ? 'selected' : '', state.trace.includes(c) ? 'traced' : '', route >= 0 ? 'routed' : '', isTop ? 'reference' : '', id === 'assembly' && ASSEMBLY_CELLS.includes(c) ? 'assembly-slot' : '', state.fresh.includes(c) ? 'fresh' : '', state.cuts.includes(c) ? 'cut' : ''].filter(Boolean).join(' ');
        const endpoint = id === 'connections' && pair >= 0;
        const cutSite = id === 'restriction' && CUT_SITES.includes(c);
        const badge = endpoint ? String(pair + 1) + (CONNECTION_PAIRS[pair]!.start === c ? '→' : '←') : cutSite ? (state.cuts.includes(c) ? '✓' : '✂') : id === 'assembly' && read >= 0 && READ_CELLS[read]![0] === c ? 'R' + (read + 1) : id === 'assembly' && ASSEMBLY_CELLS.includes(c) ? String(c - ASSEMBLY_CELLS[0]! + 1) : '';
        return <button key={c} type="button" className={classes} data-lab-cell={c} data-base={b} data-testid={'lab-cell-' + c} aria-label={'Row ' + (Math.floor(c / 9) + 1) + ' column ' + (c % 9 + 1) + ': ' + (b === '·' ? 'empty' : b) + (badge ? ', ' + badge : '')} aria-pressed={chosen} disabled={state.won} onClick={e => { if (e.detail === 0) choose(c); }} style={endpoint ? { borderColor: pathColors[pair], background: '#fff' } : undefined}>
          <span>{b === '·' ? '' : b}</span>{badge && <small>{badge}</small>}
        </button>;
      })}
      <svg className="lab-lines" viewBox="0 0 9 9" aria-hidden="true">
        {id === 'trace' && state.trace.length > 1 && <polyline points={pathPoints(state.trace)} stroke="#2b5f9e" />}
        {id === 'connections' && state.routes.map((p, i) => p.length > 1 && <polyline key={i} points={pathPoints(p)} stroke={pathColors[i]} />)}
        {id === 'restriction' && CUT_STRANDS.map((strand, s) => strand.slice(0, -1).map((c, i) => !state.cuts.includes(c) && <polyline key={s + ':' + c} points={pathPoints([c, strand[i + 1]!])} stroke="#52524e" className="cut-line" />))}
      </svg>
    </div>
    {id === 'mutation' && <div className="lab-base-picker" aria-label="Choose replacement base">{(['A','C','G','T'] as DNA[]).map(b => <button type="button" className={'b-' + b} key={b} disabled={selected === null || state.won} onClick={() => { if (selected !== null) dispatch({ type: 'edit', cell: selected, base: b }); }} data-testid={'lab-base-' + b}>{b}</button>)}</div>}
    <div className="lab-controls"><button type="button" onClick={undo} disabled={!session.history.length}>Undo</button><button type="button" className={hint ? 'primary' : ''} aria-pressed={hint} onClick={() => setHint(v => !v)}>Hint</button><button type="button" onClick={reset}>Replay</button></div>
    {hint && !state.won && <p className="lab-hint small" role="status">{labHint(state)}</p>}
    <p className="lab-message small" role="status" data-testid="lab-message">{session.message || 'Ready.'}</p>
    {state.won && <div className="lab-win panel" data-testid="lab-win"><h3>Challenge complete ✓</h3><p className="small">Practice complete — no campaign progress changed.</p><div className="lab-controls"><button type="button" onClick={onBack}>Lab menu</button>{next && <button type="button" className="primary" onClick={() => onNext(next)}>Next mechanic →</button>}</div></div>}
    <p className="muted tiny">{meta.biology} Reference: {LAB_REFERENCE.symbol} · {LAB_REFERENCE.transcript}.</p>
  </section>;
}
