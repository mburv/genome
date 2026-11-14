import { useState } from 'react';
import type { LevelDefinition } from '../engine/types.ts';
import { MODE_WIN } from './modes.ts';
import { symbolSequence } from '../engine/tokens.ts';

interface Props {
  def: LevelDefinition;
  moves: number;
  powersUsed: number;
  newBases: number;
  discovered: boolean;
  /** M4: this solve completed an exact, checksum-verified assembly of the gene. */
  assembled?: boolean;
  assembledBases?: number;
  covered: number;
  sample: number;
  cdsLength: number;
  allDone: boolean;
  reducedMotion: boolean;
  hasNext: boolean;
  onNext: () => void;
  onMap: () => void;
  onCard: () => void;
  onClose: () => void;
}

const expandFor = (def: LevelDefinition) => (syms: string): string => (def.tokens ? syms.split('').map((x) => symbolSequence(def, {}, x)).join('') : syms);
const cellsFor = (def: LevelDefinition) => (syms: string, cls = '', delay = 0, reduced = false) =>
  expandFor(def)(syms).split('').map((b, i) => (
    <span key={i} className={`strip-cell b-${b} ok ${cls}`} style={{ animationDelay: reduced ? '0ms' : `${delay + i * (def.tokens ? 4 : 40)}ms` }}>{b}</span>
  ));

/** Completion card with a short, skippable mode-specific animation (tap the strand to skip). */
export function WinCard(p: Props) {
  const { def } = p;
  const [skipped, setSkipped] = useState(p.reducedMotion);
  const iv = def.sourceIntervals[0]!;
  const expand = expandFor(def);
  const cells = cellsFor(def);
  const restored = def.repair ? expand(def.repair.expected) : '';
  let strand;
  if (def.mode === 'splice') {
    strand = (
      <div className="win-splice">
        {def.tracks.map((t, i) => <span key={t.group} className="win-part" style={{ animationDelay: skipped ? '0ms' : `${300 + i * 80}ms` }}>{cells(t.expected, '', i * 120, skipped)}</span>)}
      </div>
    );
  } else if (def.mode === 'replicate') {
    const [a, b] = def.tracks;
    strand = (
      <div className="win-pair">
        <div className="win-line"><span className="end">5′</span>{cells(a!.expected, '', 0, skipped)}<span className="end">3′</span></div>
        <div className="win-line"><span className="end">3′</span>{cells(b!.expected, 'comp', 240, skipped)}<span className="end">5′</span></div>
      </div>
    );
  } else if (def.mode === 'repair' && def.repair) {
    const [a, b] = def.tracks;
    strand = (
      <div className="win-line">
        {cells(a!.expected, '', 0, skipped)}
        <span className="restored-win-group" data-testid="win-restored">{restored.split('').map((b, i) => <span key={i} className={`strip-cell b-${b} ok restored-win`} style={{ animationDelay: skipped ? '0ms' : `${450 + i * 20}ms` }}>{b}</span>)}</span>
        {cells(b!.expected, '', 0, skipped)}
      </div>
    );
  } else {
    strand = <div className="win-line">{cells(def.tracks[0]!.expected, '', 0, skipped)}</div>;
  }
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="win-title" data-testid="win">
      <div className="card">
        <div className="card-head">
          <div className="card-head-copy">
            <p className="muted small" data-testid="win-meta">{def.lab ? 'ENZYME LAB' : def.chapter ? `${def.symbol} ASSEMBLY ${def.chapter.part}/${def.chapter.of}` : `LEVEL ${def.index + 1}`} COMPLETE · {p.moves} {p.moves === 1 ? 'move' : 'moves'} · {p.powersUsed ? `${p.powersUsed} power${p.powersUsed > 1 ? 's' : ''} used` : 'no powers'}</p>
            <h3 id="win-title">{MODE_WIN[def.mode]}</h3>
          </div>
          <button type="button" className="win-close" onClick={p.onClose} aria-label="Close and view board" data-testid="win-close">
            <span className="win-close-box" aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="square">
                <path d="M2 2l8 8M10 2L2 10" />
              </svg>
            </span>
          </button>
        </div>
        <div className={`win-strand ${skipped ? 'skip' : ''} ${def.tokens ? 'tok' : ''}`} onClick={() => setSkipped(true)} title="Tap to skip">{strand}</div>
        {def.mode === 'replicate' && <p className="muted tiny">Complementary pairs A–T and C–G. Only the template strand counts.</p>}
        {def.mode === 'repair' && def.repair && <p className="muted tiny">Restored {restored.length > 1 ? `${restored.length} bases` : restored} at CDS position {def.repair.sourceOffset + 1}{restored.length > 1 ? `–${def.repair.sourceOffset + restored.length}` : ''}.</p>}
        {def.mode === 'splice' && <p className="muted tiny">Joined in order 1 → 2{def.tracks.length > 2 ? ' → 3' : ''} (illustrative split).</p>}
        {def.lab ? (
          <p data-testid="win-bases"><b>Lab complete</b> <span className="muted">— practice only, no coverage added.</span></p>
        ) : (
        <>
        <p data-testid="win-bases">
          {p.newBases > 0 ? <b>+{p.newBases} {def.symbol} coding bases</b> : <b>Already counted</b>} <span className="muted">(CDS {iv.start + 1}–{iv.end})</span>
        </p>
        {def.chapter ? (
          <p className="muted small" data-testid="win-assembly">{p.assembledBases ?? 0} / {p.cdsLength} {def.symbol} coding bases assembled.{p.newBases > 0 ? '' : ' Replays never add duplicate bases.'}</p>
        ) : (
        <p className="muted small">
          {p.newBases > 0 ? `${p.covered} / ${p.sample} ${def.symbol} sample bases · ${p.covered} of ${p.cdsLength} coding bases.` : 'Replays never add duplicate bases.'}
          {p.allDone ? ' Sample campaign complete — both genes discovered. Their assembly chapters are on the map.' : ''}
        </p>
        )}
        </>
        )}
        {p.assembled ? (
          <div className="discovered assembled" data-testid="assembled">
            <b>🧬 {def.symbol} assembled!</b> All {p.cdsLength} coding bases rebuilt from the pieces you placed — exact match, SHA-256 verified.
          </div>
        ) : p.discovered && (
          <div className="discovered" data-testid="discovered">
            <b>🧬 {def.symbol} discovered!</b> {def.chapter ? `First assembly puzzle solved — ${p.assembledBases ?? 0} of ${p.cdsLength} coding bases placed.` : `All six sample challenges complete — ${p.covered} of ${p.cdsLength} coding bases sampled.`} Not yet fully assembled.
          </div>
        )}
        <div className="card-actions">
          <button type="button" onClick={p.onMap} data-testid="win-map">Level map</button>
          {p.discovered || p.assembled ? (
            <button type="button" className="primary" onClick={p.onCard} autoFocus>View card</button>
          ) : (
            <button type="button" className="primary" onClick={p.onNext} autoFocus>{p.hasNext ? 'Next level →' : 'Map'}</button>
          )}
        </div>
      </div>
    </div>
  );
}
