import * as Phaser from 'phaser';

// Source-image dimensions of the asset pack (px). Used to slice frames programmatically.
// Assembled skins.png: 2724x3212 — 4 cols * 6 rows of player sprites, each ~681x535, gun-up orientation.
// Weapons.png: 3328x1196 — 9 weapons in a row, each ~370x1196, gun-up orientation.
// Tileset 256x256.png: 3648x1792 — 14x7 grid of 256x256 cells.
const SKIN_W = 681;
const SKIN_H = 535;
const WEAPON_SLOT_W = 370;
const WEAPON_H = 1196;
const TILE = 256;

export class ShooterPreloadScene extends Phaser.Scene {
  constructor() { super({ key: 'ShooterPreload' }); }

  preload(): void {
    const root = '/Top-down shooter asset pack';
    this.load.image('shooter-skins-raw', `${root}/Skins.png`);
    this.load.image('shooter-weapons-raw', `${root}/Weapons.png`);
    this.load.image('shooter-tileset-raw', `${root}/Tileset with cell size 256x256.png`);
    this.load.image('shooter-assembled', `${root}/Examples/Assembled skins.png`);
  }

  create(): void {
    // Carve out named frames from each loaded image.
    // PLAYER skins — pick visually distinct ones (col 0 row 0 = orange, col 2 row 0 = red).
    const skins = this.textures.get('shooter-assembled');
    skins.add('skin-A', 0, 0 * SKIN_W,        0 * SKIN_H, SKIN_W, SKIN_H);
    skins.add('skin-B', 0, 2 * SKIN_W,        0 * SKIN_H, SKIN_W, SKIN_H);

    // WEAPONS — slice 9 columns from Weapons.png.
    const wpn = this.textures.get('shooter-weapons-raw');
    // Index → in-game weapon id. Visually picked from the row.
    // 0 small grenade, 1 grenade, 2 short pistol, 3 black pistol, 4 pistol+red, 5 shotgun-ish,
    // 6 SMG, 7 camo rifle, 8 sniper.
    wpn.add('w-pistol',  0, 3 * WEAPON_SLOT_W, 0, WEAPON_SLOT_W, WEAPON_H);
    wpn.add('w-shotgun', 0, 5 * WEAPON_SLOT_W, 0, WEAPON_SLOT_W, WEAPON_H);
    wpn.add('w-smg',     0, 6 * WEAPON_SLOT_W, 0, WEAPON_SLOT_W, WEAPON_H);
    wpn.add('w-sniper',  0, 8 * WEAPON_SLOT_W, 0, WEAPON_SLOT_W, WEAPON_H);

    // TILESET — pick a floor tile and a wall tile (single 256x256 cells).
    const tiles = this.textures.get('shooter-tileset-raw');
    // Floor tile: row 1 col 0 — neutral mid-gray paving (avoids the lit edge tiles).
    tiles.add('tile-floor', 0, 0 * TILE, 1 * TILE, TILE, TILE);
    // Wall tile: dark filled navy square — row 1, col ~6 (the solid dark blue square in the tileset).
    tiles.add('tile-wall',  0, 6 * TILE, 1 * TILE, TILE, TILE);

    const ctx = this.registry.get('shooterContext');
    this.scene.start('Shooter', ctx);
  }
}
