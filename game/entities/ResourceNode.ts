import * as Phaser from 'phaser';
import { TILE_SIZE } from '../config/map';

export type ResourceType = 'tree' | 'goldmine';

export class ResourceNode {
  public sprite: Phaser.GameObjects.Image;
  public type: ResourceType;
  public tx: number;
  public ty: number;
  public wx: number;
  public wy: number;
  public active = true;
  private remainingHarvests: number;
  /** Maximum harvests — used to shade the sprite as resource dwindles. */
  private readonly maxHarvests: number;

  private static pickTreeFrame(tx: number, ty: number): number {
    // Stable per-tile variation so each node keeps its look across runs.
    const seed = ((tx + 11) * 73856093) ^ ((ty + 17) * 19349663);
    return Math.abs(seed) % 6;
  }

  private static pickStumpKey(tx: number, ty: number): string {
    const keys = ['tree_stump_1', 'tree_stump_2', 'tree_stump_3', 'tree_stump_4'];
    const seed = ((tx + 23) * 83492791) ^ ((ty + 31) * 29765729);
    return keys[Math.abs(seed) % keys.length];
  }

  constructor(scene: Phaser.Scene, tx: number, ty: number, type: ResourceType) {
    this.type = type;
    this.tx = tx;
    this.ty = ty;
    this.wx = (tx + 0.5) * TILE_SIZE;
    this.wy = (ty + 0.5) * TILE_SIZE;
    this.maxHarvests = type === 'tree' ? 8 : 24;
    this.remainingHarvests = this.maxHarvests;

    if (type === 'tree') {
      this.sprite = scene.add.image(this.wx, this.wy, 'tree_sheet', ResourceNode.pickTreeFrame(tx, ty));
      this.sprite.setScale(0.5);
      this.sprite.setOrigin(0.5, 0.95);
      this.sprite.setTint(0xd9ffd9);
    } else {
      this.sprite = scene.add.image(this.wx, this.wy, 'resource_goldmine_active');
      this.sprite.setScale(0.5);
    }
    this.sprite.setDepth(4);
  }

  harvest() {
    if (!this.active) return false;

    // Shake/bounce feedback
    this.sprite.scene.tweens.add({
      targets: this.sprite,
      angle: this.type === 'tree' ? 8 : 0,
      scaleX: this.type === 'tree' ? 0.46 : 0.54,
      scaleY: this.type === 'tree' ? 0.54 : 0.46,
      duration: 80,
      yoyo: true,
      ease: 'Sine.easeOut',
      onComplete: () => {
        if (this.sprite.active) {
          this.sprite.setAngle(0);
          this.sprite.setScale(0.5);
        }
      },
    });

    this.remainingHarvests -= 1;

    // Fade sprite to show depletion progress
    const fraction = this.remainingHarvests / this.maxHarvests;
    this.sprite.setAlpha(Phaser.Math.Clamp(0.40 + fraction * 0.60, 0.40, 1));

    if (this.remainingHarvests > 0) return false;

    this.deplete();
    return true;
  }

  deplete() {
    this.active = false;
    if (this.type === 'tree') {
      // Tree falls, then turns into a stump so the cleared state stays visible.
      this.sprite.scene.tweens.add({
        targets: this.sprite,
        alpha: 0,
        scaleX: 0.15,
        scaleY: 0.15,
        angle: Phaser.Math.Between(30, 60),
        y: this.sprite.y + 16,
        duration: 300,
        ease: 'Quad.easeIn',
        onComplete: () => {
          if (!this.sprite.active) return;
          this.sprite.clearTint();
          this.sprite.setTexture(ResourceNode.pickStumpKey(this.tx, this.ty));
          this.sprite.setAlpha(1);
          this.sprite.setAngle(0);
          this.sprite.setScale(0.42);
          this.sprite.setOrigin(0.5, 0.9);
          this.sprite.setDepth(2.2 + this.ty * 0.01);

          // Keep stumps visible for a while, then clean them up to avoid map clutter.
          const lingerMs = Phaser.Math.Between(30000, 60000);
          this.sprite.scene.time.delayedCall(lingerMs, () => {
            if (!this.sprite.active) return;
            this.sprite.scene.tweens.add({
              targets: this.sprite,
              alpha: 0,
              scaleX: this.sprite.scaleX * 0.85,
              scaleY: this.sprite.scaleY * 0.85,
              duration: 700,
              ease: 'Sine.easeIn',
              onComplete: () => {
                if (this.sprite.active) this.sprite.destroy();
              },
            });
          });
        },
      });
      return;
    }

    // Mine collapses: sink into the ground and vanish
    this.sprite.scene.tweens.add({
      targets: this.sprite,
      alpha: 0,
      scaleX: 0.1,
      scaleY: 0.1,
      y: this.sprite.y + 20,
      duration: 400,
      ease: 'Quad.easeIn',
      onComplete: () => this.sprite.destroy(),
    });
  }

  destroy() {
    this.sprite.destroy();
  }

  translateTiles(dxTiles: number, dyTiles: number) {
    this.tx += dxTiles;
    this.ty += dyTiles;
    this.wx += dxTiles * TILE_SIZE;
    this.wy += dyTiles * TILE_SIZE;
    if (this.sprite.active) {
      this.sprite.setPosition(this.wx, this.wy);
    }
  }
}
