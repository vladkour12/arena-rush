import * as Phaser from 'phaser';
import type { UnitType, Faction } from '../config/units';
import { UNIT_CONFIGS } from '../config/units';
import { TILE_SIZE } from '../config/map';

export interface UnitState {
  id: number;
  faction: Faction;
  type: UnitType;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  attackTarget: Unit | null;
  state: 'idle' | 'moving' | 'attacking' | 'healing' | 'dead';
  attackCooldown: number;
  healCooldown: number;
}

let nextId = 1;

export class Unit {
  public sprite: Phaser.GameObjects.Sprite;
  public hpBar: Phaser.GameObjects.Graphics;
  public shadow: Phaser.GameObjects.Ellipse;
  public state: UnitState;
  private scene: Phaser.Scene;
  private path: { x: number; y: number }[] = [];
  private pathIndex = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    type: UnitType,
    faction: Faction,
  ) {
    this.scene = scene;
    const cfg = UNIT_CONFIGS[type];
    const factionCap = faction === 'blue' ? 'Blue' : 'Red';
    const typeCap = type.charAt(0).toUpperCase() + type.slice(1);
    const key = `${typeCap}_${factionCap}`;

    this.shadow = scene.add.ellipse(x, y + 20, 32, 10, 0x000000, 0.25);
    this.shadow.setDepth(1);

    this.sprite = scene.add.sprite(x, y, key, 0);
    this.sprite.setDepth(10);
    this.sprite.setScale(0.5);

    this.hpBar = scene.add.graphics();
    this.hpBar.setDepth(20);

    this.state = {
      id: nextId++,
      faction,
      type,
      hp: cfg.hp,
      maxHp: cfg.hp,
      x, y,
      targetX: x,
      targetY: y,
      attackTarget: null,
      state: 'idle',
      attackCooldown: 0,
      healCooldown: 0,
    };

    this.playAnim('idle');
  }

  playAnim(name: 'idle' | 'run' | 'attack' | 'dead' | 'heal') {
    const factionCap = this.state.faction === 'blue' ? 'Blue' : 'Red';
    const typeCap = this.state.type.charAt(0).toUpperCase() + this.state.type.slice(1);
    const animKey = `${typeCap}_${factionCap}_${name}`;
    if (this.sprite.anims.currentAnim?.key !== animKey || name === 'attack' || name === 'dead') {
      this.sprite.play(animKey, true);
    }
  }

  setPath(path: { x: number; y: number }[]) {
    this.path = path;
    this.pathIndex = 0;
    if (path.length > 0) {
      this.state.state = 'moving';
      this.playAnim('run');
    }
  }

  moveTo(wx: number, wy: number) {
    this.state.targetX = wx;
    this.state.targetY = wy;
    this.setPath([{ x: wx, y: wy }]);
  }

  update(delta: number) {
    if (this.state.state === 'dead') return;

    const dt = delta / 1000;
    const cfg = UNIT_CONFIGS[this.state.type];

    // Reduce cooldowns
    this.state.attackCooldown = Math.max(0, this.state.attackCooldown - dt);
    this.state.healCooldown = Math.max(0, this.state.healCooldown - dt);

    if (this.state.state === 'moving' || this.state.state === 'idle') {
      this.moveAlongPath(dt, cfg.speed);
    }

    if (this.state.state === 'attacking') {
      this.handleAttack(dt, cfg);
    }

    if (this.state.type === 'monk') {
      this.handleHeal(dt, cfg);
    }

    // Update visuals
    this.sprite.setPosition(this.state.x, this.state.y);
    this.shadow.setPosition(this.state.x, this.state.y + 22);
    this.drawHpBar();
  }

  private moveAlongPath(dt: number, speed: number) {
    if (this.path.length === 0 || this.pathIndex >= this.path.length) {
      if (this.state.state === 'moving') {
        this.state.state = 'idle';
        this.playAnim('idle');
      }
      return;
    }

    const target = this.path[this.pathIndex];
    const dx = target.x - this.state.x;
    const dy = target.y - this.state.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 4) {
      this.pathIndex++;
      if (this.pathIndex >= this.path.length) {
        this.state.state = 'idle';
        this.playAnim('idle');
      }
      return;
    }

    const vx = (dx / dist) * speed * dt;
    const vy = (dy / dist) * speed * dt;
    this.state.x += vx;
    this.state.y += vy;

    // Flip sprite based on direction
    this.sprite.setFlipX(dx < 0);
  }

  private handleAttack(dt: number, cfg: typeof UNIT_CONFIGS[UnitType]) {
    const target = this.state.attackTarget;
    if (!target || target.state.state === 'dead') {
      this.state.attackTarget = null;
      this.state.state = 'idle';
      this.playAnim('idle');
      return;
    }

    const dx = target.state.x - this.state.x;
    const dy = target.state.y - this.state.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const effectiveRange = cfg.range > 0 ? cfg.range : TILE_SIZE * 0.75;

    if (dist > effectiveRange) {
      // Chase target
      this.setPath([{ x: target.state.x, y: target.state.y }]);
      return;
    }

    // Face target
    this.sprite.setFlipX(dx < 0);
    this.playAnim('attack');

    if (this.state.attackCooldown <= 0 && cfg.attackRate > 0) {
      target.takeDamage(cfg.damage);
      this.state.attackCooldown = 1 / cfg.attackRate;
    }
  }

  private handleHeal(dt: number, cfg: typeof UNIT_CONFIGS[UnitType]) {
    if (!cfg.healRate) return;
    if (this.state.healCooldown > 0) return;
    // Healing logic is handled by CombatSystem — monks emit heal events
  }

  takeDamage(amount: number) {
    if (this.state.state === 'dead') return;
    this.state.hp = Math.max(0, this.state.hp - amount);
    if (this.state.hp <= 0) {
      this.die();
    }
  }

  die() {
    this.state.state = 'dead';
    this.state.attackTarget = null;
    this.path = [];
    this.playAnim('dead');
    this.sprite.once('animationcomplete', () => {
      this.destroy();
    });
  }

  private drawHpBar() {
    if (this.state.state === 'dead') {
      this.hpBar.clear();
      return;
    }
    const pct = this.state.hp / this.state.maxHp;
    const barW = 36;
    const barH = 4;
    const bx = this.state.x - barW / 2;
    const by = this.state.y - 44;

    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.6);
    this.hpBar.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
    this.hpBar.fillStyle(pct > 0.5 ? 0x44dd44 : pct > 0.25 ? 0xffcc00 : 0xff3322);
    this.hpBar.fillRect(bx, by, Math.round(barW * pct), barH);
  }

  attack(target: Unit) {
    this.state.attackTarget = target;
    this.state.state = 'attacking';
    this.path = [];
    this.pathIndex = 0;
  }

  stopAttack() {
    this.state.attackTarget = null;
    if (this.state.state === 'attacking') {
      this.state.state = 'idle';
      this.playAnim('idle');
    }
  }

  isAlive() {
    return this.state.state !== 'dead';
  }

  destroy() {
    this.sprite.destroy();
    this.hpBar.destroy();
    this.shadow.destroy();
  }
}
