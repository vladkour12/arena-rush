import * as Phaser from 'phaser';
import { TILE_SIZE, MAP_COLS, MAP_ROWS, P1_TERRITORY_MAX_X, P2_TERRITORY_MIN_X } from '../config/map';
import type { TerrainCell } from '../render/TilemapBuilder';

interface Sheep {
  sprite: Phaser.GameObjects.Sprite;
  tx: number;
  ty: number;
  targetWx: number;
  targetWy: number;
  nextDecisionMs: number;
  speed: number;
  state: 'idle' | 'walking';
  facingLeft: boolean;
}

/**
 * Spawns happy sheep that wander slowly across grass tiles in the neutral
 * zone (between the two players' territories). Sheep have no faction, no
 * HP, and don't interact with combat. Pure decoration.
 */
export class WildlifeSystem {
  private sheep: Sheep[] = [];

  constructor(
    private scene: Phaser.Scene,
    private grid: TerrainCell[][],
    private rng: () => number,
  ) {}

  /** Try to spawn `count` sheep in walkable neutral grass tiles. */
  spawn(count: number): void {
    let attempts = 0;
    let placed = 0;
    const maxAttempts = count * 30;
    while (placed < count && attempts < maxAttempts) {
      attempts++;
      const tx = Math.floor(this.rng() * MAP_COLS);
      const ty = Math.floor(this.rng() * MAP_ROWS);
      const cell = this.grid[ty]?.[tx];
      if (!cell) continue;
      if (cell.water || cell.stair || cell.bridge || !cell.walkable) continue;
      // Only on flat grass (avoid hills/cliffs/beaches for now — easier wandering).
      if (cell.tileKind !== 'flat' && cell.tileKind !== 'elevated') continue;
      const wx = tx * TILE_SIZE + TILE_SIZE / 2;
      const wy = ty * TILE_SIZE + TILE_SIZE / 2;
      // Neutral zone: prefer the central corridor between territories.
      if (wx < P1_TERRITORY_MAX_X) continue;
      if (wx > P2_TERRITORY_MIN_X) continue;

      const sprite = this.scene.add.sprite(wx, wy, 'sheep_idle', 0);
      sprite.setDepth(4.5);
      sprite.setScale(0.45);
      if (this.scene.anims.exists('sheep_idle_loop')) sprite.play('sheep_idle_loop');
      this.sheep.push({
        sprite,
        tx, ty,
        targetWx: wx, targetWy: wy,
        nextDecisionMs: 1000 + this.rng() * 4000,
        speed: 12 + this.rng() * 8,    // px/s — much slower than units (~60)
        state: 'idle',
        facingLeft: this.rng() < 0.5,
      });
      this.sheep[this.sheep.length - 1].sprite.setFlipX(this.sheep[this.sheep.length - 1].facingLeft);
      placed++;
    }
  }

  update(dtMs: number): void {
    for (const s of this.sheep) {
      s.nextDecisionMs -= dtMs;
      if (s.state === 'walking') {
        const dx = s.targetWx - s.sprite.x;
        const dy = s.targetWy - s.sprite.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 2) {
          s.state = 'idle';
          if (this.scene.anims.exists('sheep_idle_loop')) s.sprite.play('sheep_idle_loop');
          s.nextDecisionMs = 3000 + this.rng() * 4000;
        } else {
          const step = Math.min(dist, s.speed * (dtMs / 1000));
          s.sprite.x += (dx / dist) * step;
          s.sprite.y += (dy / dist) * step;
        }
      } else if (s.nextDecisionMs <= 0) {
        // Pick a wander target up to 3 tiles away in any direction.
        for (let attempt = 0; attempt < 6; attempt++) {
          const ntx = s.tx + Math.floor(this.rng() * 7) - 3;
          const nty = s.ty + Math.floor(this.rng() * 7) - 3;
          const c = this.grid[nty]?.[ntx];
          if (!c || c.water || c.stair || c.bridge || !c.walkable) continue;
          if (c.tileKind !== 'flat' && c.tileKind !== 'elevated') continue;
          const wx = ntx * TILE_SIZE + TILE_SIZE / 2;
          if (wx < P1_TERRITORY_MAX_X || wx > P2_TERRITORY_MIN_X) continue;
          s.tx = ntx; s.ty = nty;
          s.targetWx = wx;
          s.targetWy = nty * TILE_SIZE + TILE_SIZE / 2;
          s.facingLeft = s.targetWx < s.sprite.x;
          s.sprite.setFlipX(s.facingLeft);
          s.state = 'walking';
          if (this.scene.anims.exists('sheep_walk_loop')) s.sprite.play('sheep_walk_loop');
          break;
        }
        // If no valid target found, idle a bit longer.
        if (s.state === 'idle') s.nextDecisionMs = 2000 + this.rng() * 2000;
      }
    }
  }

  /** For frustum culling: returns the underlying sprites. */
  getSprites(): Phaser.GameObjects.Sprite[] {
    return this.sheep.map(s => s.sprite);
  }

  destroy(): void {
    for (const s of this.sheep) s.sprite.destroy();
    this.sheep = [];
  }
}
