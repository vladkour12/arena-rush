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
  wanderRadiusTiles: number;
  idleMinMs: number;
  idleJitterMs: number;
  postWalkIdleMinMs: number;
  postWalkIdleJitterMs: number;
}

interface FlockProfile {
  speedMin: number;
  speedMax: number;
  wanderRadiusTiles: number;
  idleMinMs: number;
  idleJitterMs: number;
  postWalkIdleMinMs: number;
  postWalkIdleJitterMs: number;
}

const FLOCK_PROFILES: FlockProfile[] = [
  // Calm herd: slower and lingers before moving.
  { speedMin: 10, speedMax: 14, wanderRadiusTiles: 2, idleMinMs: 2200, idleJitterMs: 3400, postWalkIdleMinMs: 3600, postWalkIdleJitterMs: 4600 },
  // Normal herd: baseline behavior.
  { speedMin: 12, speedMax: 18, wanderRadiusTiles: 3, idleMinMs: 1200, idleJitterMs: 3000, postWalkIdleMinMs: 3000, postWalkIdleJitterMs: 4000 },
  // Skittish herd: faster and changes direction more often.
  { speedMin: 16, speedMax: 22, wanderRadiusTiles: 4, idleMinMs: 700, idleJitterMs: 2100, postWalkIdleMinMs: 2000, postWalkIdleJitterMs: 3000 },
];

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

  private isValidSheepTile(tx: number, ty: number): boolean {
    const cell = this.grid[ty]?.[tx];
    if (!cell) return false;
    if (cell.water || cell.stair || cell.bridge || !cell.walkable) return false;
    // Keep sheep on soft ground for cleaner movement and visuals.
    if (cell.tileKind !== 'flat' && cell.tileKind !== 'elevated') return false;
    const wx = tx * TILE_SIZE + TILE_SIZE / 2;
    if (wx < P1_TERRITORY_MAX_X || wx > P2_TERRITORY_MIN_X) return false;
    return true;
  }

  private spawnSheepAtTile(tx: number, ty: number, profile: FlockProfile): void {
    const wx = tx * TILE_SIZE + TILE_SIZE / 2;
    const wy = ty * TILE_SIZE + TILE_SIZE / 2;
    const sprite = this.scene.add.sprite(wx, wy, 'sheep_idle', 0);
    sprite.setDepth(4.5);
    sprite.setScale(0.45);
    if (this.scene.anims.exists('sheep_idle_loop')) sprite.play('sheep_idle_loop');
    this.sheep.push({
      sprite,
      tx,
      ty,
      targetWx: wx,
      targetWy: wy,
      nextDecisionMs: profile.idleMinMs + this.rng() * profile.idleJitterMs,
      speed: profile.speedMin + this.rng() * (profile.speedMax - profile.speedMin),
      state: 'idle',
      facingLeft: this.rng() < 0.5,
      wanderRadiusTiles: profile.wanderRadiusTiles,
      idleMinMs: profile.idleMinMs,
      idleJitterMs: profile.idleJitterMs,
      postWalkIdleMinMs: profile.postWalkIdleMinMs,
      postWalkIdleJitterMs: profile.postWalkIdleJitterMs,
    });
    this.sheep[this.sheep.length - 1].sprite.setFlipX(this.sheep[this.sheep.length - 1].facingLeft);
  }

  /** Try to spawn `count` sheep in walkable neutral grass tiles. */
  spawn(count: number): void {
    if (count <= 0) return;

    const clusters = Math.max(2, Math.min(3, Math.round(count / 6)));
    const centers: Array<{ tx: number; ty: number; profile: FlockProfile }> = [];

    // Pick a few cluster centers inside the neutral corridor.
    let centerAttempts = 0;
    const maxCenterAttempts = clusters * 40;
    while (centers.length < clusters && centerAttempts < maxCenterAttempts) {
      centerAttempts++;
      const tx = Math.floor(this.rng() * MAP_COLS);
      const ty = Math.floor(this.rng() * MAP_ROWS);
      if (!this.isValidSheepTile(tx, ty)) continue;

      let tooClose = false;
      for (const c of centers) {
        const dx = c.tx - tx;
        const dy = c.ty - ty;
        if (dx * dx + dy * dy < 121) { // keep herd centers about 11+ tiles apart
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
      const profile = FLOCK_PROFILES[Math.floor(this.rng() * FLOCK_PROFILES.length)] ?? FLOCK_PROFILES[1];
      centers.push({ tx, ty, profile });
    }

    // Fallback to one center if random center picking failed.
    if (centers.length === 0) {
      for (let i = 0; i < 120; i++) {
        const tx = Math.floor(this.rng() * MAP_COLS);
        const ty = Math.floor(this.rng() * MAP_ROWS);
        if (!this.isValidSheepTile(tx, ty)) continue;
        centers.push({ tx, ty, profile: FLOCK_PROFILES[1] });
        break;
      }
    }

    let attempts = 0;
    let placed = 0;
    const maxAttempts = count * 40;
    while (placed < count && attempts < maxAttempts) {
      attempts++;

      const center = centers.length > 0
        ? centers[Math.floor(this.rng() * centers.length)]
        : { tx: Math.floor(this.rng() * MAP_COLS), ty: Math.floor(this.rng() * MAP_ROWS), profile: FLOCK_PROFILES[1] };

      // Sample around herd center; occasional wider jumps keep groups organic.
      const radius = this.rng() < 0.82 ? 4 : 8;
      const tx = center.tx + Math.floor(this.rng() * (radius * 2 + 1)) - radius;
      const ty = center.ty + Math.floor(this.rng() * (radius * 2 + 1)) - radius;
      if (tx < 0 || ty < 0 || tx >= MAP_COLS || ty >= MAP_ROWS) continue;
      if (!this.isValidSheepTile(tx, ty)) continue;

      this.spawnSheepAtTile(tx, ty, center.profile);
      placed++;
    }

    // Final fallback: if clusters underfilled, fill remaining sheep anywhere valid.
    let cleanupAttempts = 0;
    while (placed < count && cleanupAttempts < count * 20) {
      cleanupAttempts++;
      const tx = Math.floor(this.rng() * MAP_COLS);
      const ty = Math.floor(this.rng() * MAP_ROWS);
      if (!this.isValidSheepTile(tx, ty)) continue;
      this.spawnSheepAtTile(tx, ty, FLOCK_PROFILES[1]);
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
          s.nextDecisionMs = s.postWalkIdleMinMs + this.rng() * s.postWalkIdleJitterMs;
        } else {
          const step = Math.min(dist, s.speed * (dtMs / 1000));
          s.sprite.x += (dx / dist) * step;
          s.sprite.y += (dy / dist) * step;
        }
      } else if (s.nextDecisionMs <= 0) {
        // Pick a wander target within the sheep's temperament radius.
        for (let attempt = 0; attempt < 6; attempt++) {
          const radius = s.wanderRadiusTiles;
          const ntx = s.tx + Math.floor(this.rng() * (radius * 2 + 1)) - radius;
          const nty = s.ty + Math.floor(this.rng() * (radius * 2 + 1)) - radius;
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
        if (s.state === 'idle') s.nextDecisionMs = s.idleMinMs + this.rng() * s.idleJitterMs;
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
