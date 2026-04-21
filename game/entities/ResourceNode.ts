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

  constructor(scene: Phaser.Scene, tx: number, ty: number, type: ResourceType) {
    this.type = type;
    this.tx = tx;
    this.ty = ty;
    this.wx = (tx + 0.5) * TILE_SIZE;
    this.wy = (ty + 0.5) * TILE_SIZE;

    const key = type === 'tree' ? 'resource_tree' : 'resource_goldmine_active';
    this.sprite = scene.add.image(this.wx, this.wy, key);
    this.sprite.setDepth(4);
    this.sprite.setScale(0.5);
  }

  deplete() {
    this.active = false;
    const stumpKey = this.type === 'tree' ? 'resource_stump' : 'resource_goldmine_inactive';
    if (this.sprite.scene.textures.exists(stumpKey)) {
      this.sprite.setTexture(stumpKey);
    } else {
      this.sprite.setAlpha(0.4);
    }
  }

  destroy() {
    this.sprite.destroy();
  }
}
