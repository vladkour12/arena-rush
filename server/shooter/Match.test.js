import { describe, it, expect } from 'vitest';
import { Match } from './Match.js';

function newMatch() {
  return new Match({
    matchId: 'M1',
    code: 'ABCD',
    p1: { id: 'A', name: 'Alice', isBot: false },
    p2: { id: 'B', name: 'Bob',   isBot: false },
  });
}

describe('Match — state and movement', () => {
  it('initializes both players at the spawn points', () => {
    const m = newMatch();
    const A = m.players.A, B = m.players.B;
    expect(A.hp).toBe(100);
    expect(B.hp).toBe(100);
    expect(A.weapon).toBe('pistol');
    expect(A.x).toBeGreaterThan(0);
    expect(A.x).not.toBe(B.x);
  });

  it('applyInput then tick moves the player', () => {
    const m = newMatch();
    const startX = m.players.A.x;
    m.applyInput('A', { seq: 1, mv: { x: 1, y: 0 }, aim: 0, fire: false, swap: false, reload: false });
    m.tick(1 / 30);
    expect(m.players.A.x).toBeGreaterThan(startX);
    expect(m.players.A.lastAckSeq).toBe(1);
  });

  it('movement is clamped by walls', () => {
    const m = newMatch();
    m.players.A.x = 200; m.players.A.y = 32;
    m.applyInput('A', { seq: 1, mv: { x: 0, y: -1 }, aim: 0, fire: false, swap: false, reload: false });
    m.tick(1 / 30);
    expect(m.players.A.y).toBeGreaterThanOrEqual(16);
  });

  it('mv vector is normalized so diagonal isn’t faster', () => {
    const m = newMatch();
    const startX = m.players.A.x;
    m.applyInput('A', { seq: 1, mv: { x: 1, y: 1 }, aim: 0, fire: false, swap: false, reload: false });
    m.tick(1 / 30);
    const dx = m.players.A.x - startX;
    expect(dx).toBeLessThan(6.7 / Math.SQRT2 + 0.01);
  });

  it('rejects out-of-order inputs', () => {
    const m = newMatch();
    m.applyInput('A', { seq: 5, mv: { x: 0, y: 0 }, aim: 0, fire: false, swap: false, reload: false });
    m.applyInput('A', { seq: 3, mv: { x: 1, y: 0 }, aim: 0, fire: false, swap: false, reload: false });
    m.tick(1 / 30);
    expect(m.players.A.lastAckSeq).toBe(5);
  });
});
