/**
 * DNA tile faces: codons show three letters, hexamers two rows of three plus a barcode,
 * and longer fragments show the first and last codons separated by a thin rule.
 * The underlying sequence, accessible name and sequence-specific palette remain intact.
 */
export function SeqLetters({ seq, group = 0 }: { seq: string; group?: number }) {
  return (
    <>
      {seq.split('').map((b, i) => (
        <i key={i} className={`bl-${b}${group && i > 0 && i % group === 0 ? ' gap-before' : ''}`}>{b}</i>
      ))}
    </>
  );
}

export function Barcode({ seq }: { seq: string }) {
  return (
    <span className="barcode" aria-hidden="true">
      {seq.split('').map((b, i) => <i key={i} className={`bc-${b}`} />)}
    </span>
  );
}

import type { CSSProperties } from 'react';
import type { LevelDefinition } from '../engine/types.ts';
import { tokenColour } from '../engine/tokenColours.ts';

/** CSS custom properties carrying a symbol's combo colour (empty for single-base / CRISPR-edited tiles). */
export function tokenStyle(def: LevelDefinition, symbol: string): CSSProperties {
  const c = tokenColour(def, symbol);
  return c ? ({ '--tok-bg': c.bg, '--tok-fg': c.fg, '--tok-soft': c.fgSoft, '--tok-border': c.border } as CSSProperties) : {};
}

export const tierClass = (len: number): string => (len <= 3 ? 'tier-3' : len <= 6 ? 'tier-6' : 'tier-l');

export function TokenFace({ seq }: { seq: string; label: string }) {
  if (seq.length <= 3) {
    return (
      <span className="tok-face">
        <span className="tok-row"><SeqLetters seq={seq} /></span>
      </span>
    );
  }
  if (seq.length <= 6) {
    return (
      <span className="tok-face">
        <span className="tok-row"><SeqLetters seq={seq.slice(0, 3)} /></span>
        <span className="tok-row"><SeqLetters seq={seq.slice(3)} /></span>
        <Barcode seq={seq} />
      </span>
    );
  }
  return (
    <span className="tok-face long">
      <span className="tok-row"><SeqLetters seq={seq.slice(0, 3)} /></span>
      <span className="tok-divider" aria-hidden="true" />
      <span className="tok-row"><SeqLetters seq={seq.slice(-3)} /></span>
    </span>
  );
}
