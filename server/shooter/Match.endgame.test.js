import { describe, it, expect } from 'vitest';
import { Match } from './Match.js';

function setup() {
  return new Match({
    matchId: 'M', code: 'ABCD',
    p1: { id: 'A', name: 'A' },
    p2: { id: 'B', name: 'B' },
  });
}

describe('Match — respawn and end conditions', () => {
  it('respawns player after 2s', () => {
    const m = setup();
    m.players.A.hp = 0; m.players.A.dead = true; m.players.A.respawnAt = Date.now() - 100;
    m.tick(1/30);
    expect(m.players.A.dead).toBe(false);
    expect(m.players.A.hp).toBe(100);
  });

  it('respawn picks the spawn far from enemy', () => {
    const m = setup();
    m.players.B.x = 128; m.players.B.y = 128;
    m.players.A.dead = true; m.players.A.hp = 0; m.players.A.respawnAt = Date.now() - 100;
    m.tick(1/30);
    expect(m.players.A.x).toBeGreaterThan(1000);
  });

  it('match ends when score hits 10', () => {
    const m = setup();
    m.score.A = 10;
    m.tick(1/30);
    expect(m.endedAt).not.toBeNull();
    expect(m.endReason).toBe('score');
    expect(m.winnerId).toBe('A');
  });

  it('match ends on timer with higher-score winner', () => {
    const m = setup();
    m.score.A = 5; m.score.B = 3;
    m.startedAt = Date.now() - 6 * 60 * 1000;
    m.tick(1/30);
    expect(m.endedAt).not.toBeNull();
    expect(m.endReason).toBe('timeout');
    expect(m.winnerId).toBe('A');
  });

  it('tied at timeout enters sudden death (winner stays null until next kill)', () => {
    const m = setup();
    m.score.A = 4; m.score.B = 4;
    m.startedAt = Date.now() - 6 * 60 * 1000;
    m.tick(1/30);
    expect(m.endReason).toBe(null);
    expect(m.suddenDeath).toBe(true);
  });
});
