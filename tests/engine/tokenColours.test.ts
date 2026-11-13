import { describe, expect, it } from 'vitest';
import { ALL_LEVELS, CHAPTER_LEVELS, LEVELS } from '../../src/campaign/campaign.ts';
import { contrastRatio, CORE_SIZE, deltaE, hexToOklab, levelTokenColours, MIN_CONTRAST, MIN_INK_CONTRAST, MIN_SURFACE_DELTA, PASTEL, SURFACE_COLOURS, tokenColour, tokenPalette, INK } from '../../src/engine/tokenColours.ts';
import { TOKEN_SYMBOL_BASE } from '../../src/engine/tokens.ts';

/**
 * Minimum perceptual distance (ΔE_OK × 100, ≈ 2 is just noticeable) between any two different combos in one
 * puzzle. The pastel register (D-UI-05) is a much smaller colour volume than the earlier vivid palette (7.27),
 * so the honest floor is 5; the worst puzzle (65 distinct combos) currently reaches 5.01.
 */
const MIN_DELTA_E = 5;
const HEX = /^#[0-9a-f]{6}$/;

describe('WCAG helpers', () => {
  it('contrast ratio matches known values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(contrastRatio(INK, INK)).toBe(1);
    expect(INK).toBe('#111111');
  });
  it('OKLab of white/black', () => {
    expect(hexToOklab('#ffffff')[0]).toBeCloseTo(1, 3);
    expect(hexToOklab('#000000')[0]).toBeCloseTo(0, 6);
  });
});

describe('combo palette', () => {
  const pal = tokenPalette();
  it('is large enough for every puzzle and every entry is legible (ink ≥ 7:1, badges ≥ 4.5:1)', () => {
    const maxDistinct = Math.max(...CHAPTER_LEVELS.map((l) => Object.keys(l.tokens!).length));
    expect(CORE_SIZE).toBeGreaterThanOrEqual(maxDistinct);
    expect(pal.length).toBeGreaterThan(maxDistinct * 4);
    for (const c of pal) {
      expect(c.bg).toMatch(HEX);
      expect(c.border).toMatch(HEX);
      expect(c.fg).toBe(INK);
      expect(contrastRatio(c.bg, c.fg)).toBeGreaterThanOrEqual(MIN_INK_CONTRAST);
      expect(contrastRatio(c.bg, c.fgSoft)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });
  it('sits in the clinical pastel register (high lightness, soft chroma) with a deeper same-hue 1px edge', () => {
    for (const c of pal) {
      const [L, a, b] = c.lab;
      const C = Math.hypot(a, b);
      expect(L).toBeGreaterThanOrEqual(PASTEL.minL - 0.01);
      expect(L).toBeLessThanOrEqual(PASTEL.maxL + 0.01);
      expect(C).toBeGreaterThanOrEqual(PASTEL.minC - 0.006);
      expect(C).toBeLessThanOrEqual(PASTEL.maxC + 0.006);
      const [eL, ea, eb] = hexToOklab(c.border);
      expect(eL).toBeLessThan(L - 0.15);
      const dh = Math.abs(((Math.atan2(eb, ea) - Math.atan2(b, a)) * 180) / Math.PI + 540) % 360 - 180;
      expect(Math.abs(dh)).toBeLessThan(12);
    }
  });
  it('stays clear of the clinical light surfaces (canvas, panels, holes, hairlines)', () => {
    for (const c of pal) for (const sf of SURFACE_COLOURS) expect(deltaE(c.lab, hexToOklab(sf))).toBeGreaterThanOrEqual(MIN_SURFACE_DELTA);
  });
  it('is deterministic (pure, recomputed identically)', () => {
    expect(tokenPalette()).toBe(pal);
    const def = CHAPTER_LEVELS[0]!;
    const clone = structuredClone(def);
    expect(levelTokenColours(clone)).toEqual(levelTokenColours(def));
  });
});

describe('per-puzzle colour assignment', () => {
  it('every distinct multi-base sequence in every puzzle gets its own colour, all well separated (ΔE_OK ≥ 5)', () => {
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
