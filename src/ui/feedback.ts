/**
 * Optional sound and haptics. Sound is synthesised locally with the Web Audio API (no files, no
 * network); haptics use navigator.vibrate where the browser supports it (not iOS Safari). Both are
 * fire-and-forget side effects that run after the engine has committed a state.
 */
export type Cue = 'move' | 'reject' | 'power' | 'release' | 'expire' | 'energy' | 'win' | 'undo';

const VIBRATE: Record<Cue, number | number[]> = {
  move: 8, reject: [12, 40, 12], power: 25, release: 10, expire: [10, 30, 10], energy: 15, win: [30, 50, 30, 50, 60], undo: 6,
};

/** Notes as [frequency Hz, start s, duration s]. Quiet, short, no harsh tones. */
const NOTES: Record<Cue, [number, number, number][]> = {
  move: [[520, 0, 0.05]],
  undo: [[400, 0, 0.05]],
  reject: [[180, 0, 0.08], [150, 0.09, 0.08]],
  power: [[660, 0, 0.07], [880, 0.06, 0.09], [1320, 0.13, 0.08]],
  release: [[700, 0, 0.05], [500, 0.05, 0.06]],
  expire: [[600, 0, 0.06], [450, 0.07, 0.08]],
  energy: [[990, 0, 0.06], [1320, 0.05, 0.08]],
  win: [[523, 0, 0.14], [659, 0.1, 0.14], [784, 0.2, 0.16], [1047, 0.32, 0.3]],
};

export const hapticsSupported = (): boolean => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    const AC = (globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function playCue(cue: Cue, opts: { sound: boolean; haptics: boolean }): void {
  if (opts.haptics && hapticsSupported()) {
    try {
      navigator.vibrate(VIBRATE[cue]);
    } catch {
      /* ignore */
    }
  }
  if (!opts.sound) return;
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + 0.005;
  for (const [f, start, dur] of NOTES[cue]) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = cue === 'reject' ? 'triangle' : 'sine';
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0.0001, t0 + start);
    gain.gain.exponentialRampToValueAtTime(0.12, t0 + start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0 + start);
    osc.stop(t0 + start + dur + 0.02);
  }
}
