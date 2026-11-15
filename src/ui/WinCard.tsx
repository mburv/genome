import { useState } from 'react';
import type { LevelDefinition } from '../engine/types.ts';
import { runProgress } from '../campaign/campaign.ts';
import { MODE_WIN } from './modes.ts';
import { symbolSequence } from '../engine/tokens.ts';

interface Props {
  def: LevelDefinition;
  /** Mixed mechanics display the verified coding fragment, not the legacy sliding tracks. */
  mechanic?: { title: string; sequence: string; practice: boolean; nextLabel?: string; range?: {start:number;end:number} };
  moves: number;
  powersUsed: number;
  newBases: number;
  /** True when this win is a replay of an already-completed puzzle. */
  replayed?: boolean;
  /** The gene is newly assembled, or its final puzzle was solved again with the full CDS verified. */
  assembled?: boolean;
  assembledBases?: number;
  cdsLength: number;
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
  const run = runProgress(def);
  const [skipped, setSkipped] = useState(p.reducedMotion);
  const iv = p.mechanic?.range ?? def.sourceIntervals[0]!;
  const expand = expandFor(def);
  const cells = cellsFor(def);
  const restored = def.repair ? expand(def.repair.expected) : '';
  let strand;
  const practice = p.mechanic?.practice ?? !!def.lab;
  const geneFinal = !practice && !!run && run.part === run.of;
  if (p.mechanic) {
    strand = <div className="win-line" data-testid="mixed-extracted">{[...p.mechanic.sequence].map((b,i)=><span key={i} className={'strip-cell b-'+b+' ok'} style={{animationDelay:skipped?'0ms':(i*(p.mechanic!.sequence.length>27?4:40))+'ms'}}>{b}</span>)}</div>;
  } else if (def.mode === 'splice') {
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
    <div className="overlay win-overlay" role="dialog" aria-modal="true" aria-labelledby="win-title" data-testid="win">
      <div className="card win-card" data-testid="win-card">
        <div className="card-head">
          <div className="card-head-copy">
            <p className="muted small" data-testid="win-meta">{practice ? p.mechanic ? 'MECHANICS LAB' : 'ENZYME LAB' : run ? `${def.symbol} ${run.part}/${run.of}` : `LEVEL ${def.index + 1}`} COMPLETE · {p.moves} {p.moves === 1 ? 'move' : 'moves'}{def.lab && !p.mechanic ? ` · ${p.powersUsed ? `${p.powersUsed} power${p.powersUsed > 1 ? 's' : ''} used` : 'no powers'}` : ''}</p>
            <h3 id="win-title">{p.mechanic?.title ?? MODE_WIN[def.mode]}</h3>
          </div>
          <button type="button" className="win-close" onClick={p.onClose} aria-label="Close and view board" data-testid="win-close">
            <span className="win-close-box" aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="square">
                <path d="M2 2l8 8M10 2L2 10" />
              </svg>
            </span>
          </button>
        </div>
        <div className={`win-strand ${skipped ? 'skip' : ''} ${p.mechanic ? p.mechanic.sequence.length>27?'tok':'' : def.tokens ? 'tok' : ''}`} onClick={() => setSkipped(true)} title="Tap to skip">{strand}</div>
        {!p.mechanic && def.mode === 'replicate' && <p className="muted tiny">Complementary pairs A–T and C–G. Only the template strand counts.</p>}
        {!p.mechanic && def.mode === 'repair' && def.repair && <p className="muted tiny">Restored {restored.length > 1 ? `${restored.length} bases` : restored} at CDS position {def.repair.sourceOffset + 1}{restored.length > 1 ? `–${def.repair.sourceOffset + restored.length}` : ''}.</p>}
        {practice ? (
          <p data-testid="win-bases"><b>Lab complete</b> <span className="muted">— practice only, no coverage added.</span></p>
        ) : (
        <>
        <p data-testid="win-bases">
          {p.replayed
            ? <><b>Replay · no new bases</b> <span className="muted">(CDS {iv.start + 1}–{iv.end})</span></>
            : <><b>+{p.newBases} {def.symbol} coding bases</b> <span className="muted">(CDS {iv.start + 1}–{iv.end})</span></>}
        </p>
        <p className="muted small" data-testid="win-assembly">{p.assembledBases ?? 0} / {p.cdsLength} {def.symbol} coding bases assembled.</p>
        </>
        )}
        {geneFinal && !p.assembled && (
          <p className="muted small" data-testid="gene-final-complete">{def.symbol} final level complete. View the gene card for assembly progress.</p>
        )}
        {p.assembled && (
          <div className="discovered assembled" data-testid="assembled">
            <b>🧬 {def.symbol} assembled!</b> All {p.cdsLength} coding bases rebuilt from the pieces you placed — exact match, SHA-256 verified.
          </div>
        )}
        <div className="card-actions">
          <button type="button" onClick={p.onMap} data-testid="win-map">{p.mechanic?.practice ? 'Lab menu' : 'Level map'}</button>
          {p.assembled || geneFinal ? (
            <button type="button" className="primary" onClick={p.onCard} autoFocus>View card</button>
          ) : p.mechanic?.practice && !p.hasNext ? null : (
            <button type="button" className="primary" onClick={p.onNext} autoFocus>{p.hasNext ? p.mechanic?.nextLabel ?? 'Next level →' : p.mechanic?.practice ? 'Lab menu' : 'Map'}</button>
          )}
        </div>
      </div>
    </div>
  );
}
