export type LevelAt = (tx: number, ty: number) => number;

export function computeEdgeBitmask(
  tx: number,
  ty: number,
  cellLevel: number,
  levelAt: LevelAt,
): number {
  let mask = 0;
  if (sampleLevel(tx,     ty - 1, levelAt) < cellLevel) mask |= 1;
  if (sampleLevel(tx + 1, ty,     levelAt) < cellLevel) mask |= 2;
  if (sampleLevel(tx,     ty + 1, levelAt) < cellLevel) mask |= 4;
  if (sampleLevel(tx - 1, ty,     levelAt) < cellLevel) mask |= 8;
  return mask;
}

function sampleLevel(tx: number, ty: number, levelAt: LevelAt): number {
  if (tx < 0 || ty < 0) return 0;
  return levelAt(tx, ty);
}

export const edgeBitmaskToFrame: readonly number[] = [
  0,   // 0000 — interior plateau
  1,   // 0001 — N edge
  2,   // 0010 — E edge
  5,   // 0011 — NE corner
  3,   // 0100 — S edge
  16,  // 0101 — N+S strip (rare)
  6,   // 0110 — SE corner
  9,   // 0111 — N+E+S
  4,   // 1000 — W edge
  7,   // 1001 — NW corner
  17,  // 1010 — E+W strip
  10,  // 1011 — N+E+W
  8,   // 1100 — SW corner
  11,  // 1101 — S+W+N
  12,  // 1110 — S+E+W
  13,  // 1111 — isolated peak
];
