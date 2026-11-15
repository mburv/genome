import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from 'react';
import type { LevelDefinition, Track } from '../engine/types.ts';
import { symbolLabel, symbolSequence, type CustomTokens } from '../engine/tokens.ts';
import { Barcode, SeqLetters, TokenFace, tierClass, tokenStyle } from './TokenFace.tsx';

interface Props {
  def: LevelDefinition;
  matches: boolean[][];
  committedMatches: boolean[][];
  solved: boolean;
  custom?: CustomTokens;
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

/** Measure the actual wrapped clues, not an assumed phone width.
 * Only crowded panels hide committed matches. If unmatched clues still overflow, use
 * explicit pages rather than a scrolling box. DOM visibility is recalculated after
 * committed-match change; a drag preview never changes the committed completion flags.
 */
export function TargetShell({ defId, label, solved, committedKey, children, reserveHeight = false, hideCompleted = false, longClues = false }: { defId: string; label: string; solved: boolean; committedKey: string; children: ReactNode; reserveHeight?: boolean; hideCompleted?: boolean; longClues?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const page = useRef(0);
  const previous = useRef('');
  const refresh = useRef<((delta?: number) => void) | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const app = el.closest<HTMLElement>('.app');
    const identity = hideCompleted ? defId + ':' + committedKey : defId;
    if (previous.current !== identity) { previous.current = identity; page.current = 0; }
    const nav = el.querySelector<HTMLElement>('.clue-pagination')!;
    const status = nav.querySelector<HTMLElement>('.clue-page-count')!;
    const back = nav.querySelector<HTMLButtonElement>('[data-clue-back]')!;
    const next = nav.querySelector<HTMLButtonElement>('[data-clue-next]')!;
    const units = Array.from(el.querySelectorAll<HTMLElement>('[data-clue-unit]'));
    const setHidden = (unit: HTMLElement, hidden: boolean) => unit.toggleAttribute('data-clue-hidden', hidden);
    const fits = () => el.scrollHeight <= el.clientHeight + 1;
    const update = (delta = 0) => {
      // Measure the complete layout first, even if a previous render hid a clue.
      nav.hidden = true;
      el.classList.remove('clues-compact');
      units.forEach(unit => setHidden(unit, false));
      el.scrollTop = 0;
      // Tracing commits while the finger is still on the board. Keep its board position
      // steady even when completed clues disappear; measure again after a resize.
      el.style.minHeight = '';
      if (reserveHeight) el.style.minHeight = el.clientHeight + 'px';
      // Codon Crush always removes collected clues, even on a roomy or solved board.
      // Measure the full set first so the board stays at the same vertical position.
      if (hideCompleted) units.forEach(unit => setHidden(unit, unit.dataset.clueDone === 'true'));
      // Long fragments use compact, content-sized clues. Keep every outstanding
      // clue visible; on short screens reserve the actual height above the board.
      if (longClues) {
        app?.style.setProperty('--long-clue-height', Math.ceil(el.getBoundingClientRect().height) + 'px');
        page.current = 0;
        return;
      }
      if (fits()) { page.current = 0; return; }
      el.classList.add('clues-compact');
      const remaining = units.filter(unit => (!hideCompleted && solved) || unit.dataset.clueDone !== 'true');
      units.forEach(unit => setHidden(unit, !remaining.includes(unit)));
      if (fits()) { page.current = 0; return; }

      // Greedily fit whole chips/pairs on each page, retaining their original indices.
      // Keep the page controls mounted while measuring so their height is reserved.
      nav.hidden = false;
      const pages: HTMLElement[][] = [];
      const show = (visible: HTMLElement[]) => units.forEach(unit => setHidden(unit, !visible.includes(unit)));
      let current: HTMLElement[] = [];
      for (const unit of remaining) {
        show([...current, unit]);
        if (current.length && !fits()) { pages.push(current); current = [unit]; }
        else current.push(unit);
      }
      if (current.length) pages.push(current);
      page.current = Math.max(0, Math.min(page.current + delta, pages.length - 1));
      show(pages[page.current] ?? []);
      status.textContent = `${page.current + 1}/${pages.length}`;
      back.disabled = page.current === 0;
      next.disabled = page.current >= pages.length - 1;
      el.scrollTop = 0;
    };
    refresh.current = update;
    update();
    // Resize the layout for orientation changes and mobile browser chrome changes.
    const onResize = () => update();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    return () => {
      refresh.current = null;
      if (longClues) app?.style.removeProperty('--long-clue-height');
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, [defId, solved, committedKey, reserveHeight, hideCompleted, longClues]);
  return (
    <section ref={ref} className={'target'+(longClues?' long-clues':'')} aria-label={label} data-testid="target-panel">
      <div className="clue-pagination" hidden>
        <button type="button" data-clue-back aria-label="Previous clues" onClick={() => refresh.current?.(-1)}>‹</button>
        <span className="clue-page-count" aria-live="polite" />
        <button type="button" data-clue-next aria-label="Next clues" onClick={() => refresh.current?.(1)}>›</button>
      </div>
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

function TargetPanelInner({ def, matches, committedMatches, solved, custom }: Props & { custom: CustomTokens }) {
  const committedKey = committedMatches.map(row => row.map(Number).join('')).join('|');
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
  const longClues = Object.values(def.tokens ?? {}).some(token => token.seq.length > 6);
  if (def.mode === 'replicate') {
    const [a, b] = def.tracks as [Track, Track];
    return (
      <TargetShell longClues={longClues} defId={def.id} solved={solved} committedKey={committedKey} label="Target strands">
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
      <TargetShell longClues={longClues} defId={def.id} solved={solved} committedKey={committedKey} label="Target sequence with a gap">
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
      <TargetShell longClues={longClues} defId={def.id} solved={solved} committedKey={committedKey} label="Target pieces">
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
    <TargetShell longClues={longClues} defId={def.id} solved={solved} committedKey={committedKey} label="Target sequence">
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
