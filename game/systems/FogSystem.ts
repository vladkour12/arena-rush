import * as Phaser from 'phaser';
import type { Unit } from '../entities/Unit';
import type { Building } from '../entities/Building';
import { TILE_SIZE, MAP_COLS, MAP_ROWS } from '../config/map';

/** Vision radii in tiles per unit type */
const VISION_RADII: Record<string, number> = {
  archer:  8,
  slinger: 7,
  warrior: 5,
  knight:  5,
  pawn:    4,
  monk:    4,
};
const BUILDING_VISION = 4;
const UPDATE_INTERVAL_MS = 100;

export class FogSystem {
  private scene: Phaser.Scene;
  /** 1 = currently visible this frame */
  private visGrid: Uint8Array;
  /** 1 = tile has ever been seen (explored) — never reset */
  private exploredGrid: Uint8Array;
  private fogGraphics: Phaser.GameObjects.Graphics;
  private updateTimer = 0;
  /** Dirty flag — fog only redraws when vision actually changed */
  private fogDirty = true;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.visGrid     = new Uint8Array(MAP_COLS * MAP_ROWS);
    this.exploredGrid = new Uint8Array(MAP_COLS * MAP_ROWS);

    this.fogGraphics = scene.add.graphics();
    this.fogGraphics.setDepth(200);
    this.fogGraphics.setScrollFactor(1);
  }

  /** Reveal a circular area around a tile centre (used at spawn and on update). */
  revealArea(cx: number, cy: number, radiusTiles: number) {
    const r2 = radiusTiles * radiusTiles;
    for (let dy = -radiusTiles; dy <= radiusTiles; dy++) {
      for (let dx = -radiusTiles; dx <= radiusTiles; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const tx = cx + dx;
        const ty = cy + dy;
        if (tx < 0 || tx >= MAP_COLS || ty < 0 || ty >= MAP_ROWS) continue;
        const idx = ty * MAP_COLS + tx;
        this.visGrid[idx] = 1;
        this.exploredGrid[idx] = 1;
      }
    }
  }

  update(
    delta: number,
    p1Units: Unit[],
    p1Buildings: Building[],
    _camera: Phaser.Cameras.Scene2D.Camera,
  ) {
    // ── Vision refresh every UPDATE_INTERVAL_MS ──────────────────────────
    this.updateTimer += delta;
    if (this.updateTimer >= UPDATE_INTERVAL_MS) {
      this.updateTimer -= UPDATE_INTERVAL_MS;

      // Reset visible grid — explored grid is NEVER reset
      this.visGrid.fill(0);

      // Reveal around each alive P1 unit
      for (const u of p1Units) {
        if (!u.isAlive()) continue;
        const tx = Math.floor(u.state.x / TILE_SIZE);
        const ty = Math.floor(u.state.y / TILE_SIZE);
        this.revealArea(tx, ty, VISION_RADII[u.state.type] ?? 5);
      }

      // Reveal around P1 standing buildings (use centre of footprint)
      for (const b of p1Buildings) {
        if (b.isDestroyed) continue;
        this.revealArea(b.tx + 1, b.ty + 1, BUILDING_VISION);
      }

      // Vision changed — schedule a fog redraw
      this.fogDirty = true;
    }

    // ── Draw fog only when vision changed (skip redundant frames) ───────
    if (!this.fogDirty) return;
    this.fogDirty = false;

    const T = TILE_SIZE;
    this.fogGraphics.clear();

    // Pass 1 — completely unseen tiles: dark fog
    this.fogGraphics.fillStyle(0x000000, 0.85);
    for (let ty = 0; ty < MAP_ROWS; ty++) {
      let runStart = -1;
      for (let tx = 0; tx <= MAP_COLS; tx++) {
        const unseen = tx < MAP_COLS &&
          this.visGrid[ty * MAP_COLS + tx] === 0 &&
          this.exploredGrid[ty * MAP_COLS + tx] === 0;
        if (unseen) {
          if (runStart === -1) runStart = tx;
        } else if (runStart !== -1) {
          this.fogGraphics.fillRect(runStart * T, ty * T, (tx - runStart) * T, T);
          runStart = -1;
        }
      }
    }

    // Pass 2 — explored but not currently visible: light shroud
    this.fogGraphics.fillStyle(0x000000, 0.40);
    for (let ty = 0; ty < MAP_ROWS; ty++) {
      let runStart = -1;
      for (let tx = 0; tx <= MAP_COLS; tx++) {
        const dimmed = tx < MAP_COLS &&
          this.visGrid[ty * MAP_COLS + tx] === 0 &&
          this.exploredGrid[ty * MAP_COLS + tx] === 1;
        if (dimmed) {
          if (runStart === -1) runStart = tx;
        } else if (runStart !== -1) {
          this.fogGraphics.fillRect(runStart * T, ty * T, (tx - runStart) * T, T);
          runStart = -1;
        }
      }
    }
  }

  private enabled = true;

  /** Toggle fog of war on/off (admin/debug use). */
  setEnabled(on: boolean) {
    this.enabled = on;
    this.fogGraphics.setVisible(on);
    this.fogDirty = true;
  }

  isEnabled() { return this.enabled; }

  /** Returns true if the world-pixel position is currently visible (not fogged). */
  isTileVisible(wx: number, wy: number): boolean {
    if (!this.enabled) return true;
    const tx = Math.floor(wx / TILE_SIZE);
    const ty = Math.floor(wy / TILE_SIZE);
    if (tx < 0 || tx >= MAP_COLS || ty < 0 || ty >= MAP_ROWS) return false;
    return this.visGrid[ty * MAP_COLS + tx] === 1;
  }

  destroy() {
    this.fogGraphics.destroy();
  }
}
