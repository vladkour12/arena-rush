import * as Phaser from 'phaser';
import type { BuildingType } from '../config/buildings';
import type { Faction } from '../config/units';
import { BUILDING_CONFIGS } from '../config/buildings';
import { TILE_SIZE, MAP_H } from '../config/map';
import type { Unit } from './Unit';
import { playBuildingDestroyed, playCastleHit, playTowerShoot } from '../../utils/sounds';

let nextBuildingId = 1;

export class Building {
  public sprite: Phaser.GameObjects.Image;
  public shadow: Phaser.GameObjects.Ellipse;
  public hpBar: Phaser.GameObjects.Graphics;
  public id: number;
  public type: BuildingType;
  public faction: Faction;
  public hp: number;
  public maxHp: number;
  public tx: number;
  public ty: number;
  public wx: number;
  public wy: number;
  public isDestroyed = false;

  private scene: Phaser.Scene;
  private attackCooldown = 0;
  private attackRange: number;
  private attackDamage: number;
  private attackRate: number;
  private elevationLift = 0;

  constructor(scene: Phaser.Scene, tx: number, ty: number, type: BuildingType, faction: Faction) {
    this.scene = scene;
    this.id = nextBuildingId++;
    this.type = type;
    this.faction = faction;
    this.tx = tx;
    this.ty = ty;

    const cfg = BUILDING_CONFIGS[type];
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.attackRange = cfg.attackRange ?? 0;
    this.attackDamage = cfg.attackDamage ?? 0;
    this.attackRate = cfg.attackRate ?? 0;

    // Center pixel position
    this.wx = (tx + cfg.width / 2) * TILE_SIZE;
    this.wy = (ty + cfg.height / 2) * TILE_SIZE;

    const factionCap = faction === 'blue' ? 'Blue' : 'Red';
    const typeCap = type.charAt(0).toUpperCase() + type.slice(1);
    const key = `building_${typeCap}_${factionCap}`;

    const shadowW = Math.max(24, cfg.width * 34);
    const shadowH = Math.max(10, cfg.height * 11);
    this.shadow = scene.add.ellipse(this.wx, this.wy + cfg.height * 12, shadowW, shadowH, 0x000000, 0.24);
    this.shadow.setDepth(4);

    this.sprite = scene.add.image(this.wx, this.wy, key);
    this.sprite.setDepth(5);
    this.sprite.setScale(0.5);

    this.hpBar = scene.add.graphics();
    this.hpBar.setDepth(25);

    this.applyVisualPose();
    this.drawHpBar();
  }

  update(delta: number, enemies: Unit[]) {
    if (this.isDestroyed) return;

    const dt = delta / 1000;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    if ((this.type === 'tower' || this.type === 'fort') && this.attackRange > 0 && this.attackCooldown <= 0) {
      this.towerShoot(enemies);
    }

    this.applyVisualPose();
    this.drawHpBar();
  }

  private computeElevationLift(): number {
    const yNorm = Phaser.Math.Clamp(this.wy / MAP_H, 0, 1);
    return 7 + (1 - yNorm) * 14;
  }

  private applyVisualPose() {
    const cfg = BUILDING_CONFIGS[this.type];
    this.elevationLift = this.computeElevationLift();
    this.sprite.setPosition(this.wx, this.wy - this.elevationLift);
    this.shadow.setPosition(this.wx, this.wy + cfg.height * 12);
    const shadowScale = Phaser.Math.Clamp(1 - this.elevationLift * 0.02, 0.58, 1);
    this.shadow.setScale(shadowScale, shadowScale * 0.92);
    this.shadow.setAlpha(Phaser.Math.Clamp(0.3 - this.elevationLift * 0.012, 0.14, 0.3));
  }

  private towerShoot(enemies: Unit[]) {
    let closest: Unit | null = null;
    let closestDist = Infinity;

    for (const unit of enemies) {
      if (!unit.isAlive()) continue;
      const dx = unit.state.x - this.wx;
      const dy = unit.state.y - this.wy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < this.attackRange && dist < closestDist) {
        closest = unit;
        closestDist = dist;
      }
    }

    if (closest) {
      closest.takeDamage(this.attackDamage);
      this.attackCooldown = 1 / this.attackRate;
      playTowerShoot();
      this.spawnArrow(closest);
    }
  }

  private spawnArrow(target: Unit) {
    const arrow = this.scene.add.graphics();
    arrow.fillStyle(0xffcc00, 1);
    arrow.fillCircle(0, 0, 3);
    arrow.setPosition(this.wx, this.sprite.y - 24);
    arrow.setDepth(15);

    const tx = target.state.x;
    const ty = target.state.y;
    const dist = Phaser.Math.Distance.Between(this.wx, this.wy, tx, ty);
    const duration = (dist / 300) * 1000;

    this.scene.tweens.add({
      targets: arrow,
      x: tx,
      y: ty,
      duration,
      ease: 'Linear',
      onComplete: () => arrow.destroy(),
    });
  }

  takeDamage(amount: number) {
    if (this.isDestroyed) return;
    this.hp = Math.max(0, this.hp - amount);

    // Brief red flash on hit
    this.sprite.setTint(0xff5555);
    this.scene.time.delayedCall(95, () => {
      if (!this.isDestroyed) this.sprite.clearTint();
    });

    // Castle hits: heavy thud + light camera shake (player feedback)
    if (this.type === 'castle' && this.faction === 'blue') {
      playCastleHit();
      this.scene.cameras.main.shake(120, 0.0035);
    }

    if (this.hp <= 0) {
      this.destroy();
    }
  }

  translateTiles(dxTiles: number, dyTiles: number) {
    this.tx += dxTiles;
    this.ty += dyTiles;
    this.wx += dxTiles * TILE_SIZE;
    this.wy += dyTiles * TILE_SIZE;
    if (this.isDestroyed) {
      this.sprite.setPosition(this.sprite.x + dxTiles * TILE_SIZE, this.sprite.y + dyTiles * TILE_SIZE);
      return;
    }
    this.applyVisualPose();
    this.drawHpBar();
  }

  private drawHpBar() {
    if (this.isDestroyed) {
      this.hpBar.clear();
      return;
    }
    const pct = this.hp / this.maxHp;
    const barW = 56;
    const barH = 5;
    const cfg = BUILDING_CONFIGS[this.type];
    const halfH = cfg.height * TILE_SIZE / 2;
    const bx = this.sprite.x - barW / 2;
    const by = this.sprite.y - halfH - 18;

    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.7);
    this.hpBar.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
    this.hpBar.fillStyle(pct > 0.5 ? 0x44dd44 : pct > 0.25 ? 0xffcc00 : 0xff3322);
    this.hpBar.fillRect(bx, by, Math.round(barW * pct), barH);
  }

  destroy() {
    this.isDestroyed = true;
    this.hp = 0;

    // Explosion sprite + sound
    playBuildingDestroyed();
    if (this.scene.textures.exists('fx_explosion')) {
      const ex = this.scene.add.sprite(this.sprite.x, this.sprite.y - 8, 'fx_explosion');
      ex.setDepth(40);
      const cfg = BUILDING_CONFIGS[this.type];
      ex.setScale(0.7 + cfg.width * 0.18);
      if (this.scene.anims.exists('fx_explosion_play')) {
        ex.play('fx_explosion_play');
        ex.once('animationcomplete', () => ex.destroy());
      } else {
        this.scene.time.delayedCall(700, () => ex.destroy());
      }
    }

    // Camera shake — bigger for castles & barracks
    const shakeIntensity = this.type === 'castle' ? 0.012 : 0.005;
    const shakeDuration  = this.type === 'castle' ? 380     : 220;
    this.scene.cameras.main.shake(shakeDuration, shakeIntensity);

    // Show destroyed sprite if available
    const visualType: BuildingType = this.type === 'fort' ? 'tower' : this.type === 'workshop' ? 'house' : this.type;
    const typeCap = visualType.charAt(0).toUpperCase() + visualType.slice(1);
    const destroyedKey = `building_${typeCap}_Destroyed`;
    if (this.scene.textures.exists(destroyedKey)) {
      this.sprite.clearTint();
      this.sprite.setTexture(destroyedKey);
    } else {
      // Tint red and fade
      this.scene.tweens.add({
        targets: this.sprite,
        alpha: 0.3,
        duration: 600,
        ease: 'Power2',
      });
    }
    this.shadow.destroy();
    this.hpBar.destroy();
  }
}
