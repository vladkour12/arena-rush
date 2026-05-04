import type { TerrainCell } from '../render/TilemapBuilder';

export interface TilePoint { tx: number; ty: number; }

export class MovementSystem {
  private grid: TerrainCell[][];
  private rows: number;
  private cols: number;

  constructor(grid: TerrainCell[][]) {
    this.grid = grid;
    this.rows = grid.length;
    this.cols = this.rows > 0 ? grid[0].length : 0;
  }

  canEnterTile(fromTx: number, fromTy: number, toTx: number, toTy: number): boolean {
    if (toTx < 0 || toTy < 0 || toTx >= this.cols || toTy >= this.rows) return false;
    const a = this.grid[fromTy]?.[fromTx];
    const b = this.grid[toTy][toTx];
    if (!a || !b) return false;
    if (!b.walkable) return false;
    if (a.level === b.level) return true;
    if (Math.abs(a.level - b.level) !== 1) return false;
    return a.stair || b.stair;
  }

  isReachable(fromTx: number, fromTy: number, toTx: number, toTy: number): boolean {
    return this.findPath(fromTx, fromTy, toTx, toTy) !== null;
  }

  findPath(fromTx: number, fromTy: number, toTx: number, toTy: number): TilePoint[] | null {
    if (!this.inBounds(fromTx, fromTy) || !this.inBounds(toTx, toTy)) return null;
    if (!this.grid[toTy][toTx].walkable) return null;

    const startKey = key(fromTx, fromTy);
    const goalKey = key(toTx, toTy);

    const open = new MinHeap();
    open.push({ key: startKey, tx: fromTx, ty: fromTy, g: 0, f: heuristic(fromTx, fromTy, toTx, toTy) });

    const cameFrom = new Map<string, string>();
    const gScore = new Map<string, number>();
    gScore.set(startKey, 0);

    while (!open.isEmpty()) {
      const cur = open.pop()!;
      if (cur.key === goalKey) return reconstruct(cameFrom, cur.key);

      for (const [dx, dy, cost] of NEIGHBORS) {
        const nx = cur.tx + dx, ny = cur.ty + dy;
        if (!this.canEnterTile(cur.tx, cur.ty, nx, ny)) continue;
        if (dx !== 0 && dy !== 0) {
          if (!this.canEnterTile(cur.tx, cur.ty, cur.tx + dx, cur.ty)) continue;
          if (!this.canEnterTile(cur.tx, cur.ty, cur.tx, cur.ty + dy)) continue;
        }
        const tentative = cur.g + cost;
        const nKey = key(nx, ny);
        if (tentative >= (gScore.get(nKey) ?? Infinity)) continue;
        gScore.set(nKey, tentative);
        cameFrom.set(nKey, cur.key);
        open.push({ key: nKey, tx: nx, ty: ny, g: tentative, f: tentative + heuristic(nx, ny, toTx, toTy) });
      }
    }
    return null;
  }

  setGrid(grid: TerrainCell[][]): void {
    this.grid = grid;
    this.rows = grid.length;
    this.cols = this.rows > 0 ? grid[0].length : 0;
  }

  private inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.cols && ty < this.rows;
  }
}

const NEIGHBORS: ReadonlyArray<[number, number, number]> = [
  [ 0, -1, 10], [ 1,  0, 10], [ 0,  1, 10], [-1,  0, 10],
  [ 1, -1, 14], [ 1,  1, 14], [-1,  1, 14], [-1, -1, 14],
];

function key(tx: number, ty: number): string { return `${tx},${ty}`; }

function heuristic(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
  return 10 * (dx + dy) + (14 - 20) * Math.min(dx, dy);
}

function reconstruct(cameFrom: Map<string, string>, endKey: string): TilePoint[] {
  const out: TilePoint[] = [];
  let cur: string | undefined = endKey;
  while (cur) {
    const [tx, ty] = cur.split(',').map(Number);
    out.push({ tx, ty });
    cur = cameFrom.get(cur);
  }
  return out.reverse();
}

interface HeapNode { key: string; tx: number; ty: number; g: number; f: number; }

class MinHeap {
  private a: HeapNode[] = [];
  isEmpty(): boolean { return this.a.length === 0; }
  push(n: HeapNode): void {
    this.a.push(n);
    let i = this.a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.a[p].f <= this.a[i].f) break;
      [this.a[p], this.a[i]] = [this.a[i], this.a[p]];
      i = p;
    }
  }
  pop(): HeapNode | undefined {
    if (this.a.length === 0) return undefined;
    const top = this.a[0];
    const last = this.a.pop()!;
    if (this.a.length > 0) {
      this.a[0] = last;
      let i = 0;
      const n = this.a.length;
      while (true) {
        const l = 2 * i + 1, r = 2 * i + 2;
        let s = i;
        if (l < n && this.a[l].f < this.a[s].f) s = l;
        if (r < n && this.a[r].f < this.a[s].f) s = r;
        if (s === i) break;
        [this.a[s], this.a[i]] = [this.a[i], this.a[s]];
        i = s;
      }
    }
    return top;
  }
}
