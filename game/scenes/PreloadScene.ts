import * as Phaser from 'phaser';

const BASE = '/Tiny%20Swords/Tiny%20Swords%20(Update%20010)/';
const FREE = '/Tiny%20Swords/Tiny%20Swords%20(Free%20Pack)/';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreloadScene' });
  }

  preload() {
    this.createLoadingBar();

    // ── Terrain ──────────────────────────────────────────────────────────────
    this.load.image('terrain_flat',   BASE + 'Terrain/Ground/Tilemap_Flat.png');
    this.load.image('terrain_elev',   BASE + 'Terrain/Ground/Tilemap_Elevation.png');
    this.load.image('terrain_water',  BASE + 'Terrain/Water/Water.png');
    this.load.image('terrain_foam',   BASE + 'Terrain/Water/Foam/Foam.png');
    this.load.image('terrain_bridge', BASE + 'Terrain/Bridge/Bridge_All.png');
    this.load.image('terrain_shadows', BASE + 'Terrain/Ground/Shadows.png');

    // ── Resources ────────────────────────────────────────────────────────────
    this.load.image('resource_tree',             BASE + 'Resources/Trees/Tree.png');
    this.load.image('resource_goldmine_active',  BASE + 'Resources/Gold%20Mine/GoldMine_Active.png');
    this.load.image('resource_goldmine_inactive',BASE + 'Resources/Gold%20Mine/GoldMine_Inactive.png');
    this.load.image('resource_goldmine_destroyed',BASE + 'Resources/Gold%20Mine/GoldMine_Destroyed.png');
    this.load.image('resource_G',   BASE + 'Resources/Resources/G_Idle.png');
    this.load.image('resource_W',   BASE + 'Resources/Resources/W_Idle.png');

    // ── Knights Buildings ────────────────────────────────────────────────────
    const factions = ['Blue', 'Red', 'Purple', 'Yellow'];
    for (const f of factions) {
      const fEnc = encodeURIComponent(f);
      this.load.image(`building_Castle_${f}`, BASE + `Factions/Knights/Buildings/Castle/Castle_${fEnc}.png`);
      this.load.image(`building_Tower_${f}`,  BASE + `Factions/Knights/Buildings/Tower/Tower_${fEnc}.png`);
      this.load.image(`building_House_${f}`,  BASE + `Factions/Knights/Buildings/House/House_${fEnc}.png`);
    }
    this.load.image('building_Castle_Destroyed', BASE + 'Factions/Knights/Buildings/Castle/Castle_Destroyed.png');
    this.load.image('building_Tower_Destroyed',  BASE + 'Factions/Knights/Buildings/Tower/Tower_Destroyed.png');
    this.load.image('building_House_Destroyed',  BASE + 'Factions/Knights/Buildings/House/House_Destroyed.png');
    this.load.image('building_Tower_Construction', BASE + 'Factions/Knights/Buildings/Tower/Tower_Construction.png');
    this.load.image('building_House_Construction', BASE + 'Factions/Knights/Buildings/House/House_Construction.png');

    // Barracks (from free pack, uses "Barracks.png" directly)
    for (const f of factions) {
      const fEnc = encodeURIComponent(f);
      this.load.image(
        `building_Barracks_${f}`,
        FREE + `Tiny%20Swords%20(Free%20Pack)/Buildings/${fEnc}%20Buildings/Barracks.png`,
      );
    }

    // ── Units (Update 010) ───────────────────────────────────────────────────
    // Warrior: 192×192 sheet — 6 frames idle, 8 run, 4 attack1, 4 attack2, 4 guard, 4 dead
    // We'll use the Free Pack spritesheets which are single-row strips
    const unitColors = ['Blue', 'Red'];
    for (const c of unitColors) {
      const cEnc = encodeURIComponent(c);

      // Warriors — Warrior_Blue.png is a vertical strip in Update010
      this.load.spritesheet(`Warrior_${c}`, BASE + `Factions/Knights/Troops/Warrior/${cEnc}/Warrior_${cEnc}.png`, {
        frameWidth: 192, frameHeight: 192,
      });

      // Archers
      this.load.spritesheet(`Archer_${c}`, BASE + `Factions/Knights/Troops/Archer/${cEnc}/Archer_${cEnc}.png`, {
        frameWidth: 192, frameHeight: 192,
      });

      // Pawns
      this.load.spritesheet(`Pawn_${c}`, BASE + `Factions/Knights/Troops/Pawn/${cEnc}/Pawn_${cEnc}.png`, {
        frameWidth: 192, frameHeight: 192,
      });
    }

    // Dead animation (shared)
    this.load.spritesheet('Dead', BASE + 'Factions/Knights/Troops/Dead/Dead.png', {
      frameWidth: 192, frameHeight: 192,
    });

    // Free Pack warriors (fallback / for monk — monk not in update010)
    const freeFactions = ['Blue', 'Red'];
    for (const f of freeFactions) {
      const fEnc = encodeURIComponent(f);
      // Monk from free pack
      this.load.spritesheet(
        `Monk_${f}`,
        FREE + `Tiny%20Swords%20(Free%20Pack)/Units/${fEnc}%20Units/Monk/Idle.png`,
        { frameWidth: 192, frameHeight: 192 },
      );
    }

    // ── Effects ──────────────────────────────────────────────────────────────
    this.load.spritesheet('fx_explosion', BASE + 'Effects/Explosion/Explosions.png', {
      frameWidth: 192, frameHeight: 192,
    });
    this.load.spritesheet('fx_fire', BASE + 'Effects/Fire/Fire.png', {
      frameWidth: 192, frameHeight: 192,
    });

    // ── UI ────────────────────────────────────────────────────────────────────
    this.load.image('ui_btn_blue',  BASE + 'UI/Buttons/Button_Blue.png');
    this.load.image('ui_btn_red',   BASE + 'UI/Buttons/Button_Red.png');
    this.load.image('ui_banner_h',  BASE + 'UI/Banners/Banner_Horizontal.png');
    this.load.image('ui_banner_v',  BASE + 'UI/Banners/Banner_Vertical.png');
    this.load.image('ui_carved',    BASE + 'UI/Banners/Carved_9Slides.png');

    // ── Decorations ──────────────────────────────────────────────────────────
    this.load.image('deco_01', BASE + 'Deco/01.png');
    this.load.image('deco_02', BASE + 'Deco/02.png');
    this.load.image('deco_03', BASE + 'Deco/03.png');
  }

  create() {
    this.createAnimations();
    // Start the island wars scene by default (can be overridden by registry)
    const targetScene = this.registry.get('startScene') ?? 'IslandWarsScene';
    const callbacks = this.registry.get('callbacks');
    this.scene.start(targetScene, callbacks ? { callbacks } : undefined);
  }

  private createAnimations() {
    const unitColors = ['Blue', 'Red'];

    for (const c of unitColors) {
      // ── Warrior animations ─────────────────────────────────────────────────
      // Free pack Warrior sheet layout (6 idle, 8 run, 4 attack1, 4 attack2, 4 guard)
      // Update010 Warrior sheet: typically 6 cols wide strip, multiple rows
      // Using conservative frame ranges
      this.safeAnim(`Warrior_${c}_idle`,   `Warrior_${c}`, 0, 5, 10, true);
      this.safeAnim(`Warrior_${c}_run`,    `Warrior_${c}`, 6, 13, 10, true);
      this.safeAnim(`Warrior_${c}_attack`, `Warrior_${c}`, 14, 17, 12, false);
      this.safeAnim(`Warrior_${c}_dead`,   'Dead', 0, 3, 8, false);
      this.safeAnim(`Warrior_${c}_heal`,   `Warrior_${c}`, 0, 5, 8, true);

      // ── Archer animations ──────────────────────────────────────────────────
      this.safeAnim(`Archer_${c}_idle`,   `Archer_${c}`, 0, 5, 10, true);
      this.safeAnim(`Archer_${c}_run`,    `Archer_${c}`, 6, 13, 10, true);
      this.safeAnim(`Archer_${c}_attack`, `Archer_${c}`, 14, 25, 10, false);
      this.safeAnim(`Archer_${c}_dead`,   'Dead', 0, 3, 8, false);
      this.safeAnim(`Archer_${c}_heal`,   `Archer_${c}`, 0, 5, 8, true);

      // ── Pawn animations ────────────────────────────────────────────────────
      this.safeAnim(`Pawn_${c}_idle`,   `Pawn_${c}`, 0, 5, 10, true);
      this.safeAnim(`Pawn_${c}_run`,    `Pawn_${c}`, 6, 13, 10, true);
      this.safeAnim(`Pawn_${c}_attack`, `Pawn_${c}`, 14, 19, 10, false);
      this.safeAnim(`Pawn_${c}_dead`,   'Dead', 0, 3, 8, false);
      this.safeAnim(`Pawn_${c}_heal`,   `Pawn_${c}`, 0, 5, 8, true);

      // ── Monk animations ────────────────────────────────────────────────────
      this.safeAnim(`Monk_${c}_idle`,   `Monk_${c}`, 0, 5, 10, true);
      this.safeAnim(`Monk_${c}_run`,    `Monk_${c}`, 0, 5, 10, true);
      this.safeAnim(`Monk_${c}_attack`, `Monk_${c}`, 0, 5, 10, false);
      this.safeAnim(`Monk_${c}_heal`,   `Monk_${c}`, 0, 5, 10, true);
      this.safeAnim(`Monk_${c}_dead`,   'Dead', 0, 3, 8, false);
    }

    // ── Explosion FX ────────────────────────────────────────────────────────
    this.safeAnim('fx_explosion_play', 'fx_explosion', 0, 7, 12, false);
  }

  private safeAnim(
    key: string,
    texture: string,
    start: number,
    end: number,
    frameRate: number,
    repeat: boolean,
  ) {
    if (this.anims.exists(key)) return;
    if (!this.textures.exists(texture)) return;

    // Clamp to actual frame count
    const totalFrames = this.textures.get(texture).frameTotal - 1; // -1 for __BASE
    const safeEnd = Math.min(end, totalFrames - 1);
    if (safeEnd < start) return;

    this.anims.create({
      key,
      frames: this.anims.generateFrameNumbers(texture, { start, end: safeEnd }),
      frameRate,
      repeat: repeat ? -1 : 0,
    });
  }

  private createLoadingBar() {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    const bg = this.add.graphics();
    bg.fillStyle(0x1a0f05);
    bg.fillRect(0, 0, width, height);

    const title = this.add.text(cx, cy - 60, 'TINY KINGDOMS', {
      fontFamily: 'serif',
      fontSize: '36px',
      color: '#ffe066',
      stroke: '#5a3a00',
      strokeThickness: 5,
    });
    title.setOrigin(0.5);

    const barW = 320;
    const barH = 20;
    const barX = cx - barW / 2;
    const barY = cy;

    const barBg = this.add.graphics();
    barBg.fillStyle(0x3a2510);
    barBg.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);

    const bar = this.add.graphics();

    const label = this.add.text(cx, cy + 36, 'Loading...', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#aa8855',
    });
    label.setOrigin(0.5);

    this.load.on('progress', (value: number) => {
      bar.clear();
      bar.fillStyle(0xd4a044);
      bar.fillRect(barX, barY, Math.round(barW * value), barH);
      label.setText(`Loading... ${Math.round(value * 100)}%`);
    });
  }
}
