import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShooterClient } from './ShooterClient';

class MockWS {
  static OPEN = 1;
  readyState = 1;
  sent: any[] = [];
  onopen?: () => void;
  onmessage?: (e: { data: string }) => void;
  onclose?: () => void;
  send(s: string) { this.sent.push(JSON.parse(s)); }
  close() { this.readyState = 3; this.onclose?.(); }
}

describe('ShooterClient', () => {
  let mock: MockWS;
  beforeEach(() => {
    mock = new MockWS();
    (globalThis as any).WebSocket = vi.fn(() => mock) as any;
  });

  it('sends JOIN_MATCH on open', () => {
    const c = new ShooterClient({ url: 'ws://x', code: 'ABCD', playerId: 'u1', name: 'Alice' });
    c.connect();
    mock.onopen?.();
    expect(mock.sent[0].t).toBe('JOIN_MATCH');
    expect(mock.sent[0].code).toBe('ABCD');
  });

  it('sendInput packages INPUT message with seq', () => {
    const c = new ShooterClient({ url: 'ws://x', code: 'ABCD', playerId: 'u1', name: 'Alice' });
    c.connect();
    mock.onopen?.();
    mock.sent.length = 0;
    c.sendInput({ mv: { x: 1, y: 0 }, aim: 0, fire: false, swap: false, reload: false });
    expect(mock.sent[0].t).toBe('INPUT');
    expect(mock.sent[0].seq).toBe(1);
  });

  it('emits "snap" event on SNAP message', () => {
    const c = new ShooterClient({ url: 'ws://x', code: 'ABCD', playerId: 'u1', name: 'Alice' });
    const handler = vi.fn();
    c.on('snap', handler);
    c.connect();
    mock.onopen?.();
    mock.onmessage?.({ data: JSON.stringify({ t: 'SNAP', tick: 1, ackSeq: 0, players: [], bullets: [], pickups: [], score: {}, timeLeftMs: 0 }) });
    expect(handler).toHaveBeenCalled();
  });
});
