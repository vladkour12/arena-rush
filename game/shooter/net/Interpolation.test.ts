import { describe, it, expect } from 'vitest';
import { Interpolation } from './Interpolation';

describe('Interpolation', () => {
  it('returns single snapshot value when only one stored', () => {
    const buf = new Interpolation({ delayMs: 100 });
    buf.push({ serverTime: 1000, x: 50, y: 50 });
    expect(buf.getAt(1100)).toEqual({ x: 50, y: 50 });
  });

  it('lerps between two snapshots at the render time', () => {
    const buf = new Interpolation({ delayMs: 100 });
    buf.push({ serverTime: 1000, x: 0, y: 0 });
    buf.push({ serverTime: 1100, x: 100, y: 0 });
    expect(buf.getAt(1100)).toEqual({ x: 0, y: 0 });
    const r = buf.getAt(1150)!;
    expect(r.x).toBeCloseTo(50, 1);
  });

  it('drops snapshots older than delay window', () => {
    const buf = new Interpolation({ delayMs: 100 });
    for (let t = 0; t < 1000; t += 50) buf.push({ serverTime: t, x: t / 10, y: 0 });
    expect(buf.size()).toBeLessThan(10);
  });
});
