import { describe, it, expect } from 'vitest';
import { Match } from './Match.js';

function setup() {
  const m = new Match({
    matchId: 'M', code: 'ABCD',
    p1: { id: 'A', name: 'A' },
    p2: { id: 'B', name: 'B' },
  });
  m.players.A.x = 400; m.players.A.y = 400; m.players.A.aim = 0;
  m.players.B.x = 600; m.players.B.y = 400;
  return m;
}

describe('Match — combat', () => {
  it('firing creates a bullet with correct owner and direction', () => {
    const m = setup();
    m.applyInput('A', { seq: 1, mv: { x:0, y:0 }, aim: 0, fire: true, swap: false, reload: false });
    m.tick(1/30);
    expect(m.bullets.length).toBe(1);
    expect(m.bullets[0].owner).toBe('A');
    expect(m.bullets[0].vx).toBeGreaterThan(0);
  });

  it('bullets travel and damage on hit', () => {
    const m = setup();
    m.applyInput('A', { seq: 1, mv: { x:0, y:0 }, aim: 0, fire: true, swap: false, reload: false });
    m.tick(1/30);
    for (let i = 0; i < 30; i++) m.tick(1/30);
    expect(m.players.B.hp).toBeLessThan(100);
  });

  it('pistol fire rate respected (only one bullet per tick when held)', () => {
    const m = setup();
    for (let s = 1; s <= 3; s++) {
      m.applyInput('A', { seq: s, mv:{x:0,y:0}, aim:0, fire:true, swap:false, reload:false });
      m.tick(1/30);
    }
    expect(m.bullets.length).toBe(1);
  });

  it('bullets stop on wall', async () => {
    const { MAP_HEIGHT } = await import('./Map.js');
    const m = setup();
    m.players.A.x = 100; m.players.A.y = MAP_HEIGHT / 2; m.players.A.aim = 0;
    m.applyInput('A', { seq: 1, mv:{x:0,y:0}, aim:0, fire:true, swap:false, reload:false });
    m.tick(1/30);
    for (let i = 0; i < 200; i++) m.tick(1/30);
    expect(m.bullets.length).toBe(0);
    expect(m.players.B.hp).toBe(100);
  });

  it('shotgun spawns 5 pellets', () => {
    const m = setup();
    m.players.A.weapon = 'shotgun';
    m.players.A.ammo = 6;
    m.applyInput('A', { seq: 1, mv:{x:0,y:0}, aim:0, fire:true, swap:false, reload:false });
    m.tick(1/30);
    expect(m.bullets.length).toBe(5);
  });
});
