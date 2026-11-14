/**
 * M4.1 colour system for multi-base tiles, in the clinical pastel register (D-UI-05). Pure and deterministic
 * (no DOM, Date, fetch or Math.random).
 *
 * 1. A fixed candidate set is generated in OKLab/OKLCH (perceptual): every sRGB colour on a lightness ×
 *    chroma × hue grid inside the PASTEL bounds that sits well inside the gamut (soft, never neon), keeps
 *    carbon ink (#111111) at WCAG ≥ 7:1, and stays clear of the light board surfaces.
 * 2. The candidates are ordered by deterministic farthest-point sampling (ΔE_OK); the first CORE_SIZE
 *    entries are then refined for max-min separation and re-ordered so any prefix is a well-spread palette.
 * 3. A puzzle's distinct sequences (target pieces and decoys — symbols are already one-per-sequence) are
 *    sorted by sequence and given palette entries 0…n−1. The same sequence therefore has the same colour
 *    everywhere in that puzzle (board and target strip), and no two sequences share a colour.
 * Every combo uses carbon ink text and a 1px edge in a deeper tone of its own hue. Single-base levels are untouched.
 */
import type { LevelDefinition } from './types.ts';
import { TOKEN_PALETTE } from './tokenPalette.generated.ts';

export interface TokenColour {
  /** Tile / chip background. */
  bg: string;
  /** Border / edge shade of the same hue. */
  border: string;
  /** Carbon ink text on `bg` (WCAG ≥ 7:1). */
  fg: string;
  /** Secondary text (badges, ellipsis) — still ≥ 4.5:1 on `bg`. */
  fgSoft: string;
  /** WCAG contrast ratio of fg on bg. */
  contrast: number;
  /** OKLab coordinates of bg (for distinctness checks). */
  lab: readonly [number, number, number];
}

export const INK = '#111111';
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

/** Pastel register (OKLCH): every combo colour lies inside these bounds. */
export const PASTEL = { minL: 0.72, maxL: 0.95, minC: 0.035, maxC: 0.12, gamutShare: 0.8 } as const;
/** Size of the optimised core palette (≥ the largest number of distinct combos in any puzzle). */
export const CORE_SIZE = 66;
/** Main labels must reach this contrast with carbon ink (WCAG AAA body-text level). */
export const MIN_INK_CONTRAST = 7;

function makeColour(bg: string): TokenColour | null {
  const contrast = contrastRatio(bg, INK);
  if (contrast < MIN_INK_CONTRAST + 0.2) return null; // margin so rounding never dips below the target
  const [L, a, b] = hexToOklab(bg);
  const C = Math.hypot(a, b);
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  // 1px edge: a slightly deeper, slightly richer tone of the same hue.
  let border: string | null = null;
  for (let k = 0; k < 6 && !border; k++) border = oklch(L - 0.2 - k * 0.02, Math.min(C * 1.35, 0.16) * (1 - k * 0.12), h);
  // Secondary text (ellipsis, length badge): ink softened towards the hue but still ≥ 4.5:1.
  let fgSoft = INK;
  for (const t of [0.4, 0.32, 0.24, 0.16]) {
    const mix = rgbToHex(hexToRgb(INK).map((c, i) => c * (1 - t) + hexToRgb(bg)[i]! * t));
    if (contrastRatio(bg, mix) >= MIN_CONTRAST + 0.3) { fgSoft = mix; break; }
  }
  return { bg, border: border ?? '#8a8a84', fg: INK, fgSoft, contrast, lab: [L, a, b] };
}

/**
 * Clinical light surfaces (canvas, panel, stone, hole, hairline rule) and the four single-base pastels a
 * combo colour must stay clear of, so a tile never reads as an empty cell, the board background or a rule.
 */
export const SURFACE_COLOURS = ['#f7f7f5', '#ffffff', '#efefea', '#e8e8e2', '#d4d4ce'] as const;
export const MIN_SURFACE_DELTA = 6;
const SURFACES = SURFACE_COLOURS.map(hexToOklab);

let computed: TokenColour[] | null = null;
/**
 * Build the ordered palette (farthest-point order over the pastel, ink-legible OKLCH grid).
 * Expensive (~seconds on a phone): used only by the generator. Runtime reads the pinned snapshot.
 */
export function computeTokenPalette(): readonly TokenColour[] {
  if (computed) return computed;
  const cands: TokenColour[] = [];
  for (let L = PASTEL.minL; L <= PASTEL.maxL + 1e-9; L += 0.02) for (let C = PASTEL.minC; C <= PASTEL.maxC + 1e-9; C += 0.01) for (let h = 0; h < 360; h += 4) {
    // Soft, not neon: the colour must sit well inside the sRGB gamut at its hue and lightness.
    if (!oklch(L, C / PASTEL.gamutShare, h)) continue;
    const hex = oklch(L, C, h);
    const col = hex && makeColour(hex);
    if (col && !cands.some((x) => x.bg === col.bg) && SURFACES.every((sf) => deltaE(col.lab, sf) >= MIN_SURFACE_DELTA)) cands.push(col);
  }
  // Farthest-point order. Seed: the most chromatic candidate (fixed, deterministic).
  const order: TokenColour[] = [];
  const minD = cands.map(() => Infinity);
  let next = cands.reduce((bi, c, i) => (Math.hypot(c.lab[1], c.lab[2]) > Math.hypot(cands[bi]!.lab[1], cands[bi]!.lab[2]) ? i : bi), 0);
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
  // Refine the first CORE_SIZE entries (max-min ΔE): repeatedly move each core colour to the candidate that
  // is farthest from all other core colours, until no move improves. Deterministic (fixed scan order).
  const core = order.slice(0, CORE_SIZE);
  const nearest = (c: TokenColour, skip: number): number => core.reduce((m, o, j) => (j === skip ? m : Math.min(m, deltaE(c.lab, o.lab))), Infinity);
  for (let pass = 0; pass < 12; pass++) {
    let moved = false;
    for (let k = 0; k < core.length; k++) {
      let best = core[k]!;
      let bestD = nearest(best, k);
      for (const c of cands) {
        if (core.includes(c)) continue;
        const d = nearest(c, k);
        if (d > bestD + 1e-9) { bestD = d; best = c; }
      }
      if (best !== core[k]) { core[k] = best; moved = true; }
    }
    if (!moved) break;
  }
  // Re-order the core by farthest-point sampling (any prefix stays well spread), then append the rest.
  const coreOrder: TokenColour[] = [];
  const left = [...core];
  let seed = left.reduce((bi, c, i) => (Math.hypot(c.lab[1], c.lab[2]) > Math.hypot(left[bi]!.lab[1], left[bi]!.lab[2]) ? i : bi), 0);
  while (left.length) {
    coreOrder.push(left.splice(seed, 1)[0]!);
    let bd = -1;
    seed = 0;
    left.forEach((c, i) => { const d = Math.min(...coreOrder.map((o) => deltaE(c.lab, o.lab))); if (d > bd) { bd = d; seed = i; } });
  }
  computed = [...coreOrder, ...order.filter((c) => !core.includes(c))];
  return computed;
}

/** Pinned palette shipped with the build (D-M4-18). First token-level load must not compute this. */
export function tokenPalette(): readonly TokenColour[] {
  return TOKEN_PALETTE;
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
