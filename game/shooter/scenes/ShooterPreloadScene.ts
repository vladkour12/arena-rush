import * as Phaser from 'phaser';

// Source-image dimensions of the asset pack (px). Used to slice frames programmatically.
// Assembled skins.png: 2724x3212. Empirically (alpha-scan):
//   silhouettes are 266 wide × 460 tall. Row 0 starts at y=77, content y=77..536.
//   Row 0 columns at x=195, 595, 995, 1395 (centers ~400px apart).
// Weapons.png: 3328x1196 — 9 weapons in a row, ~370 per slot.
// Tileset 256x256.png: 3648x1792.
const SKIN_W = 266;
const SKIN_H = 460;
const SKIN_ROW0_Y = 77;
const SKIN_ROW0_COLS_X = [195, 595, 995, 1395];
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
    // PLAYER skins — exact bounding rects. Row 0 col 0 = orange, col 2 = red.
    const skins = this.textures.get('shooter-assembled');
    skins.add('skin-A', 0, SKIN_ROW0_COLS_X[0], SKIN_ROW0_Y, SKIN_W, SKIN_H);
    skins.add('skin-B', 0, SKIN_ROW0_COLS_X[2], SKIN_ROW0_Y, SKIN_W, SKIN_H);

    // WEAPONS — slice 9 columns from Weapons.png.
    // Index visual map (left → right):
    //   0 grenade canister, 1 grenade, 2 knife/baton, 3 micro pistol,
    //   4 full pistol w/ red mag, 5 shotgun (pump), 6 SMG (dual-handle),
    //   7 camo rifle, 8 sniper w/ scope.
    const wpn = this.textures.get('shooter-weapons-raw');
    wpn.add('w-pistol',  0, 4 * WEAPON_SLOT_W, 0, WEAPON_SLOT_W, WEAPON_H);
    wpn.add('w-shotgun', 0, 5 * WEAPON_SLOT_W, 0, WEAPON_SLOT_W, WEAPON_H);
    wpn.add('w-smg',     0, 6 * WEAPON_SLOT_W, 0, WEAPON_SLOT_W, WEAPON_H);
    wpn.add('w-sniper',  0, 8 * WEAPON_SLOT_W, 0, WEAPON_SLOT_W, WEAPON_H);

    // TILESET — only the top-left 2×2 stone-floor cell is used. Walls are drawn
    // with primitives in the scene to avoid mis-slicing the tileset's mixed cells.
    const tiles = this.textures.get('shooter-tileset-raw');
    tiles.add('tile-floor', 0, 0, 0, TILE, TILE);

    const ctx = this.registry.get('shooterContext');
    this.scene.start('Shooter', ctx);
  }
}
