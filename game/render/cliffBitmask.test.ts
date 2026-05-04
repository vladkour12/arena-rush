import { describe, it, expect } from 'vitest';
import { edgeBitmaskToFrame, computeEdgeBitmask } from './cliffBitmask';

describe('computeEdgeBitmask', () => {
  it('returns 0 for a cell whose 4 neighbors are at the same level (interior plateau)', () => {
    const levelAt = (_tx: number, _ty: number) => 1;
    expect(computeEdgeBitmask(5, 5, 1, levelAt)).toBe(0);
  });

  it('sets the N bit when the north neighbor is lower', () => {
    const levelAt = (tx: number, ty: number) => (ty === 4 ? 0 : 1);
    expect(computeEdgeBitmask(5, 5, 1, levelAt)).toBe(1);
  });

  it('sets all 4 bits for an isolated peak', () => {
    const levelAt = (tx: number, ty: number) => (tx === 5 && ty === 5 ? 1 : 0);
    expect(computeEdgeBitmask(5, 5, 1, levelAt)).toBe(15);
  });

  it('treats out-of-bounds neighbors as lower (so map-edge hills get cliff frames)', () => {
    const levelAt = (_tx: number, _ty: number) => 1;
    expect(computeEdgeBitmask(0, 0, 1, levelAt)).toBe(1 | 8); // N + W bits
  });
});

describe('edgeBitmaskToFrame', () => {
  it('returns a non-negative tile index for every mask 0..15', () => {
    for (let mask = 0; mask < 16; mask++) {
      expect(edgeBitmaskToFrame[mask]).toBeGreaterThanOrEqual(0);
    }
  });
});
