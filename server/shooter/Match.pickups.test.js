import { describe, it, expect } from 'vitest';
import { Match } from './Match.js';

function setup() {
  return new Match({
    matchId: 'M', code: 'ABCD',
    p1: { id: 'A', name: 'A' },
    p2: { id: 'B', name: 'B' },
  });
}

describe('Match — pickups', () => {
  it('walking onto a pickup grants weapon and emits PICKUP event', () => {
    const m = setup();
    const pu = m.pickups[0]; // shotgun pickup
    m.players.A.x = pu.x; m.players.A.y = pu.y;
    m.tick(1/30);
    expect(m.players.A.weapon).toBe(pu.kind);
    expect(m.players.A.pickupWeapon).toBe('shotgun');
    expect(m.pickups[0].available).toBe(false);
    expect(m.events.some(e => e.t === 'PICKUP' && e.player === 'A')).toBe(true);
  });

  it('pickup respawns after 15s', () => {
    const m = setup();
    const pu = m.pickups[0];
    m.players.A.x = pu.x; m.players.A.y = pu.y;
    m.tick(1/30);
    expect(m.pickups[0].available).toBe(false);
    m.pickups[0].respawnAt = Date.now() - 100;
    m.tick(1/30);
    expect(m.pickups[0].available).toBe(true);
  });

  it('replacing pickup weapon via second pickup swaps current to backup', () => {
    const m = setup();
    m.players.A.x = m.pickups[0].x; m.players.A.y = m.pickups[0].y;
    m.tick(1/30);
    expect(m.players.A.weapon).toBe('shotgun');
    const smgPickup = m.pickups.find(p => p.kind === 'smg');
    smgPickup.available = true;
    m.players.A.x = smgPickup.x; m.players.A.y = smgPickup.y;
    m.tick(1/30);
    expect(m.players.A.weapon).toBe('smg');
  });

  it('drops pickup weapon as temp pickup on death (8s ttl)', () => {
    const m = setup();
    m.players.A.weapon = 'shotgun'; m.players.A.pickupWeapon = 'shotgun';
    m.players.A.x = 500; m.players.A.y = 500;
    m._damage(m.players.A, 999, 'B', 'pistol');
    expect(m.pickups.find(p => p.kind === 'shotgun' && p.temporary)).toBeTruthy();
  });

  it('does not drop pistol on death', () => {
    const m = setup();
    m.players.A.weapon = 'pistol'; m.players.A.pickupWeapon = null;
    m._damage(m.players.A, 999, 'B', 'pistol');
    const tempPickups = m.pickups.filter(p => p.temporary);
    expect(tempPickups.length).toBe(0);
  });

  it('temp pickup expires after 8s', () => {
    const m = setup();
    m.players.A.weapon = 'shotgun'; m.players.A.pickupWeapon = 'shotgun';
    m._damage(m.players.A, 999, 'B', 'pistol');
    const temp = m.pickups.find(p => p.temporary);
    temp.expiresAt = Date.now() - 100;
    m.tick(1/30);
    expect(m.pickups.find(p => p.id === temp.id)).toBeUndefined();
  });
});
