/** Pure maths for continuous segment dragging (no DOM). */

/** Movement (px) before the gesture locks to the row or column axis. */
export const AXIS_LOCK_PX = 8;
/** A release faster than this (px/ms) that hasn't reached half a cell still commits one step. */
export const FLICK_VELOCITY = 0.45;
/** Snap/settle animation length. */
export const SNAP_MS = 110;

export function lockAxis(dx: number, dy: number): 'row' | 'col' | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_LOCK_PX) return null;
  return Math.abs(dx) >= Math.abs(dy) ? 'row' : 'col';
}

/** Nearest whole cell offset, symmetric around zero (−0.5 → −1, like +0.5 → +1). */
export function nearestStep(deltaPx: number, pitch: number): number {
  if (pitch <= 0) return 0;
  const r = Math.round(Math.abs(deltaPx) / pitch);
  return r === 0 ? 0 : Math.sign(deltaPx) * r;
}

/**
 * Steps to commit on release: snap to the nearest whole cell; a quick flick that has not yet
 * reached half a cell still moves exactly one step in the flick direction. Long drags never get
 * a velocity bonus, so a deliberate placement is never overshot.
 */
export function resolveSteps(deltaPx: number, pitch: number, velocityPxPerMs: number): number {
  const k = nearestStep(deltaPx, pitch);
  if (k !== 0) return k;
  const flick = Math.abs(velocityPxPerMs) >= FLICK_VELOCITY && Math.abs(deltaPx) >= AXIS_LOCK_PX && Math.sign(velocityPxPerMs) === Math.sign(deltaPx);
  return flick ? Math.sign(deltaPx) : 0;
}

/** Velocity over the most recent `windowMs` of samples (px/ms). */
export function releaseVelocity(samples: readonly { t: number; d: number }[], windowMs = 90): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1]!;
  let first = samples[0]!;
  for (const s of samples) if (last.t - s.t <= windowMs) { first = s; break; }
  const dt = last.t - first.t;
  return dt > 0 ? (last.d - first.d) / dt : 0;
}

/** Position of a tile inside a wrapping strip of `length` px. */
export const wrapOffset = (pos: number, length: number): number => ((pos % length) + length) % length;

export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
