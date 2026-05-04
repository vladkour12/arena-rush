import * as Phaser from 'phaser';
import { TILE_SIZE, MAP_COLS, MAP_ROWS, GRASS_TUFT_DENSITY } from '../config/map';
import type { TerrainCell } from './TilemapBuilder';
import type { AmbientSwaySystem } from '../systems/AmbientSwaySystem';

/** Tiny Swords deco frames that read as small tufts/bushes. */
const GRASS_DECO_KEYS = ['deco_03', 'deco_04', 'deco_07', 'deco_09'];

/** Stump / log / small bush — for tree clusters and clutter. */
const STUMP_DECO_KEYS = ['deco_05', 'deco_06', 'deco_15'];

/** Rock-pile / ore-cart-ish frames for goldmine clusters. */
const ORE_DECO_KEYS = ['deco_10', 'deco_12'];

/**
 * Scatters small grass tufts on grass tiles. Returns the spawned sprites so
 * the scene can iterate them later for frustum culling.
 */
export function spawnGrassTufts(
  scene: Phaser.Scene,
  grid: TerrainCell[][],
  sway: AmbientSwaySystem,
  rng: () => number,
  density: number = GRASS_TUFT_DENSITY,
): Phaser.GameObjects.Image[] {
  const out: Phaser.GameObjects.Image[] = [];
  for (let ty = 0; ty < MAP_ROWS; ty++) {
    for (let tx = 0; tx < MAP_COLS; tx++) {
      const c = grid[ty]?.[tx];
      if (!c) continue;
      if (c.water || c.tileKind === 'beach' || c.stair || c.bridge) continue;
      if (rng() > density) continue;
      const key = GRASS_DECO_KEYS[Math.floor(rng() * GRASS_DECO_KEYS.length)];
      const wx = tx * TILE_SIZE + TILE_SIZE / 2 + (rng() - 0.5) * TILE_SIZE * 0.6;
      const wy = ty * TILE_SIZE + TILE_SIZE / 2 + (rng() - 0.5) * TILE_SIZE * 0.6;
      const img = scene.add.image(wx, wy, key);
      img.setDepth(2.2);   // just above ground tiles, below cliff stacks (depth ~1.5+)
      img.setScale(0.45);
      img.setOrigin(0.5, 0.85);
      sway.registerScale(img, 0.45, 0.06, 1900 + rng() * 600);
      out.push(img);
    }
  }
  return out;
}

/** Adds 1–3 small static deco sprites near each tree node and 1–2 near each gold mine. */
export function spawnResourceClusters(
  scene: Phaser.Scene,
  trees: { x: number; y: number }[],
  mines: { x: number; y: number }[],
  rng: () => number,
): Phaser.GameObjects.Image[] {
  const out: Phaser.GameObjects.Image[] = [];
  for (const t of trees) {
    const n = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const k = STUMP_DECO_KEYS[Math.floor(rng() * STUMP_DECO_KEYS.length)];
      const dx = (rng() - 0.5) * TILE_SIZE * 1.4;
      const dy = (rng() - 0.5) * TILE_SIZE * 1.4;
      const img = scene.add.image(t.x + dx, t.y + dy, k).setDepth(3.5).setScale(0.4);
      out.push(img);
    }
  }
  for (const m of mines) {
    const n = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      const k = ORE_DECO_KEYS[Math.floor(rng() * ORE_DECO_KEYS.length)];
      const dx = (rng() - 0.5) * TILE_SIZE * 1.4;
      const dy = (rng() - 0.5) * TILE_SIZE * 1.4;
      const img = scene.add.image(m.x + dx, m.y + dy, k).setDepth(3.5).setScale(0.45);
      out.push(img);
    }
  }
  return out;
}

/**
 * Animated foam sprites on water cells adjacent to land. Uses the foam
 * spritesheet preloaded with key 'foam'. Caller should ensure the foam
 * animation is registered (key 'foam_loop') before invoking.
 */
export function spawnFoam(
  scene: Phaser.Scene,
  grid: TerrainCell[][],
): Phaser.GameObjects.Sprite[] {
  const out: Phaser.GameObjects.Sprite[] = [];
  for (let ty = 0; ty < MAP_ROWS; ty++) {
    for (let tx = 0; tx < MAP_COLS; tx++) {
      const c = grid[ty]?.[tx];
      if (!c || !c.water) continue;
      let touchesLand = false;
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
        const nx = tx + dx, ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_COLS || ny >= MAP_ROWS) continue;
        const n = grid[ny][nx];
        if (n && !n.water) { touchesLand = true; break; }
      }
      if (!touchesLand) continue;
      const wx = tx * TILE_SIZE + TILE_SIZE / 2;
      const wy = ty * TILE_SIZE + TILE_SIZE / 2;
      const s = scene.add.sprite(wx, wy, 'foam', 0);
      s.setDepth(0.8);
      s.setAlpha(0.6);
      s.setScale(TILE_SIZE / 192);
      if (scene.anims.exists('foam_loop')) s.play('foam_loop');
      out.push(s);
    }
  }
  return out;
}
