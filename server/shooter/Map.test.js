import { describe, it, expect } from 'vitest';
import { MAP, isInsideWall, clampToBounds, MAP_WIDTH, MAP_HEIGHT } from './Map.js';

describe('shooter map', () => {
  it('has expected dimensions', () => {
    expect(MAP_WIDTH).toBe(2880);
    expect(MAP_HEIGHT).toBe(1920);
  });
  it('has exactly 2 spawn points', () => {
    expect(MAP.spawns.length).toBe(2);
  });
  it('has exactly 3 pickup spawns', () => {
    expect(MAP.pickupSpawns.length).toBe(3);
    const kinds = MAP.pickupSpawns.map(p => p.kind).sort();
    expect(kinds).toEqual(['shotgun', 'smg', 'sniper']);
  });
  it('isInsideWall detects a wall point', () => {
    const w = MAP.walls[0];
    expect(isInsideWall(w.x + 1, w.y + 1, 0)).toBe(true);
  });
  it('isInsideWall returns false for spawn points', () => {
    for (const s of MAP.spawns) {
      expect(isInsideWall(s.x, s.y, 16)).toBe(false);
    }
  });
  it('clampToBounds keeps point inside map', () => {
    expect(clampToBounds(-50, 5000, 16)).toEqual({ x: 16, y: MAP_HEIGHT - 16 });
  });
});
