import { describe, expect, it } from 'vitest';
import { lockAxis, nearestStep, releaseVelocity, resolveSteps, wrapOffset, AXIS_LOCK_PX } from '../../src/ui/dragMath.ts';

describe('drag maths', () => {
  it('locks the axis only after the threshold, by dominant direction', () => {
    expect(lockAxis(AXIS_LOCK_PX - 1, 0)).toBeNull();
    expect(lockAxis(10, 3)).toBe('row');
    expect(lockAxis(-2, -12)).toBe('col');
  });
  it('snaps to the nearest whole cell, symmetrically', () => {
    expect(nearestStep(0, 40)).toBe(0);
    expect(nearestStep(19, 40)).toBe(0);
    expect(nearestStep(21, 40)).toBe(1);
    expect(nearestStep(-21, 40)).toBe(-1);
    expect(nearestStep(130, 40)).toBe(3);
    expect(nearestStep(-150, 40)).toBe(-4);
  });
  it('a quick short flick commits one step; slow short drags and long drags get no bonus', () => {
    expect(resolveSteps(14, 40, 0.9)).toBe(1);
    expect(resolveSteps(-14, 40, -0.9)).toBe(-1);
    expect(resolveSteps(14, 40, 0.1)).toBe(0);
    expect(resolveSteps(14, 40, -0.9)).toBe(0);
    expect(resolveSteps(85, 40, 2)).toBe(2);
    expect(resolveSteps(4, 40, 3)).toBe(0);
  });
  it('measures release velocity over the recent window', () => {
    expect(releaseVelocity([])).toBe(0);
    expect(releaseVelocity([{ t: 0, d: 0 }, { t: 500, d: 10 }, { t: 550, d: 60 }])).toBeCloseTo(1);
  });
  it('wraps positions into the strip', () => {
    expect(wrapOffset(-10, 100)).toBe(90);
    expect(wrapOffset(250, 100)).toBe(50);
  });
});
