import { describe, it, expect } from 'vitest';
import { WEAPONS, getWeapon } from './Weapons.js';

describe('weapons config', () => {
  it('defines all 4 weapons', () => {
    expect(Object.keys(WEAPONS).sort()).toEqual(['pistol', 'shotgun', 'smg', 'sniper']);
  });
  it('pistol has infinite reserve flag', () => {
    expect(WEAPONS.pistol.infiniteReserve).toBe(true);
  });
  it('sniper deals 80 damage', () => {
    expect(WEAPONS.sniper.damage).toBe(80);
  });
  it('shotgun fires 5 pellets', () => {
    expect(WEAPONS.shotgun.pellets).toBe(5);
  });
  it('getWeapon returns same object as direct lookup', () => {
    expect(getWeapon('smg')).toBe(WEAPONS.smg);
  });
  it('getWeapon throws on unknown', () => {
    expect(() => getWeapon('rocket')).toThrow();
  });
});
