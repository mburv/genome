import { useState } from 'react';
import type { LevelDefinition } from '../engine/types.ts';
import { MODE_WIN } from './modes.ts';

interface Props {
  def: LevelDefinition;
  moves: number;
  powersUsed: number;
  newBases: number;
  discovered: boolean;
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

const cells = (seq: string, cls = '', delay = 0, reduced = false) =>
  seq.split('').map((b, i) => (
    <span key={i} className={`strip-cell b-${b} ok ${cls}`} style={{ animationDelay: reduced ? '0ms' : `${delay + i * 40}ms` }}>{b}</span>
  ));

/** Completion card with a short, skippable mode-specific animation (tap the strand to skip). */
export function WinCard(p: Props) {
  const { def } = p;
  const [skipped, setSkipped] = useState(p.reducedMotion);
  const iv = def.sourceIntervals[0]!;
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
        <span className={`strip-cell b-${def.repair.expected} ok restored-win`} style={{ animationDelay: skipped ? '0ms' : '450ms' }} data-testid="win-restored">{def.repair.expected}</span>
        {cells(b!.expected, '', 0, skipped)}
      </div>
    );
  } else {
    strand = <div className="win-line">{cells(def.tracks[0]!.expected, '', 0, skipped)}</div>;
  }
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="win-title" data-testid="win">
      <div className="card">
        <p className="muted small" data-testid="win-meta">{def.lab ? 'ENZYME LAB' : `LEVEL ${def.index + 1}`} COMPLETE · {p.moves} {p.moves === 1 ? 'move' : 'moves'} · {p.powersUsed ? `${p.powersUsed} power${p.powersUsed > 1 ? 's' : ''} used` : 'no powers'}</p>
        <h3 id="win-title">{MODE_WIN[def.mode]}</h3>
        <div className={`win-strand ${skipped ? 'skip' : ''}`} onClick={() => setSkipped(true)} title="Tap to skip">{strand}</div>
        {def.mode === 'replicate' && <p className="muted tiny">Complementary pairs A–T and C–G. Only the template strand counts.</p>}
        {def.mode === 'repair' && def.repair && <p className="muted tiny">Restored {def.repair.expected} at CDS position {def.repair.sourceOffset + 1}.</p>}
        {def.mode === 'splice' && <p className="muted tiny">Joined in order 1 → 2{def.tracks.length > 2 ? ' → 3' : ''} (illustrative split).</p>}
        {def.lab ? (
          <p data-testid="win-bases"><b>Lab complete</b> <span className="muted">— practice only, no coverage added.</span></p>
        ) : (
        <>
        <p data-testid="win-bases">
          {p.newBases > 0 ? <b>+{p.newBases} {def.symbol} coding bases</b> : <b>Already counted</b>} <span className="muted">(CDS {iv.start + 1}–{iv.end})</span>
        </p>
        <p className="muted small">
          {p.newBases > 0 ? `${p.covered} / ${p.sample} ${def.symbol} sample bases · ${p.covered} of ${p.cdsLength} coding bases.` : 'Replays never add duplicate bases.'}
          {p.allDone ? ' Sample campaign complete — both genes discovered, neither fully assembled.' : ''}
        </p>
        </>
        )}
        {p.discovered && (
          <div className="discovered" data-testid="discovered">
            <b>🧬 {def.symbol} discovered!</b> All six sample challenges complete — {p.covered} of {p.cdsLength} coding bases sampled. Not a fully assembled gene.
          </div>
        )}
        <div className="card-actions">
          <button type="button" onClick={p.onClose}>View board</button>
          {p.discovered ? (
            <button type="button" className="primary" onClick={p.onCard} autoFocus>View card</button>
          ) : (
            <button type="button" className="primary" onClick={p.onNext} autoFocus>{p.hasNext ? 'Next level →' : 'Map'}</button>
          )}
        </div>
        <button type="button" className="link small" onClick={p.onMap}>Level map</button>
      </div>
    </div>
  );
}
