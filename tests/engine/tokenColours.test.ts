import { describe, expect, it } from 'vitest';
import { ALL_LEVELS, CHAPTER_LEVELS, LEVELS } from '../../src/campaign/campaign.ts';
import { contrastRatio, deltaE, hexToOklab, levelTokenColours, MIN_CONTRAST, tokenColour, tokenPalette, INK, PAPER } from '../../src/engine/tokenColours.ts';
import { TOKEN_SYMBOL_BASE } from '../../src/engine/tokens.ts';

/** Minimum perceptual distance (ΔE_OK × 100) between any two different combos in one puzzle. */
const MIN_DELTA_E = 7;
const HEX = /^#[0-9a-f]{6}$/;

describe('WCAG helpers', () => {
  it('contrast ratio matches known values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(contrastRatio(INK, INK)).toBe(1);
  });
  it('OKLab of white/black', () => {
    expect(hexToOklab('#ffffff')[0]).toBeCloseTo(1, 3);
    expect(hexToOklab('#000000')[0]).toBeCloseTo(0, 6);
  });
});

describe('combo palette', () => {
  const pal = tokenPalette();
  it('is large enough for every puzzle and every entry is legible (WCAG ≥ 4.5:1 for text and badges)', () => {
    const maxDistinct = Math.max(...CHAPTER_LEVELS.map((l) => Object.keys(l.tokens!).length));
    expect(pal.length).toBeGreaterThan(maxDistinct * 4);
    for (const c of pal) {
      expect(c.bg).toMatch(HEX);
      expect(c.border).toMatch(HEX);
      expect([INK, PAPER]).toContain(c.fg);
      expect(contrastRatio(c.bg, c.fg)).toBeGreaterThanOrEqual(MIN_CONTRAST);
      expect(contrastRatio(c.bg, c.fgSoft)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });
  it('is deterministic (pure, recomputed identically)', () => {
    expect(tokenPalette()).toBe(pal);
    const def = CHAPTER_LEVELS[0]!;
    const clone = structuredClone(def);
    expect(levelTokenColours(clone)).toEqual(levelTokenColours(def));
  });
});

describe('per-puzzle colour assignment', () => {
  it('every distinct multi-base sequence in every puzzle gets its own colour, all well separated (ΔE_OK ≥ 7)', () => {
    let worst = Infinity;
    for (const def of CHAPTER_LEVELS) {
      const cols = levelTokenColours(def);
      const syms = Object.keys(def.tokens!);
      expect(Object.keys(cols).sort()).toEqual([...syms].sort());
      const bgs = syms.map((s) => cols[s]!.bg);
      expect(new Set(bgs).size).toBe(syms.length);
      for (let i = 0; i < syms.length; i++) for (let j = 0; j < i; j++) {
        const d = deltaE(cols[syms[i]!]!.lab, cols[syms[j]!]!.lab);
        worst = Math.min(worst, d);
        expect(d, `${def.id}: ${def.tokens![syms[i]!]!.seq} vs ${def.tokens![syms[j]!]!.seq}`).toBeGreaterThanOrEqual(MIN_DELTA_E);
      }
    }
    expect(worst).toBeGreaterThanOrEqual(MIN_DELTA_E);
  });
  it('the colour depends on the sequence, not on symbol numbering (same sequence → same colour)', () => {
    const def = CHAPTER_LEVELS.find((l) => l.tier === 6)!;
    // Renumber the symbols in reverse: the sequence → colour mapping must not change.
    const syms = Object.keys(def.tokens!);
    const rename = Object.fromEntries(syms.map((s, i) => [s, String.fromCodePoint(TOKEN_SYMBOL_BASE + syms.length - 1 - i)]));
    const renamed = { ...def, tokens: Object.fromEntries(syms.map((s) => [rename[s]!, def.tokens![s]!])) };
    const a = levelTokenColours(def);
    const b = levelTokenColours(renamed);
    for (const s of syms) expect(b[rename[s]!]!.bg).toBe(a[s]!.bg);
  });
  it('single-base levels and CRISPR-created sequences have no combo colour', () => {
    for (const def of LEVELS) expect(tokenColour(def, 'A')).toBeNull();
    expect(tokenColour(CHAPTER_LEVELS[0]!, '\u0500')).toBeNull();
    expect(ALL_LEVELS.filter((l) => l.tokens).length).toBe(CHAPTER_LEVELS.length);
  });
});
