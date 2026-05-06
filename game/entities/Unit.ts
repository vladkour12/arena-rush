import * as Phaser from 'phaser';
import type { UnitType, Faction } from '../config/units';
import { UNIT_CONFIGS } from '../config/units';
import { TILE_SIZE, MAP_H } from '../config/map';
import { playMeleeHit, playArrowShoot } from '../../utils/sounds';

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
  private bobTime = 0;
  private facingFlipCooldown = 0;
  private chaseRetargetCooldown = 0;
  private routePlanner: ((fromX: number, fromY: number, toX: number, toY: number) => { x: number; y: number }[]) | null = null;
  private baseTint = 0xffffff;
  /** Called when this unit delivers the killing blow to an enemy unit. */
  public onKill?: () => void;

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
    const typeCap = this.getVisualTypeCap(type);
    const key = `${typeCap}_${factionCap}`;

    this.shadow = scene.add.ellipse(x, y + 12, 20, 7, 0x000000, 0.25);
    this.shadow.setDepth(9);

    this.sprite = scene.add.sprite(x, y, key, 0);
    this.sprite.setDepth(10);
    this.sprite.setScale(this.getVisualScale(type));

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

    this.applyVisualPose(0);
    this.playAnim('idle');
  }

  playAnim(name: 'idle' | 'run' | 'attack' | 'dead' | 'heal', forceRestart = false) {
    const factionCap = this.state.faction === 'blue' ? 'Blue' : 'Red';
    const typeCap = this.getVisualTypeCap(this.state.type);
    const animKey = `${typeCap}_${factionCap}_${name}`;
    if (this.sprite.anims.currentAnim?.key !== animKey || forceRestart || name === 'dead') {
      this.sprite.play(animKey, true);
    }
  }

  private getVisualTypeCap(type: UnitType) {
    if (type === 'slinger') return 'Slinger';
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  private getVisualScale(_type: UnitType) {
    return 0.32;
  }

  private getHpBarYOffset(_type: UnitType) {
    return 28;
  }

  setPath(path: { x: number; y: number }[]) {
    this.path = path;
    this.pathIndex = 0;
    if (path.length > 0) {
      this.state.state = 'moving';
      this.playAnim('run');
    }
  }

  setRoutePlanner(planner: (fromX: number, fromY: number, toX: number, toY: number) => { x: number; y: number }[]) {
    this.routePlanner = planner;
  }

  moveTo(wx: number, wy: number) {
    this.state.targetX = wx;
    this.state.targetY = wy;
    if (this.routePlanner) {
      const plannedPath = this.routePlanner(this.state.x, this.state.y, wx, wy);
      if (plannedPath.length > 0) {
        this.setPath(plannedPath);
        return;
      }
    }
    this.setPath([{ x: wx, y: wy }]);
  }

  update(delta: number) {
    if (this.state.state === 'dead') return;

    const dt = delta / 1000;
    const cfg = UNIT_CONFIGS[this.state.type];

    // Reduce cooldowns
    this.state.attackCooldown = Math.max(0, this.state.attackCooldown - dt);
    this.state.healCooldown = Math.max(0, this.state.healCooldown - dt);
    this.facingFlipCooldown = Math.max(0, this.facingFlipCooldown - dt);
    this.chaseRetargetCooldown = Math.max(0, this.chaseRetargetCooldown - dt);

    if (this.state.state === 'moving' || this.state.state === 'idle') {
      this.moveAlongPath(dt, cfg.speed);
    }

    if (this.state.state === 'attacking') {
      this.handleAttack(dt, cfg);
    }

    // Update visuals
    this.applyVisualPose(dt);
    this.drawHpBar();
  }

  private computeElevationLift(): number {
    // Higher ground near top of the map receives stronger vertical lift.
    const yNorm = Phaser.Math.Clamp(this.state.y / MAP_H, 0, 1);
    return 4 + (1 - yNorm) * 10;
  }

  private applyVisualPose(dt: number) {
    this.bobTime += dt;
    const moving = this.state.state === 'moving';
    const bob = moving ? Math.sin(this.bobTime * 14) * 1.6 : 0;
    const lift = this.computeElevationLift();
    const visualY = this.state.y - lift + bob;

    this.sprite.setPosition(this.state.x, visualY);

    const shadowScaleX = Phaser.Math.Clamp(1 - lift * 0.025, 0.62, 1);
    const shadowScaleY = Phaser.Math.Clamp(1 - lift * 0.03, 0.58, 1);
    this.shadow.setPosition(this.state.x, this.state.y + 22 + bob * 0.25);
    this.shadow.setScale(shadowScaleX, shadowScaleY);
    this.shadow.setAlpha(Phaser.Math.Clamp(0.3 - lift * 0.012, 0.12, 0.3));
  }

  private moveAlongPath(dt: number, speed: number) {
    if (this.path.length === 0 || this.pathIndex >= this.path.length) {
      if (this.state.state === 'moving') this.finishPathSegment();
      return;
    }

    const target = this.path[this.pathIndex];
    const dx = target.x - this.state.x;
    const dy = target.y - this.state.y;
    const distSq = dx * dx + dy * dy;
    // Wider arrival threshold (was 4px) — avoids tiny oscillation around the
    // last waypoint when frame-time jitters or when path waypoints are dense.
    const arriveThreshold = 6;

    if (distSq < arriveThreshold * arriveThreshold) {
      this.pathIndex++;
      if (this.pathIndex >= this.path.length) this.finishPathSegment();
      return;
    }

    const dist = Math.sqrt(distSq);
    const vx = (dx / dist) * speed * dt;
    const vy = (dy / dist) * speed * dt;
    this.state.x += vx;
    this.state.y += vy;

    const faceThreshold = 10;
    const faceDebounce = 0.22;
    this.updateFacing(dx, faceThreshold, faceDebounce);
  }

  /** Path completed: re-engage the attack target if it's still alive, otherwise idle. */
  private finishPathSegment() {
    if (this.state.attackTarget && this.state.attackTarget.isAlive()) {
      // Seamlessly transition into attacking — handleAttack will run next tick
      // and either swing or close the remaining gap. No idle frame in between.
      this.state.state = 'attacking';
      this.path = [];
      this.pathIndex = 0;
      return;
    }
    this.state.state = 'idle';
    this.state.attackTarget = null;
    this.playAnim('idle');
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
    const chaseThreshold = effectiveRange * 1.12;

    if (dist > chaseThreshold) {
      // Keep a small gap for melee so units don't overlap and jitter in place.
      const keepDistance = effectiveRange * 0.82;
      const nx = dist > 0 ? dx / dist : 0;
      const ny = dist > 0 ? dy / dist : 0;
      const chaseX = target.state.x - nx * keepDistance;
      const chaseY = target.state.y - ny * keepDistance;
      const retargetDx = chaseX - this.state.targetX;
      const retargetDy = chaseY - this.state.targetY;
      // Wider re-path threshold (was 20px) and slower cooldown (was 0.12s)
      // reduce chase jitter when targets move slightly between ticks.
      const retargetNeeded = this.state.state !== 'moving' || (retargetDx * retargetDx + retargetDy * retargetDy) > 32 * 32;

      if (retargetNeeded && this.chaseRetargetCooldown <= 0) {
        this.moveTo(chaseX, chaseY);
        this.chaseRetargetCooldown = 0.22;
      }
      return;
    }

    if (this.state.state !== 'attacking') {
      this.state.state = 'attacking';
    }
    this.path = [];
    this.pathIndex = 0;

    const faceThreshold = 10;
    const faceDebounce = 0.22;
    this.updateFacing(dx, faceThreshold, faceDebounce);

    if (this.state.attackCooldown <= 0 && cfg.attackRate > 0) {
      // Always force-restart the attack animation on each swing.
      this.playAnim('attack', true);
      this.spawnAttackEffect(target);
      target.takeDamage(cfg.damage);
      if (!target.isAlive()) {
        this.onKill?.();
      }
      this.state.attackCooldown = 1 / cfg.attackRate;
    }
  }

  private spawnAttackEffect(target: Unit) {
    if (this.state.type === 'archer') {
      playArrowShoot();
      this.spawnArrowProjectile(target.state.x, target.state.y);
      return;
    }
    if (this.state.type === 'slinger') {
      playArrowShoot();
      this.spawnStoneProjectile(target.state.x, target.state.y);
      return;
    }
    // Melee impact sound for all other unit types
    playMeleeHit();
  }

  private spawnArrowProjectile(targetX: number, targetY: number) {
    const arrow = this.scene.add.rectangle(this.state.x, this.sprite.y - 10, 16, 3, 0xe9d27a, 1);
    arrow.setStrokeStyle(1, 0x6e4f1f, 0.9);
    arrow.setDepth(16);
    arrow.rotation = Phaser.Math.Angle.Between(this.state.x, this.state.y, targetX, targetY);

    const duration = Phaser.Math.Clamp(Phaser.Math.Distance.Between(this.state.x, this.state.y, targetX, targetY) * 2.1, 120, 240);
    this.scene.tweens.add({
      targets: arrow,
      x: targetX,
      y: targetY - 10,
      duration,
      ease: 'Linear',
      onComplete: () => arrow.destroy(),
    });
  }

  private spawnStoneProjectile(targetX: number, targetY: number) {
    const stone = this.scene.add.circle(this.state.x, this.sprite.y - 8, 4, 0xc7ccd3, 1);
    stone.setStrokeStyle(2, 0x55606d, 0.95);
    stone.setDepth(16);

    const startX = this.state.x;
    const startY = this.sprite.y - 8;
    const arcHeight = Phaser.Math.Clamp(Phaser.Math.Distance.Between(startX, startY, targetX, targetY) * 0.12, 12, 28);
    const tweenState = { t: 0 };
    const duration = Phaser.Math.Clamp(Phaser.Math.Distance.Between(startX, startY, targetX, targetY) * 3.1, 180, 320);

    this.scene.tweens.add({
      targets: tweenState,
      t: 1,
      duration,
      ease: 'Sine.easeOut',
      onUpdate: () => {
        const t = tweenState.t;
        stone.x = Phaser.Math.Linear(startX, targetX, t);
        stone.y = Phaser.Math.Linear(startY, targetY - 8, t) - Math.sin(t * Math.PI) * arcHeight;
      },
      onComplete: () => stone.destroy(),
    });
  }

  private updateFacing(dx: number, minAbsDx: number, flipDebounceSec: number) {
    if (Math.abs(dx) <= minAbsDx) return;
    const nextFlipX = dx < 0;
    if (this.sprite.flipX === nextFlipX) return;
    if (this.facingFlipCooldown > 0) return;
    this.sprite.setFlipX(nextFlipX);
    this.facingFlipCooldown = flipDebounceSec;
  }

  takeDamage(amount: number) {
    if (this.state.state === 'dead') return;
    this.state.hp = Math.max(0, this.state.hp - amount);
    // Brief red flash on hit
    this.sprite.setTint(0xff3333);
    this.scene.time.delayedCall(85, () => {
      if (this.state.state !== 'dead') {
        if (this.baseTint !== 0xffffff) this.sprite.setTint(this.baseTint);
        else this.sprite.clearTint();
      }
    });
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
    const by = this.state.y - this.computeElevationLift() - this.getHpBarYOffset(this.state.type);

    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.6);
    this.hpBar.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
    this.hpBar.fillStyle(pct > 0.5 ? 0x44dd44 : pct > 0.25 ? 0xffcc00 : 0xff3322);
    this.hpBar.fillRect(bx, by, Math.round(barW * pct), barH);
  }

  attack(target: Unit) {
    if (this.state.state === 'attacking' && this.state.attackTarget === target) return;
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

  translateWorld(dx: number, dy: number) {
    this.state.x += dx;
    this.state.y += dy;
    this.state.targetX += dx;
    this.state.targetY += dy;
    this.path = this.path.map((point) => ({ x: point.x + dx, y: point.y + dy }));
    this.applyVisualPose(0);
    this.drawHpBar();
  }

  destroy() {
    this.sprite.destroy();
    this.hpBar.destroy();
    this.shadow.destroy();
  }
}
