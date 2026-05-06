import { describe, it, expect } from 'vitest';
import { Bot } from './Bot.js';

function dummyMatch(overrides = {}) {
  return {
    players: {
      A: { id:'A', x:100, y:100, hp:100, dead:false, weapon:'pistol', aim:0, ammo:12, ...overrides.A },
      B: { id:'B', x:300, y:100, hp:100, dead:false, weapon:'pistol', aim:0, ammo:12, ...overrides.B },
    },
    pickups: [{ id:1, kind:'shotgun', x:200, y:200, available:true }],
  };
}

describe('Bot', () => {
  it('produces an INPUT-shaped message each tick', () => {
    const b = new Bot({ slot: 'B', difficulty: 'normal' });
    const inp = b.decide(dummyMatch(), 1/30);
    expect(inp).toHaveProperty('mv');
    expect(inp).toHaveProperty('aim');
    expect(typeof inp.fire).toBe('boolean');
  });

  it('engages: aims toward enemy when in line of sight', () => {
    const b = new Bot({ slot: 'B', difficulty: 'hard' });
    const m = dummyMatch();
    for (let i = 0; i < 10; i++) b.decide(m, 1/30);
    const inp = b.decide(m, 1/30);
    // Enemy is to the left of B → aim near π
    expect(Math.abs(inp.aim - Math.PI)).toBeLessThan(0.5);
  });

  it('flees when low HP toward pickup', () => {
    const b = new Bot({ slot: 'B', difficulty: 'normal' });
    const m = dummyMatch({ B: { hp: 20 } });
    const inp = b.decide(m, 1/30);
    // Pickup is south-west of B, mv should be toward (200,200) — west and south
    expect(inp.mv.x).toBeLessThan(0.1);
    expect(inp.mv.y).toBeGreaterThan(0.1);
  });

  it('easy difficulty has higher reaction lag (delays first shot)', () => {
    const easy = new Bot({ slot: 'B', difficulty: 'easy' });
    const m = dummyMatch();
    let fired = false;
    for (let i = 0; i < 5; i++) {
      const inp = easy.decide(m, 1/30);
      if (inp.fire) fired = true;
    }
    expect(fired).toBe(false);
  });
});
