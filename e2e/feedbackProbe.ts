import type { Page } from '@playwright/test';

type Probe = { notes: number[]; vibration: (number | number[])[] };
type ProbeWindow = Window & { __feedback: Probe };

/** Observe the real Web Audio and Vibration API calls without depending on host speakers. */
export async function installFeedbackProbe(page: Page) {
  await page.addInitScript(() => {
    const w = window as ProbeWindow;
    w.__feedback = { notes: [], vibration: [] };
    class MockAudioContext {
      currentTime = 0;
      state = 'running';
      destination = {};
      resume() { return Promise.resolve(); }
      createOscillator() {
        const osc = { type: 'sine', frequency: { value: 0 }, connect: (node: unknown) => node,
          start: () => w.__feedback.notes.push(osc.frequency.value), stop: () => undefined };
        return osc;
      }
      createGain() {
        return { gain: { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined },
          connect: (node: unknown) => node };
      }
    }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: MockAudioContext });
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (pattern: number | number[]) => {
      w.__feedback.vibration.push(pattern); return true;
    } });
  });
}
export const feedbackLog = (page: Page) => page.evaluate(() => (window as ProbeWindow).__feedback);
export const clearFeedback = (page: Page) => page.evaluate(() => { (window as ProbeWindow).__feedback = { notes: [], vibration: [] }; });
