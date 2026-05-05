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
    // Also load as spritesheets for per-tile rendering (64×64 tiles)
    this.load.spritesheet('tf', BASE + 'Terrain/Ground/Tilemap_Flat.png',      { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('te', BASE + 'Terrain/Ground/Tilemap_Elevation.png', { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('ts', BASE + 'Terrain/Ground/Shadows.png',            { frameWidth: 64, frameHeight: 64 });

    // ── Resources ────────────────────────────────────────────────────────────
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
      this.load.image(
        `building_Fort_${f}`,
        FREE + `Tiny%20Swords%20(Free%20Pack)/Buildings/${fEnc}%20Buildings/Archery.png`,
      );
      this.load.image(
        `building_Workshop_${f}`,
        FREE + `Tiny%20Swords%20(Free%20Pack)/Buildings/${fEnc}%20Buildings/Monastery.png`,
      );
    }

    // Goblin structures used by expanded roster
    this.load.image('building_GoblinHouse', BASE + 'Factions/Goblins/Buildings/Wood_House/Goblin_House.png');
    this.load.image('building_GoblinHouse_Destroyed', BASE + 'Factions/Goblins/Buildings/Wood_House/Goblin_House_Destroyed.png');
    this.load.image('building_WoodTower_Destroyed', BASE + 'Factions/Goblins/Buildings/Wood_Tower/Wood_Tower_Destroyed.png');
    this.load.image('building_WoodTower_Blue', BASE + 'Factions/Goblins/Buildings/Wood_Tower/Wood_Tower_Blue.png');
    this.load.image('building_WoodTower_Red', BASE + 'Factions/Goblins/Buildings/Wood_Tower/Wood_Tower_Red.png');

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

      // Free Pack variants for added unit roster
      this.load.spritesheet(
        `Lancer_${c}`,
        FREE + `Tiny%20Swords%20(Free%20Pack)/Units/${cEnc}%20Units/Lancer/Lancer_Idle.png`,
        { frameWidth: 192, frameHeight: 320 },
      );
      this.load.spritesheet(
        `LancerRun_${c}`,
        FREE + `Tiny%20Swords%20(Free%20Pack)/Units/${cEnc}%20Units/Lancer/Lancer_Run.png`,
        { frameWidth: 192, frameHeight: 320 },
      );
      this.load.spritesheet(
        `LancerAttack_${c}`,
        FREE + `Tiny%20Swords%20(Free%20Pack)/Units/${cEnc}%20Units/Lancer/Lancer_Right_Attack.png`,
        { frameWidth: 192, frameHeight: 320 },
      );
      this.load.spritesheet(
        `Slinger_${c}`,
        FREE + `Tiny%20Swords%20(Free%20Pack)/Units/${cEnc}%20Units/Archer/Archer_Idle.png`,
        { frameWidth: 192, frameHeight: 192 },
      );
      this.load.spritesheet(
        `SlingerRun_${c}`,
        FREE + `Tiny%20Swords%20(Free%20Pack)/Units/${cEnc}%20Units/Archer/Archer_Run.png`,
        { frameWidth: 192, frameHeight: 192 },
      );
      this.load.spritesheet(
        `SlingerAttack_${c}`,
        FREE + `Tiny%20Swords%20(Free%20Pack)/Units/${cEnc}%20Units/Archer/Archer_Shoot.png`,
        { frameWidth: 192, frameHeight: 192 },
      );

      // Goblin troop variants for extra NPC roster
      this.load.spritesheet(`Torch_${c}`, BASE + `Factions/Goblins/Troops/Torch/${cEnc}/Torch_${cEnc}.png`, {
        frameWidth: 192, frameHeight: 192,
      });
      this.load.spritesheet(`Barrel_${c}`, BASE + `Factions/Goblins/Troops/Barrel/${cEnc}/Barrel_${cEnc}.png`, {
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
      frameWidth: 128, frameHeight: 128,
    });

    // ── UI ────────────────────────────────────────────────────────────────────
    this.load.image('ui_btn_blue',  BASE + 'UI/Buttons/Button_Blue.png');
    this.load.image('ui_btn_red',   BASE + 'UI/Buttons/Button_Red.png');
    this.load.image('ui_banner_h',  BASE + 'UI/Banners/Banner_Horizontal.png');
    this.load.image('ui_banner_v',  BASE + 'UI/Banners/Banner_Vertical.png');
    this.load.image('ui_carved',    BASE + 'UI/Banners/Carved_9Slides.png');

    // ── Tilemap aliases for new layered tilemap renderer ─────────────────────
    this.load.image('tilemap_flat',   BASE + 'Terrain/Ground/Tilemap_Flat.png');
    this.load.image('tilemap_elev',   BASE + 'Terrain/Ground/Tilemap_Elevation.png');
    this.load.image('tilemap_bridge', BASE + 'Terrain/Bridge/Bridge_All.png');

    // Foam as animated spritesheet (192×192 frames).
    this.load.spritesheet('foam', BASE + 'Terrain/Water/Foam/Foam.png', {
      frameWidth: 192, frameHeight: 192,
    });

    // Sheep — Tiny Swords Resources/Sheep — 128×128 frames, 8 idle, 6 bouncing.
    this.load.spritesheet('sheep_idle',     BASE + 'Resources/Sheep/HappySheep_Idle.png',     { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('sheep_bouncing', BASE + 'Resources/Sheep/HappySheep_Bouncing.png', { frameWidth: 128, frameHeight: 128 });

    // ── Decorations ──────────────────────────────────────────────────────────
    for (let i = 1; i <= 18; i++) {
      const nn = String(i).padStart(2, '0');
      this.load.image(`deco_${nn}`, BASE + `Deco/${nn}.png`);
    }

    // ── Trees (spritesheet for variant frames 0-5) ────────────────────────────
    this.load.spritesheet('tree_sheet', BASE + 'Resources/Trees/Tree.png', {
      frameWidth: 192, frameHeight: 192,
    });
    this.load.image('tree_stump_1', FREE + 'Tiny%20Swords%20(Free%20Pack)/Terrain/Resources/Wood/Trees/Stump%201.png');
    this.load.image('tree_stump_2', FREE + 'Tiny%20Swords%20(Free%20Pack)/Terrain/Resources/Wood/Trees/Stump%202.png');
    this.load.image('tree_stump_3', FREE + 'Tiny%20Swords%20(Free%20Pack)/Terrain/Resources/Wood/Trees/Stump%203.png');
    this.load.image('tree_stump_4', FREE + 'Tiny%20Swords%20(Free%20Pack)/Terrain/Resources/Wood/Trees/Stump%204.png');

    // ── Water rocks (animation strips – use frame 0 for static decoration) ───
    this.load.spritesheet('rock_pile',  BASE + 'Terrain/Water/Rocks/Rocks_03.png', { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('rock_small', BASE + 'Terrain/Water/Rocks/Rocks_01.png', { frameWidth: 64,  frameHeight: 64  });
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

      // ── Added roster animations (free pack variants) ────────────────────
      this.safeAnim(`Lancer_${c}_idle`,   `Lancer_${c}`, 0, 9, 10, true);
      this.safeAnim(`Lancer_${c}_run`,    `LancerRun_${c}`, 0, 9, 12, true);
      this.safeAnim(`Lancer_${c}_attack`, `LancerAttack_${c}`, 0, 4, 12, false);
      this.safeAnim(`Lancer_${c}_heal`,   `Lancer_${c}`, 0, 5, 8, true);
      this.safeAnim(`Lancer_${c}_dead`,   'Dead', 0, 3, 8, false);

      this.safeAnim(`Slinger_${c}_idle`,   `Slinger_${c}`, 0, 5, 10, true);
      this.safeAnim(`Slinger_${c}_run`,    `SlingerRun_${c}`, 0, 5, 10, true);
      this.safeAnim(`Slinger_${c}_attack`, `SlingerAttack_${c}`, 0, 5, 12, false);
      this.safeAnim(`Slinger_${c}_heal`,   `Slinger_${c}`, 0, 5, 8, true);
      this.safeAnim(`Slinger_${c}_dead`,   'Dead', 0, 3, 8, false);

      // ── Monk animations ────────────────────────────────────────────────────
      this.safeAnim(`Monk_${c}_idle`,   `Monk_${c}`, 0, 5, 10, true);
      this.safeAnim(`Monk_${c}_run`,    `Monk_${c}`, 0, 5, 10, true);
      this.safeAnim(`Monk_${c}_attack`, `Monk_${c}`, 0, 5, 10, false);
      this.safeAnim(`Monk_${c}_heal`,   `Monk_${c}`, 0, 5, 10, true);
      this.safeAnim(`Monk_${c}_dead`,   'Dead', 0, 3, 8, false);

      // ── Goblin troop variants ─────────────────────────────────────────────
      this.safeAnim(`Torch_${c}_idle`,   `Torch_${c}`, 0, 5, 10, true);
      this.safeAnim(`Torch_${c}_run`,    `Torch_${c}`, 6, 13, 10, true);
      this.safeAnim(`Torch_${c}_attack`, `Torch_${c}`, 14, 19, 10, false);
      this.safeAnim(`Torch_${c}_heal`,   `Torch_${c}`, 0, 5, 8, true);
      this.safeAnim(`Torch_${c}_dead`,   'Dead', 0, 3, 8, false);

      this.safeAnim(`Barrel_${c}_idle`,   `Barrel_${c}`, 0, 5, 10, true);
      this.safeAnim(`Barrel_${c}_run`,    `Barrel_${c}`, 6, 13, 10, true);
      this.safeAnim(`Barrel_${c}_attack`, `Barrel_${c}`, 14, 19, 10, false);
      this.safeAnim(`Barrel_${c}_heal`,   `Barrel_${c}`, 0, 5, 8, true);
      this.safeAnim(`Barrel_${c}_dead`,   'Dead', 0, 3, 8, false);
    }

    // ── Explosion FX ────────────────────────────────────────────────────────
    this.safeAnim('fx_explosion_play', 'fx_explosion', 0, 7, 12, false);

    // Sheep ambient animations
    this.safeAnim('sheep_idle_loop',  'sheep_idle',     0, 7, 6, true);
    this.safeAnim('sheep_walk_loop',  'sheep_bouncing', 0, 5, 8, true);
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
