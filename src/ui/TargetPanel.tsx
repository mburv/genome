import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from 'react';
import type { LevelDefinition, Track } from '../engine/types.ts';
import { symbolLabel, symbolSequence, type CustomTokens } from '../engine/tokens.ts';
import { Barcode, SeqLetters, TokenFace, tierClass, tokenStyle } from './TokenFace.tsx';
import { formatGeneClueRange } from './clueRange.ts';

interface Props {
  def: LevelDefinition;
  matches: boolean[][];
  committedMatches: boolean[][];
  solved: boolean;
  custom?: CustomTokens;
  measureOnly?: boolean;
}

const TokCtx = createContext<{ def: LevelDefinition; custom: CustomTokens } | null>(null);

function Chip({ track, index, ok, testId, done }: { track: Track; index: number; ok: boolean; testId?: string | undefined; done?: boolean | undefined }) {
  const tok = useContext(TokCtx);
  const sym = track.expected[index]!;
  const unit = done === undefined ? {} : { 'data-clue-unit': '', 'data-clue-done': String(done), 'data-clue-index': index + 1 };
  if (tok?.def.tokens) {
    const seq = symbolSequence(tok.def, tok.custom, sym);
    return (
      <span className={`tok-chip ${tierClass(seq.length)} ${ok ? 'ok' : ''}`} data-seq={seq} {...unit} title={seq} style={tokenStyle(tok.def, sym)} data-testid={testId}>
        {seq.length > 6 ? <TokenFace seq={seq} label={symbolLabel(tok.def, tok.custom, sym)} /> : <><span className="chip-label"><SeqLetters seq={seq} /></span>{seq.length > 3 && <Barcode seq={seq} />}</>}
      </span>
    );
  }
  return <span className={`strip-cell b-${sym} ${ok ? 'ok' : ''}`} data-testid={testId} {...unit}>{sym}</span>;
}

function Strip({ track, ok, done, testId }: { track: Track; ok: boolean[]; done: boolean[]; testId?: string | undefined }) {
  return (
    <>
      {track.expected.split('').map((_, i) => (
        <Chip key={i} track={track} index={i} ok={!!ok[i]} done={!!done[i]} testId={i === 0 ? testId : undefined} />
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

/** Keep a fixed one-row clue strip. Only the earliest unfinished clues that fit
 * are visible; newly solved ones disappear and later ones automatically flow in.
 * Visibility is recomputed after committed moves, undo and viewport changes.
 */
export function TargetShell({ defId, label, children, hideCompleted = true, longClues = false, measureOnly = false }: { defId: string; label: string; solved: boolean; committedKey: string; children: ReactNode; hideCompleted?: boolean; longClues?: boolean; measureOnly?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || measureOnly) return;
    const units = Array.from(el.querySelectorAll<HTMLElement>('[data-clue-unit]'));
    const setHidden = (unit: HTMLElement, hidden: boolean) => unit.toggleAttribute('data-clue-hidden', hidden);
    const fits = () => {
      if (el.scrollHeight > el.clientHeight + 1) return false;
      // Even two short rows can fit within the height of one tall replication
      // pair. Keep exactly one logical row on screen across all mechanics.
      const visible = units.filter(unit => !unit.hasAttribute('data-clue-hidden'));
      if (visible.length < 2) return true;
      const tops = visible.map(unit => unit.getBoundingClientRect().top);
      return Math.max(...tops) - Math.min(...tops) < 2;
    };
    const update = () => {
      el.classList.remove('clues-compact');
      // Start with every unfinished unit visible so the wrapping measurement
      // reflects the actual remaining clues, including units restored by Undo.
      units.forEach(unit => setHidden(unit, hideCompleted && unit.dataset.clueDone === 'true'));
      el.scrollTop = 0;
      const remaining = units.filter(unit => !unit.hasAttribute('data-clue-hidden'));
      if (!remaining.length || fits()) return;

      // A single logical row is visible, regardless of how many shorter rows
      // would fit in the height of the tallest clue. There are no page controls.
      el.classList.add('clues-compact');
      const show = (visible: HTMLElement[]) => {
        const keep = new Set(visible);
        units.forEach(unit => setHidden(unit, !keep.has(unit)));
      };
      const visible: HTMLElement[] = [];
      for (const unit of remaining) {
        show([...visible, unit]);
        if (visible.length && !fits()) {
          show(visible);
          break;
        }
        visible.push(unit);
      }
      el.scrollTop = 0;
    };
    update();
    // Resize the layout for orientation changes and mobile browser chrome changes.
    const onResize = () => update();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    // Changing fonts or a clue container's intrinsic height may rewrap the
    // tiles without resizing the fixed-height target itself.
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => update()) : null;
    observer?.observe(el);
    for (const child of el.children) observer?.observe(child);
    const frame = window.requestAnimationFrame(() => update());
    let active = true;
    document.fonts?.ready.then(() => { if (active) update(); });
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  });
  return (
    <section ref={ref} className={'target'+(longClues?' long-clues':'')} aria-label={label} data-testid={measureOnly ? undefined : "target-panel"} data-clue-measure-id={measureOnly ? defId : undefined}>
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

export function slidingClueRange(def: LevelDefinition): string {
  const start = def.sourceIntervals[0]!.start;
  const end = def.sourceIntervals.at(-1)!.end;
  if (def.lab) return `CDS ${start + 1}–${end}${def.tokens ? ` · ${def.tier}-base tiles` : ''}`;
  return formatGeneClueRange(def.symbol, start, end, def.tokens ? def.tier : undefined);
}

function TargetPanelInner({ def, matches, committedMatches, solved, custom, measureOnly = false }: Props & { custom: CustomTokens }) {
  const committedKey = committedMatches.map(row => row.map(Number).join('')).join('|');
  const t0 = def.tracks[0]!;
  const toks = !!def.tokens;
  const heading = (
    <div className="row-between small">
      <span className="target-title">{def.title}</span>
      <span className="muted clue-range">{slidingClueRange(def)}</span>
    </div>
  );
  const tier = toks ? def.tier : undefined;
  const longClues = Object.values(def.tokens ?? {}).some(token => token.seq.length > 6);
  if (def.mode === 'replicate') {
    const [a, b] = def.tracks as [Track, Track];
    return (
      <TargetShell measureOnly={measureOnly} longClues={longClues} defId={def.id} solved={solved} committedKey={committedKey} label="Target strands">
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
            <div className="rep-pair" key={i} data-clue-unit="" data-clue-done={String(!!committedMatches[0]?.[i] && !!committedMatches[1]?.[i])} data-clue-index={i + 1} data-testid={i === 0 ? 'clue-bonds' : undefined}>
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
    const restoredSeq = symbolSequence(def, custom, def.repair.expected);
    const [a, b] = def.tracks as [Track, Track];
    return (
      <TargetShell measureOnly={measureOnly} longClues={longClues} defId={def.id} solved={solved} committedKey={committedKey} label="Target sequence with a gap">
        {heading}
        <div className={stackClass('repair', tier)}>
          <CluePart group={a.group} testId="clue-part-1" badgeTestId="clue-badge-1">
            <TokenRow>
              <Strip track={a} ok={matches[0]!} done={committedMatches[0]!} testId="target-strip" />
              {toks
                ? <span className={`tok-chip gap ${solved ? 'ok restored' : ''}`} data-testid="repair-slot" data-clue-unit="" data-clue-done="false" style={solved ? tokenStyle(def, def.repair.expected) : {}} title={solved ? restoredSeq : undefined} aria-label={solved ? 'Restored ' + restoredSeq : undefined}>{solved && restoredSeq.length > 6 ? <TokenFace seq={restoredSeq} label={symbolLabel(def, custom, def.repair.expected)} /> : gapLabel(def, custom, solved)}</span>
                : <span className={`strip-cell gap ${solved ? `b-${def.repair.expected} ok restored` : ''}`} data-testid="repair-slot" data-clue-unit="" data-clue-done="false">{gapLabel(def, custom, solved)}</span>}
            </TokenRow>
          </CluePart>
          <CluePart group={b.group} testId="clue-part-2" badgeTestId="clue-badge-2">
            <TokenRow>
              <Strip track={b} ok={matches[1]!} done={committedMatches[1]!} />
            </TokenRow>
          </CluePart>
        </div>
      </TargetShell>
    );
  }
  if (def.mode === 'splice') {
    return (
      <TargetShell measureOnly={measureOnly} longClues={longClues} defId={def.id} solved={solved} committedKey={committedKey} label="Target pieces">
        {heading}
        <div className={stackClass('splice', tier)}>
          {def.tracks.map((t, i) => (
            <CluePart key={t.group} group={t.group} testId={`clue-part-${t.group}`} badgeTestId={`clue-badge-${t.group}`}>
              <TokenRow>
                <Strip track={t} ok={matches[i]!} done={committedMatches[i]!} testId={i === 0 ? 'target-strip' : undefined} />
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
    <TargetShell measureOnly={measureOnly} longClues={longClues} defId={def.id} solved={solved} committedKey={committedKey} label="Target sequence">
      {heading}
      <div className={stackClass('sequence', tier)}>
        <CluePart group={t0.group} testId="clue-part-1" badgeTestId="clue-badge-1">
          <TokenRow>
            <Strip track={t0} ok={matches[0]!} done={committedMatches[0]!} testId="target-strip" />
          </TokenRow>
        </CluePart>
      </div>
    </TargetShell>
  );
}
