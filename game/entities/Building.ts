import * as Phaser from 'phaser';
import type { BuildingType } from '../config/buildings';
import type { Faction } from '../config/units';
import { BUILDING_CONFIGS } from '../config/buildings';
import { TILE_SIZE } from '../config/map';
import type { Unit } from './Unit';

let nextBuildingId = 1;

export class Building {
  public sprite: Phaser.GameObjects.Image;
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

    this.sprite = scene.add.image(this.wx, this.wy, key);
    this.sprite.setDepth(5);
    this.sprite.setScale(0.5);

    this.hpBar = scene.add.graphics();
    this.hpBar.setDepth(25);

    this.drawHpBar();
  }

  update(delta: number, enemies: Unit[]) {
    if (this.isDestroyed) return;

    const dt = delta / 1000;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    if (this.type === 'tower' && this.attackRange > 0 && this.attackCooldown <= 0) {
      this.towerShoot(enemies);
    }

    this.drawHpBar();
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
      this.spawnArrow(closest);
    }
  }

  private spawnArrow(target: Unit) {
    const arrow = this.scene.add.graphics();
    arrow.fillStyle(0xffcc00, 1);
    arrow.fillCircle(0, 0, 3);
    arrow.setPosition(this.wx, this.wy - 32);
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
    if (this.hp <= 0) {
      this.destroy();
    }
  }

  private drawHpBar() {
    if (this.isDestroyed) {
      this.hpBar.clear();
      return;
    }
    const pct = this.hp / this.maxHp;
    const barW = 56;
    const barH = 5;
    const halfW = BUILDING_CONFIGS[this.type].width * TILE_SIZE / 2;
    const bx = this.wx - barW / 2;
    const by = this.wy - halfW * 0.5 - 18;

    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.7);
    this.hpBar.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
    this.hpBar.fillStyle(pct > 0.5 ? 0x44dd44 : pct > 0.25 ? 0xffcc00 : 0xff3322);
    this.hpBar.fillRect(bx, by, Math.round(barW * pct), barH);
  }

  destroy() {
    this.isDestroyed = true;
    this.hp = 0;
    // Show destroyed sprite if available
    const factionCap = this.faction === 'blue' ? 'Blue' : 'Red';
    const typeCap = this.type.charAt(0).toUpperCase() + this.type.slice(1);
    const destroyedKey = `building_${typeCap}_Destroyed`;
    if (this.scene.textures.exists(destroyedKey)) {
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
    this.hpBar.destroy();
  }
}
