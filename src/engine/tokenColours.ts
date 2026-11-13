/**
 * M4.1 colour system for multi-base tiles. Pure and deterministic (no DOM, Date, fetch or Math.random).
 *
 * 1. A fixed candidate set is generated in OKLab/OKLCH (perceptual): every in-gamut sRGB colour on a
 *    lightness × chroma × hue grid whose best text colour (near-black ink or white) reaches WCAG ≥ 4.5:1.
 * 2. The candidates are ordered once by deterministic farthest-point sampling (ΔE_OK), so any prefix of
 *    the order is a well-spread palette.
 * 3. A puzzle's distinct sequences (target pieces and decoys — symbols are already one-per-sequence) are
 *    sorted by sequence and given palette entries 0…n−1. The same sequence therefore has the same colour
 *    everywhere in that puzzle (board, target strip, inspector), and no two sequences share a colour.
 * Single-base levels are untouched.
 */
import type { LevelDefinition } from './types.ts';

export interface TokenColour {
  /** Tile / chip background. */
  bg: string;
  /** Border / edge shade of the same hue. */
  border: string;
  /** High-contrast text colour on `bg` (WCAG ≥ 4.5:1). */
  fg: string;
  /** Secondary text (badges, ellipsis) — still ≥ 4.5:1 on `bg`. */
  fgSoft: string;
  /** WCAG contrast ratio of fg on bg. */
  contrast: number;
  /** OKLab coordinates of bg (for distinctness checks). */
  lab: readonly [number, number, number];
}

export const INK = '#0b1420';
export const PAPER = '#ffffff';
export const MIN_CONTRAST = 4.5;

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export function rgbToHex(rgb: readonly number[]): string {
  return '#' + rgb.map((c) => Math.round(clamp01(c) * 255).toString(16).padStart(2, '0')).join('');
}
/** WCAG 2.x relative luminance of an sRGB colour (0–1 channels). */
export const luminance = (rgb: readonly number[]): number => 0.2126 * toLinear(rgb[0]!) + 0.7152 * toLinear(rgb[1]!) + 0.0722 * toLinear(rgb[2]!);
export function contrastRatio(a: string, b: string): number {
  const la = luminance(hexToRgb(a));
  const lb = luminance(hexToRgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** OKLab → linear sRGB (Björn Ottosson). */
function oklabToLinear(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
export function hexToOklab(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363288628 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
/** Perceptual distance ΔE_OK × 100 (≈ 2 is a just-noticeable difference). */
export const deltaE = (p: readonly number[], q: readonly number[]): number => 100 * Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);

function oklch(L: number, C: number, hDeg: number): string | null {
  const h = (hDeg * Math.PI) / 180;
  const lin = oklabToLinear(L, C * Math.cos(h), C * Math.sin(h));
  if (lin.some((c) => c < -1e-4 || c > 1 + 1e-4)) return null;
  return rgbToHex(lin.map((c) => fromLinear(clamp01(c))));
}

function makeColour(bg: string): TokenColour | null {
  const cInk = contrastRatio(bg, INK);
  const cPaper = contrastRatio(bg, PAPER);
  const dark = cInk >= cPaper;
  const fg = dark ? INK : PAPER;
  const contrast = Math.max(cInk, cPaper);
  if (contrast < MIN_CONTRAST + 0.3) return null; // margin so rounding never dips below 4.5
  const [L, a, b] = hexToOklab(bg);
  const C = Math.hypot(a, b);
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  // Edge: same hue, darker (light tiles) or lighter (dark tiles) for a crisp outline.
  const border = oklch(dark ? Math.max(0.2, L - 0.28) : Math.min(0.95, L + 0.3), Math.min(C, 0.12), h) ?? (dark ? '#1b2735' : '#e6edf5');
  // Secondary text: blend fg towards bg but keep ≥ 4.5:1.
  let fgSoft = fg;
  for (const t of [0.35, 0.25, 0.15]) {
    const mix = rgbToHex(hexToRgb(fg).map((c, i) => c * (1 - t) + hexToRgb(bg)[i]! * t));
    if (contrastRatio(bg, mix) >= MIN_CONTRAST) { fgSoft = mix; break; }
  }
  return { bg, border, fg, fgSoft, contrast, lab: [L, a, b] };
}

/**
 * Clinical light surfaces (canvas, panel, hole, hairline rule, ink) a combo colour must stay clear of, so a
 * tile never reads as an empty cell, the board background or a rule.
 */
export const SURFACE_COLOURS = ['#f7f7f5', '#ffffff', '#efefea', '#e8e8e2', '#d4d4ce', '#111111'] as const;
export const MIN_SURFACE_DELTA = 12;
const SURFACES = SURFACE_COLOURS.map(hexToOklab);

let palette: TokenColour[] | null = null;
/** The ordered palette (farthest-point order over the contrast-safe OKLCH grid). Computed once. */
export function tokenPalette(): readonly TokenColour[] {
  if (palette) return palette;
  const cands: TokenColour[] = [];
  const Ls = [0.34, 0.4, 0.46, 0.52, 0.58, 0.72, 0.78, 0.84, 0.9];
  const Cs = [0.07, 0.11, 0.15, 0.19, 0.23];
  for (const L of Ls) for (const C of Cs) for (let h = 0; h < 360; h += 6) {
    const hex = oklch(L, C, h);
    const col = hex && makeColour(hex);
    if (col && !cands.some((x) => x.bg === col.bg) && SURFACES.every((sf) => deltaE(col.lab, sf) >= MIN_SURFACE_DELTA)) cands.push(col);
  }
  // Farthest-point order. Seed: the most chromatic mid-light candidate nearest hue 30° (warm coral) — fixed.
  const order: TokenColour[] = [];
  const minD = cands.map(() => Infinity);
  let next = cands.reduce((bi, c, i) => (Math.hypot(c.lab[1], c.lab[2]) > Math.hypot(cands[bi]!.lab[1], cands[bi]!.lab[2]) && c.lab[0] > 0.7 ? i : bi), 0);
  const used = new Set<number>();
  while (order.length < cands.length) {
    used.add(next);
    const pick = cands[next]!;
    order.push(pick);
    let best = -1;
    let bestD = -1;
    for (let i = 0; i < cands.length; i++) {
      if (used.has(i)) continue;
      minD[i] = Math.min(minD[i]!, deltaE(cands[i]!.lab, pick.lab));
      if (minD[i]! > bestD) { bestD = minD[i]!; best = i; }
    }
    if (best < 0) break;
    next = best;
  }
  palette = order;
  return palette;
}

const cache = new WeakMap<LevelDefinition, Readonly<Record<string, TokenColour>>>();
/**
 * Colour per level symbol (target pieces and decoys). Distinct sequences → distinct palette entries,
 * assigned in sequence order, so the mapping depends only on the puzzle's set of sequences.
 */
export function levelTokenColours(def: LevelDefinition): Readonly<Record<string, TokenColour>> {
  const hit = cache.get(def);
  if (hit) return hit;
  const pal = tokenPalette();
  const entries = Object.entries(def.tokens ?? {}).sort((x, y) => (x[1].seq < y[1].seq ? -1 : x[1].seq > y[1].seq ? 1 : 0));
  const out: Record<string, TokenColour> = {};
  entries.forEach(([sym], i) => { out[sym] = pal[i % pal.length]!; });
  cache.set(def, out);
  return out;
}

/** Colour of a symbol on a token level, or null (single-base levels, CRISPR-created sequences). */
export const tokenColour = (def: LevelDefinition, symbol: string): TokenColour | null => (def.tokens ? (levelTokenColours(def)[symbol] ?? null) : null);
