import { describe, it, expect, vi } from 'vitest';
import { GameLoop } from './GameLoop.js';

function fakeMatch() {
  return {
    tickCount: 0,
    endedAt: null,
    events: [],
    tick: vi.fn(function () { this.tickCount++; }),
    serializeSnapshot: vi.fn(function () {
      return { tick: this.tickCount, players: [], bullets: [], pickups: [], score: {A:0,B:0}, timeLeftMs: 0 };
    }),
  };
}

describe('GameLoop', () => {
  it('calls tick at ~30Hz and snapshot at ~20Hz over 1 second', () => {
    vi.useFakeTimers();
    const m = fakeMatch();
    const sent = [];
    const loop = new GameLoop({
      match: m,
      onSnapshot: snap => sent.push(snap),
      onEvent: () => {},
    });
    loop.start();
    vi.advanceTimersByTime(1000);
    loop.stop();
    expect(m.tick.mock.calls.length).toBeGreaterThanOrEqual(28);
    expect(m.tick.mock.calls.length).toBeLessThanOrEqual(32);
    expect(sent.length).toBeGreaterThanOrEqual(18);
    expect(sent.length).toBeLessThanOrEqual(22);
    vi.useRealTimers();
  });

  it('flushes events through onEvent', () => {
    vi.useFakeTimers();
    const m = fakeMatch();
    m.tick = function () { this.events = [{ t: 'KILL', killer: 'A', victim: 'B' }]; };
    const events = [];
    const loop = new GameLoop({ match: m, onSnapshot: () => {}, onEvent: e => events.push(e) });
    loop.start();
    vi.advanceTimersByTime(50);
    loop.stop();
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].t).toBe('KILL');
    vi.useRealTimers();
  });
});
