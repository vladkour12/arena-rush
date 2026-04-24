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

  constructor(scene: Phaser.Scene, tx: number, ty: number, type: ResourceType) {
    this.type = type;
    this.tx = tx;
    this.ty = ty;
    this.wx = (tx + 0.5) * TILE_SIZE;
    this.wy = (ty + 0.5) * TILE_SIZE;
    this.remainingHarvests = type === 'tree' ? 4 : Number.POSITIVE_INFINITY;

    const key = type === 'tree' ? 'resource_tree' : 'resource_goldmine_active';
    this.sprite = scene.add.image(this.wx, this.wy, key);
    this.sprite.setDepth(4);
    this.sprite.setScale(0.5);
  }

  harvest() {
    if (!this.active) return false;

    this.sprite.scene.tweens.add({
      targets: this.sprite,
      angle: this.type === 'tree' ? 7 : 0,
      scaleX: this.type === 'tree' ? 0.47 : 0.53,
      scaleY: this.type === 'tree' ? 0.53 : 0.53,
      duration: 90,
      yoyo: true,
      ease: 'Sine.easeOut',
      onComplete: () => {
        if (this.sprite.active) {
          this.sprite.setAngle(0);
          this.sprite.setScale(0.5);
        }
      },
    });

    if (this.type !== 'tree') return false;

    this.remainingHarvests -= 1;
    if (this.remainingHarvests > 0) {
      this.sprite.setAlpha(Phaser.Math.Clamp(0.45 + this.remainingHarvests * 0.14, 0.45, 1));
      return false;
    }

    this.deplete();
    return true;
  }

  deplete() {
    this.active = false;
    if (this.type === 'tree') {
      this.sprite.scene.tweens.add({
        targets: this.sprite,
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        y: this.sprite.y + 10,
        duration: 220,
        ease: 'Quad.easeIn',
        onComplete: () => this.sprite.destroy(),
      });
      return;
    }

    const inactiveKey = 'resource_goldmine_inactive';
    if (this.sprite.scene.textures.exists(inactiveKey)) {
      this.sprite.setTexture(inactiveKey);
    } else {
      this.sprite.setAlpha(0.4);
    }
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
