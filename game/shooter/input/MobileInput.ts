import * as Phaser from 'phaser';
import type { InputFrame } from './DesktopInput';

interface Stick { active: boolean; pointerId: number; ox: number; oy: number; vx: number; vy: number; }

export class MobileInput {
  private leftStick: Stick = { active: false, pointerId: -1, ox: 0, oy: 0, vx: 0, vy: 0 };
  private rightStick: Stick = { active: false, pointerId: -1, ox: 0, oy: 0, vx: 0, vy: 0 };
  private swapBtnHandler: (e: Event) => void;
  private swapPressed = false;
  private radius = 60;
  private lastAim = 0;

  constructor(scene: Phaser.Scene) {
    scene.input.addPointer(2);
    scene.input.on('pointerdown', this._down, this);
    scene.input.on('pointermove', this._move, this);
    scene.input.on('pointerup',   this._up,   this);
    this.swapBtnHandler = () => { this.swapPressed = true; };
    window.addEventListener('shooter-swap', this.swapBtnHandler);
  }

  private _down(p: Phaser.Input.Pointer) {
    const isLeft = p.x < window.innerWidth / 2;
    const stick = isLeft ? this.leftStick : this.rightStick;
    if (stick.active) return;
    stick.active = true;
    stick.pointerId = p.id;
    stick.ox = p.x; stick.oy = p.y;
    stick.vx = 0; stick.vy = 0;
  }

  private _move(p: Phaser.Input.Pointer) {
    for (const stick of [this.leftStick, this.rightStick]) {
      if (!stick.active || stick.pointerId !== p.id) continue;
      let dx = p.x - stick.ox, dy = p.y - stick.oy;
      const len = Math.hypot(dx, dy);
      if (len > this.radius) { dx = dx * this.radius / len; dy = dy * this.radius / len; }
      stick.vx = dx / this.radius;
      stick.vy = dy / this.radius;
    }
  }

  private _up(p: Phaser.Input.Pointer) {
    for (const stick of [this.leftStick, this.rightStick]) {
      if (stick.pointerId !== p.id) continue;
      stick.active = false;
      stick.pointerId = -1;
      stick.vx = 0; stick.vy = 0;
    }
  }

  sample(_scene: Phaser.Scene, _localContainer: Phaser.GameObjects.Container): InputFrame {
    const mv = { x: this.leftStick.vx, y: this.leftStick.vy };
    const rxy = this.rightStick.active ? { x: this.rightStick.vx, y: this.rightStick.vy } : null;
    if (rxy && Math.hypot(rxy.x, rxy.y) > 0.15) {
      this.lastAim = Math.atan2(rxy.y, rxy.x);
    }
    const aim = this.lastAim;
    const fire = !!rxy && Math.hypot(rxy.x, rxy.y) > 0.3;
    const f: InputFrame = { mv, aim, fire, swap: this.swapPressed, reload: false };
    this.swapPressed = false;
    return f;
  }

  destroy() { window.removeEventListener('shooter-swap', this.swapBtnHandler); }
}
