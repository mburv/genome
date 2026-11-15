/**
 * Faces for M4 multi-base tiles. Readability ladder (Q002): codons show all three letters, hexamers
 * two rows of three, longer pieces their first and last codon ("ATG…GCC") plus a length badge. Longer
 * multi-base tiles carry a per-base colour barcode so distinct sequences look distinct; tap a tile to
 * read its full sequence in the inspector.
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

export function TokenFace({ seq, label }: { seq: string; label: string }) {
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
  const edited = label.startsWith('✎');
  const suffix = /·\d+$/.exec(label)?.[0] ?? '';
  return (
    <span className="tok-face long">
      <span className="tok-row"><SeqLetters seq={seq.slice(0, 3)} /><b className="ell">…</b></span>
      <span className="tok-row"><b className="ell">…</b><SeqLetters seq={seq.slice(-3)} /></span>
      <span className="tok-len">{edited ? '✎' : ''}{seq.length}{suffix}</span>
      <Barcode seq={seq} />
    </span>
  );
}
