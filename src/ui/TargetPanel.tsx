import { createContext, useContext } from 'react';
import type { LevelDefinition, Track } from '../engine/types.ts';
import { symbolLabel, symbolSequence, type CustomTokens } from '../engine/tokens.ts';
import { Barcode, SeqLetters, tierClass, tokenStyle } from './TokenFace.tsx';

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
            <span key={i} className={`tok-chip ${tierClass(seq.length)} ${ok[i] ? 'ok' : ''}`} data-seq={seq} title={seq} style={tokenStyle(tok.def, sym)}>
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
            ? <span className={`tok-chip gap ${solved ? 'ok restored' : ''}`} data-testid="repair-slot" style={solved ? tokenStyle(def, def.repair.expected) : {}}>{solved ? symbolLabel(def, custom, def.repair.expected) : `?×${def.repair.length ?? symbolSequence(def, custom, def.repair.expected).length}`}</span>
            : <span className={`strip-cell gap ${solved ? `b-${def.repair.expected} ok restored` : ''}`} data-testid="repair-slot">{solved ? def.repair.expected : '?'}</span>}
          <Strip track={b} ok={matches[1]!} /><b className="badge">{b.group}</b>
        </div>
      </section>
    );
  }
  if (def.mode === 'splice') {
    return (
      <section className="target" aria-label="Target pieces" data-testid="target-panel">
        {label}
        <div className="splice-row">
          {def.tracks.map((t, i) => (
            <span key={t.group} className="splice-part" data-testid={`splice-part-${t.group}`}>
              <b className="badge" data-testid={`splice-badge-${t.group}`}>{t.group}</b>
              <Strip track={t} ok={matches[i]!} testId={i === 0 ? 'target-strip' : undefined} />
              <span className="muted tiny">{t.orientation === 'horizontal' ? '→' : '↓'}</span>
              {i < def.tracks.length - 1 && <span className="plus" aria-hidden="true">+</span>}
            </span>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className="target" aria-label="Target sequence" data-testid="target-panel">
      {label}
      <div className="seq-row">
        <b className="badge">{t0.group}</b><Strip track={t0} ok={matches[0]!} testId="target-strip" />
      </div>
    </section>
  );
}
