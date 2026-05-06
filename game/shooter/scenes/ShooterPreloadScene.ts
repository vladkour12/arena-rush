import * as Phaser from 'phaser';

export class ShooterPreloadScene extends Phaser.Scene {
  constructor() { super({ key: 'ShooterPreload' }); }

  preload(): void {
    const root = '/Top-down shooter asset pack';
    this.load.image('shooter-skins',   `${root}/Skins.png`);
    this.load.image('shooter-weapons', `${root}/Weapons.png`);
    this.load.image('shooter-tileset', `${root}/Tileset with cell size 256x256.png`);
  }

  create(): void {
    const ctx = this.registry.get('shooterContext');
    this.scene.start('Shooter', ctx);
  }
}
