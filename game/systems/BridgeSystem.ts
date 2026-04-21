import * as Phaser from 'phaser';
import {
  TILE_SIZE,
  BRIDGE_X1, BRIDGE_X2, BRIDGE_Y_ROW,
  MAP_ROWS,
} from '../config/map';

export class BridgeSystem {
  private scene: Phaser.Scene;
  private bridgeOpen = false;
  private bridgeTiles: Phaser.GameObjects.Image[] = [];
  private bannerText: Phaser.GameObjects.Text | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  get isOpen() {
    return this.bridgeOpen;
  }

  openBridge(onOpen: () => void) {
    if (this.bridgeOpen) return;
    this.bridgeOpen = true;

    // Camera shake
    this.scene.cameras.main.shake(600, 0.012);

    // Spawn bridge tiles row by row with stagger
    const bridgeLen = BRIDGE_X2 - BRIDGE_X1 + 1;
    const midTile = Math.floor((BRIDGE_Y_ROW + MAP_ROWS / 2) / 2);

    for (let i = 0; i < bridgeLen; i++) {
      const tx = BRIDGE_X1 + i;
      const wx = (tx + 0.5) * TILE_SIZE;
      const wy = (BRIDGE_Y_ROW + 0.5) * TILE_SIZE;

      const tile = this.scene.add.image(wx, wy, 'terrain_bridge');
      tile.setDepth(3);
      tile.setAlpha(0);
      tile.setScale(0.5);

      this.bridgeTiles.push(tile);

      this.scene.tweens.add({
        targets: tile,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
        duration: 300,
        delay: i * 60,
        ease: 'Back.easeOut',
      });
    }

    // Banner
    const cam = this.scene.cameras.main;
    const cx = cam.scrollX + cam.width / 2;
    const cy = cam.scrollY + cam.height / 2;

    this.bannerText = this.scene.add.text(cx, cy, '⚔  BRIDGE RISES  ⚔', {
      fontFamily: 'serif',
      fontSize: '42px',
      color: '#ffe066',
      stroke: '#5a3a00',
      strokeThickness: 6,
    });
    this.bannerText.setOrigin(0.5);
    this.bannerText.setDepth(100);
    this.bannerText.setScrollFactor(0);

    this.scene.tweens.add({
      targets: this.bannerText,
      alpha: 0,
      y: cy - 80,
      duration: 2000,
      delay: 1200,
      ease: 'Power2',
      onComplete: () => {
        this.bannerText?.destroy();
        this.bannerText = null;
      },
    });

    onOpen();
  }
}
