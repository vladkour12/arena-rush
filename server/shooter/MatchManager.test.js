import { describe, it, expect, beforeEach } from 'vitest';
import { MatchManager } from './MatchManager.js';

describe('MatchManager', () => {
  let mgr;
  beforeEach(() => { mgr = new MatchManager({ maxConcurrent: 4 }); });

  it('createRoom returns a 4-letter code from the safe alphabet', () => {
    const r = mgr.createRoom({ hostId: 'H1', hostName: 'Alice' });
    expect(r.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
    expect(r.hostId).toBe('H1');
  });

  it('joinRoom adds a guest', () => {
    const r = mgr.createRoom({ hostId: 'H1', hostName: 'Alice' });
    const j = mgr.joinRoom(r.code, { guestId: 'G1', guestName: 'Bob' });
    expect(j.ok).toBe(true);
    expect(mgr.getRoom(r.code).guestId).toBe('G1');
  });

  it('joinRoom returns full when 2 already present', () => {
    const r = mgr.createRoom({ hostId: 'H1', hostName: 'Alice' });
    mgr.joinRoom(r.code, { guestId: 'G1', guestName: 'Bob' });
    const second = mgr.joinRoom(r.code, { guestId: 'G2', guestName: 'Eve' });
    expect(second.ok).toBe(false);
    expect(second.reason).toBe('full');
  });

  it('joinRoom returns not_found for unknown code', () => {
    const r = mgr.joinRoom('ZZZZ', { guestId: 'G1', guestName: 'Bob' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('not_found');
  });

  it('refuses creation when over maxConcurrent', () => {
    const small = new MatchManager({ maxConcurrent: 1 });
    small.createRoom({ hostId: 'H1', hostName: 'A' });
    expect(() => small.createRoom({ hostId: 'H2', hostName: 'B' })).toThrow(/busy/i);
  });

  it('removeRoom deletes by code', () => {
    const r = mgr.createRoom({ hostId: 'H1', hostName: 'A' });
    mgr.removeRoom(r.code);
    expect(mgr.getRoom(r.code)).toBeUndefined();
  });

  it('expireWaitingRooms removes rooms older than ttl in waiting state', () => {
    const r = mgr.createRoom({ hostId: 'H1', hostName: 'A' });
    mgr.getRoom(r.code).createdAt = Date.now() - 6 * 60 * 1000;
    mgr.expireWaitingRooms();
    expect(mgr.getRoom(r.code)).toBeUndefined();
  });
});
