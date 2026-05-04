import { describe, it, expect } from 'vitest';
import { MovementSystem } from './MovementSystem';
import type { TerrainCell } from '../render/TilemapBuilder';

function cell(level: number, walkable = true, stair = false): TerrainCell {
  return { level, walkable, buildable: false, stair, water: !walkable, bridge: false, tileKind: 'flat' };
}

const W = cell(0);
const X = cell(0, false);
const H = cell(1);
const S = cell(1, true, true); // stair tile sits at the high-side level by convention

describe('MovementSystem.canEnterTile', () => {
  it('allows same-level moves', () => {
    const grid = [[W, W]];
    const m = new MovementSystem(grid);
    expect(m.canEnterTile(0, 0, 1, 0)).toBe(true);
  });

  it('blocks 1-tier cliff without stair', () => {
    const grid = [[W, H]];
    const m = new MovementSystem(grid);
    expect(m.canEnterTile(0, 0, 1, 0)).toBe(false);
  });

  it('allows 1-tier transition through a stair', () => {
    const grid = [[W, S]];
    const m = new MovementSystem(grid);
    expect(m.canEnterTile(0, 0, 1, 0)).toBe(true);
    expect(m.canEnterTile(1, 0, 0, 0)).toBe(true);
  });

  it('blocks unwalkable target', () => {
    const grid = [[W, X]];
    const m = new MovementSystem(grid);
    expect(m.canEnterTile(0, 0, 1, 0)).toBe(false);
  });
});

describe('MovementSystem.findPath', () => {
  it('returns straight path on flat terrain', () => {
    const grid = [[W, W, W, W]];
    const m = new MovementSystem(grid);
    const path = m.findPath(0, 0, 3, 0);
    expect(path).not.toBeNull();
    expect(path!.length).toBe(4);
    expect(path![3]).toEqual({ tx: 3, ty: 0 });
  });

  it('routes around a cliff via a stair', () => {
    const grid: TerrainCell[][] = [
      [W, H, W],
      [W, S, W],
      [W, H, W],
    ];
    const m = new MovementSystem(grid);
    const path = m.findPath(0, 0, 2, 0);
    expect(path).not.toBeNull();
    expect(path!.some(p => p.tx === 1 && p.ty === 1)).toBe(true);
  });

  it('returns null when unreachable', () => {
    const grid: TerrainCell[][] = [
      [W, H, W],
      [W, H, W],
      [W, H, W],
    ];
    const m = new MovementSystem(grid);
    expect(m.findPath(0, 0, 2, 0)).toBeNull();
  });
});

describe('MovementSystem.isReachable', () => {
  it('matches A* result for reachable case', () => {
    const grid = [[W, W, W]];
    const m = new MovementSystem(grid);
    expect(m.isReachable(0, 0, 2, 0)).toBe(true);
  });

  it('returns false when path is null', () => {
    const grid = [[W, X, W]];
    const m = new MovementSystem(grid);
    expect(m.isReachable(0, 0, 2, 0)).toBe(false);
  });
});
