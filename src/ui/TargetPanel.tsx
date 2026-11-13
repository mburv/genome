import { createContext, useContext } from 'react';
import type { LevelDefinition, Track } from '../engine/types.ts';
import { symbolLabel, symbolSequence, type CustomTokens } from '../engine/tokens.ts';
import { Barcode, SeqLetters, tierClass } from './TokenFace.tsx';

interface Props {
  def: LevelDefinition;
  matches: boolean[][];
  solved: boolean;
  custom?: CustomTokens;
}

const TokCtx = createContext<{ def: LevelDefinition; custom: CustomTokens } | null>(null);

function Strip({ track, ok, testId }: { track: Track; ok: boolean[]; testId?: string | undefined }) {
  const tok = useContext(TokCtx);
  if (tok?.def.tokens) {
    // Multi-base pieces: a chip per tile (readable label + barcode) in reading order.
    return (
      <span className="mini-strip tok-strip" data-testid={testId}>
        {track.expected.split('').map((sym, i) => {
          const seq = symbolSequence(tok.def, tok.custom, sym);
          return (
            <span key={i} className={`tok-chip ${tierClass(seq.length)} ${ok[i] ? 'ok' : ''}`} data-seq={seq} title={seq}>
              <span className="chip-label">{seq.length <= 6 ? <SeqLetters seq={seq} /> : symbolLabel(tok.def, tok.custom, sym)}</span>
              {seq.length > 3 && <Barcode seq={seq} />}
            </span>
          );
        })}
      </span>
    );
  }
  return (
    <span className="mini-strip" data-testid={testId}>
      {track.expected.split('').map((b, i) => (
        <span key={i} className={`strip-cell b-${b} ${ok[i] ? 'ok' : ''}`}>{b}</span>
      ))}
    </span>
  );
}

/** The full coding sequence a token level spells, piece by piece (matched pieces highlighted). */
function FullSequence({ def, custom, matches }: { def: LevelDefinition; custom: CustomTokens; matches: boolean[][] }) {
  return (
    <div className="full-seq mono tiny" data-testid="target-sequence" aria-label="Full target sequence">
      {def.tracks.map((t, ti) => (
        <span key={t.group} className="full-part">
          {ti > 0 && <span className="muted"> + </span>}
          {t.expected.split('').map((sym, i) => (
            <span key={i} className={`full-piece ${matches[ti]?.[i] ? 'ok' : ''}`}><SeqLetters seq={symbolSequence(def, custom, sym)} /></span>
          ))}
        </span>
      ))}
    </div>
  );
}

const readLabel = (t: Track): string => (t.orientation === 'horizontal' ? 'left → right' : 'top → bottom');

/** Mode-specific target read-out with live per-cell matches. */
export function TargetPanel({ custom = {}, ...p }: Props) {
  return (
    <TokCtx.Provider value={{ def: p.def, custom }}>
      <TargetPanelInner {...p} custom={custom} />
    </TokCtx.Provider>
  );
}

function TargetPanelInner({ def, matches, solved, custom }: Props & { custom: CustomTokens }) {
  const t0 = def.tracks[0]!;
  const toks = !!def.tokens;
  const full = toks ? <FullSequence def={def} custom={custom} matches={matches} /> : null;
  const range = `CDS ${def.sourceIntervals[0]!.start + 1}–${def.sourceIntervals[0]!.end}`;
  const label = (
    <div className="row-between small">
      <span className="target-title">{def.title}</span>
      <span className="muted">{range}{toks ? ` · ${def.tier}-base tiles` : ''}</span>
    </div>
  );
  if (def.mode === 'replicate') {
    const [a, b] = def.tracks as [Track, Track];
    return (
      <section className="target" aria-label="Target strands" data-testid="target-panel">
        {label}
        <div className="pair">
          <div className="pair-row">
            <b className="badge">{a.group}</b><span className="end">5′</span><Strip track={a} ok={matches[0]!} testId="target-strip" /><span className="end">3′</span>
            <span className="muted tiny">template</span>
          </div>
          <div className="pair-bonds" aria-hidden="true">{a.expected.split('').map((_, i) => <i key={i} />)}</div>
          <div className="pair-row">
            <b className="badge alt">{b.group}</b><span className="end">3′</span><Strip track={b} ok={matches[1]!} /><span className="end">5′</span>
            <span className="muted tiny">complement</span>
          </div>
        </div>
        {full}
        <p className="muted tiny">Aligned complement (A–T, C–G), read {readLabel(a)} on the board. Only strand 1 counts toward coverage.</p>
      </section>
    );
  }
  if (def.mode === 'repair' && def.repair) {
    const [a, b] = def.tracks as [Track, Track];
    return (
      <section className="target" aria-label="Target sequence with a gap" data-testid="target-panel">
        {label}
        <div className="repair-row">
          <b className="badge">{a.group}</b><Strip track={a} ok={matches[0]!} testId="target-strip" />
          {toks
            ? <span className={`tok-chip gap ${solved ? 'ok restored' : ''}`} data-testid="repair-slot">{solved ? symbolLabel(def, custom, def.repair.expected) : `?×${def.repair.length ?? symbolSequence(def, custom, def.repair.expected).length}`}</span>
            : <span className={`strip-cell gap ${solved ? `b-${def.repair.expected} ok restored` : ''}`} data-testid="repair-slot">{solved ? def.repair.expected : '?'}</span>}
          <Strip track={b} ok={matches[1]!} /><b className="badge">{b.group}</b>
        </div>
        {full}
        <p className="muted tiny">Read {readLabel(t0)}. The missing {toks ? 'piece' : 'base'} is a reference assembly gap (not a mutation); it is restored when both sides match.</p>
      </section>
    );
  }
  if (def.mode === 'splice') {
    return (
      <section className="target" aria-label="Target pieces" data-testid="target-panel">
        {label}
        <div className="splice-row">
          {def.tracks.map((t, i) => (
            <span key={t.group} className="splice-part">
              {i > 0 && <span className="plus" aria-hidden="true">+</span>}
              <b className="badge">{t.group}</b>
              <Strip track={t} ok={matches[i]!} testId={i === 0 ? 'target-strip' : undefined} />
              <span className="muted tiny">{t.orientation === 'horizontal' ? '→' : '↓'}</span>
            </span>
          ))}
        </div>
        {full}
        <p className="muted tiny">Pieces join in order when all match. The split is illustrative, not real exon boundaries.</p>
      </section>
    );
  }
  return (
    <section className="target" aria-label="Target sequence" data-testid="target-panel">
      {label}
      <div className="seq-row">
        <b className="badge">{t0.group}</b><Strip track={t0} ok={matches[0]!} testId="target-strip" />
      </div>
      {full}
      <p className="muted tiny">Read {readLabel(t0)}.{toks ? ' Tiles match by sequence, not by label.' : ''}</p>
    </section>
  );
}
