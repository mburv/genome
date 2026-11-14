import { createContext, useContext, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
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

function Chip({ track, index, ok, testId }: { track: Track; index: number; ok: boolean; testId?: string | undefined }) {
  const tok = useContext(TokCtx);
  const sym = track.expected[index]!;
  if (tok?.def.tokens) {
    const seq = symbolSequence(tok.def, tok.custom, sym);
    return (
      <span className={`tok-chip ${tierClass(seq.length)} ${ok ? 'ok' : ''}`} data-seq={seq} title={seq} style={tokenStyle(tok.def, sym)} data-testid={testId}>
        <span className="chip-label">{seq.length <= 6 ? <SeqLetters seq={seq} /> : symbolLabel(tok.def, tok.custom, sym)}</span>
        {seq.length > 3 && <Barcode seq={seq} />}
      </span>
    );
  }
  return <span className={`strip-cell b-${sym} ${ok ? 'ok' : ''}`} data-testid={testId}>{sym}</span>;
}

function Strip({ track, ok, testId }: { track: Track; ok: boolean[]; testId?: string | undefined }) {
  return (
    <>
      {track.expected.split('').map((_, i) => (
        <Chip key={i} track={track} index={i} ok={!!ok[i]} testId={i === 0 ? testId : undefined} />
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

/** Subtle top/bottom fades only when the capped clue box can scroll (D-UI-30). */
function useClueScroll(ref: RefObject<HTMLElement | null>, dep: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const overflow = el.scrollHeight > el.clientHeight + 1;
      const top = el.scrollTop > 1;
      const end = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      el.classList.toggle('scrollable', overflow);
      el.classList.toggle('scroll-top', overflow && top);
      el.classList.toggle('scroll-end', overflow && end);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); };
  }, [dep, ref]);
}

function TargetShell({ defId, label, children }: { defId: string; label: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useClueScroll(ref, defId);
  return (
    <section ref={ref} className="target" aria-label={label} data-testid="target-panel">
      {children}
    </section>
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
  const heading = (
    <div className="row-between small">
      <span className="target-title">{def.title}</span>
      <span className="muted">{range}{toks ? ` · ${def.tier}-base tiles` : ''}</span>
    </div>
  );
  const tier = toks ? def.tier : undefined;
  if (def.mode === 'replicate') {
    const [a, b] = def.tracks as [Track, Track];
    return (
      <TargetShell defId={def.id} label="Target strands">
        {heading}
        <div className={stackClass('replicate', tier)}>
          <div className="rep-start">
            <CluePart group={a.group} testId="clue-part-1" badgeTestId="clue-badge-1">
              <span className="end">5′</span>
            </CluePart>
            <div className="rep-bond-spacer" aria-hidden="true" />
            <CluePart group={b.group} alt testId="clue-part-2" badgeTestId="clue-badge-2">
              <span className="end">3′</span>
            </CluePart>
          </div>
          {a.expected.split('').map((_, i) => (
            <div className="rep-pair" key={i} data-testid={i === 0 ? 'clue-bonds' : undefined}>
              <Chip track={a} index={i} ok={!!matches[0]?.[i]} testId={i === 0 ? 'target-strip' : undefined} />
              <i className="rep-bond" aria-hidden="true" />
              <Chip track={b} index={i} ok={!!matches[1]?.[i]} />
            </div>
          ))}
          <div className="rep-end">
            <span className="end">3′</span>
            <span className="muted tiny">template</span>
            <span className="rep-bond-spacer" aria-hidden="true" />
            <span className="end">5′</span>
            <span className="muted tiny">complement</span>
          </div>
        </div>
      </TargetShell>
    );
  }
  if (def.mode === 'repair' && def.repair) {
    const [a, b] = def.tracks as [Track, Track];
    return (
      <TargetShell defId={def.id} label="Target sequence with a gap">
        {heading}
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
      </TargetShell>
    );
  }
  if (def.mode === 'splice') {
    return (
      <TargetShell defId={def.id} label="Target pieces">
        {heading}
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
      </TargetShell>
    );
  }
  return (
    <TargetShell defId={def.id} label="Target sequence">
      {heading}
      <div className={stackClass('sequence', tier)}>
        <CluePart group={t0.group} testId="clue-part-1" badgeTestId="clue-badge-1">
          <TokenRow>
            <Strip track={t0} ok={matches[0]!} testId="target-strip" />
          </TokenRow>
        </CluePart>
      </div>
    </TargetShell>
  );
}
