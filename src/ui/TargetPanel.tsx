import { createContext, useContext, type ReactNode } from 'react';
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
      <>
        {track.expected.split('').map((sym, i) => {
          const seq = symbolSequence(tok.def, tok.custom, sym);
          return (
            <span key={i} className={`tok-chip ${tierClass(seq.length)} ${ok[i] ? 'ok' : ''}`} data-seq={seq} title={seq} style={tokenStyle(tok.def, sym)} data-testid={i === 0 ? testId : undefined}>
              <span className="chip-label">{seq.length <= 6 ? <SeqLetters seq={seq} /> : symbolLabel(tok.def, tok.custom, sym)}</span>
              {seq.length > 3 && <Barcode seq={seq} />}
            </span>
          );
        })}
      </>
    );
  }
  return (
    <>
      {track.expected.split('').map((b, i) => (
        <span key={i} className={`strip-cell b-${b} ${ok[i] ? 'ok' : ''}`} data-testid={i === 0 ? testId : undefined}>{b}</span>
      ))}
    </>
  );
}

function CluePart({ group, alt, testId, badgeTestId, extraClass, children }: {
  group?: number | string;
  alt?: boolean;
  testId?: string;
  badgeTestId?: string;
  extraClass?: string;
  children: ReactNode;
}) {
  return (
    <div className={`clue-part${extraClass ? ` ${extraClass}` : ''}`} data-testid={testId}>
      {group != null
        ? <b className={`badge${alt ? ' alt' : ''}`} data-testid={badgeTestId}>{group}</b>
        : <span />}
      {children}
    </div>
  );
}

/** Wrapping chip row. Chips size to their letters; extra chips wrap into the same columns. */
function TokenRow({ children }: { children: ReactNode }) {
  return <div className="clue-tokens">{children}</div>;
}

function stackClass(mode: string, tier?: number): string {
  return `clue-stack mode-${mode}${tier ? ` tier-${tier}` : ''}`;
}

function gapLabel(def: LevelDefinition, custom: CustomTokens, solved: boolean): string {
  const repair = def.repair!;
  if (solved) return def.tokens ? symbolLabel(def, custom, repair.expected) : repair.expected;
  if (!def.tokens) return '?';
  const n = repair.length ?? symbolSequence(def, custom, repair.expected).length;
  // A zero-length count would render as a stray "0" / "?×0"; keep a plain gap mark instead.
  return n > 0 ? `?×${n}` : '?';
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
  const tier = toks ? def.tier : undefined;
  if (def.mode === 'replicate') {
    const [a, b] = def.tracks as [Track, Track];
    return (
      <section className="target" aria-label="Target strands" data-testid="target-panel">
        {label}
        <div className={stackClass('replicate', tier)}>
          <CluePart group={a.group} testId="clue-part-1" badgeTestId="clue-badge-1">
            <span className="end">5′</span>
            <TokenRow>
              <Strip track={a} ok={matches[0]!} testId="target-strip" />
            </TokenRow>
            <span className="end">3′</span>
            <span className="muted tiny">template</span>
          </CluePart>
          <CluePart extraClass="pair-bonds" testId="clue-bonds">
            <span />
            <TokenRow>{a.expected.split('').map((_, i) => <i key={i} />)}</TokenRow>
            <span />
            <span />
          </CluePart>
          <CluePart group={b.group} alt testId="clue-part-2" badgeTestId="clue-badge-2">
            <span className="end">3′</span>
            <TokenRow>
              <Strip track={b} ok={matches[1]!} />
            </TokenRow>
            <span className="end">5′</span>
            <span className="muted tiny">complement</span>
          </CluePart>
        </div>
      </section>
    );
  }
  if (def.mode === 'repair' && def.repair) {
    const [a, b] = def.tracks as [Track, Track];
    return (
      <section className="target" aria-label="Target sequence with a gap" data-testid="target-panel">
        {label}
        <div className={stackClass('repair', tier)}>
          <CluePart group={a.group} testId="clue-part-1" badgeTestId="clue-badge-1">
            <TokenRow>
              <Strip track={a} ok={matches[0]!} testId="target-strip" />
              {toks
                ? <span className={`tok-chip gap ${solved ? 'ok restored' : ''}`} data-testid="repair-slot" style={solved ? tokenStyle(def, def.repair.expected) : {}}>{gapLabel(def, custom, solved)}</span>
                : <span className={`strip-cell gap ${solved ? `b-${def.repair.expected} ok restored` : ''}`} data-testid="repair-slot">{gapLabel(def, custom, solved)}</span>}
            </TokenRow>
          </CluePart>
          <CluePart group={b.group} testId="clue-part-2" badgeTestId="clue-badge-2">
            <TokenRow>
              <Strip track={b} ok={matches[1]!} />
            </TokenRow>
          </CluePart>
        </div>
      </section>
    );
  }
  if (def.mode === 'splice') {
    return (
      <section className="target" aria-label="Target pieces" data-testid="target-panel">
        {label}
        <div className={stackClass('splice', tier)}>
          {def.tracks.map((t, i) => (
            <CluePart key={t.group} group={t.group} testId={`clue-part-${t.group}`} badgeTestId={`clue-badge-${t.group}`}>
              <TokenRow>
                <Strip track={t} ok={matches[i]!} testId={i === 0 ? 'target-strip' : undefined} />
                <span className="clue-affix">
                  <span className="clue-dir muted tiny">{t.orientation === 'horizontal' ? '→' : '↓'}</span>
                  {i < def.tracks.length - 1 ? <span className="plus" aria-hidden="true">+</span> : null}
                </span>
              </TokenRow>
            </CluePart>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className="target" aria-label="Target sequence" data-testid="target-panel">
      {label}
      <div className={stackClass('sequence', tier)}>
        <CluePart group={t0.group} testId="clue-part-1" badgeTestId="clue-badge-1">
          <TokenRow>
            <Strip track={t0} ok={matches[0]!} testId="target-strip" />
          </TokenRow>
        </CluePart>
      </div>
    </section>
  );
}
