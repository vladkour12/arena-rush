import * as Phaser from 'phaser';

export interface InputFrame {
  mv: { x: number; y: number };
  aim: number;
  fire: boolean;
  swap: boolean;
  reload: boolean;
}

export class DesktopInput {
  private keys: Record<string, Phaser.Input.Keyboard.Key>;
  private swapPressed = false;
  private reloadPressed = false;

  constructor(scene: Phaser.Scene) {
    const k = scene.input.keyboard!;
    this.keys = {
      W: k.addKey('W'), A: k.addKey('A'), S: k.addKey('S'), D: k.addKey('D'),
      Q: k.addKey('Q'), R: k.addKey('R'),
    };
    k.on('keydown-Q', () => { this.swapPressed = true; });
    k.on('keydown-R', () => { this.reloadPressed = true; });
  }

  sample(scene: Phaser.Scene, localContainer: Phaser.GameObjects.Container): InputFrame {
    const mv = { x: 0, y: 0 };
    if (this.keys.W.isDown) mv.y -= 1;
    if (this.keys.S.isDown) mv.y += 1;
    if (this.keys.A.isDown) mv.x -= 1;
    if (this.keys.D.isDown) mv.x += 1;
    const ptr = scene.input.activePointer;
    const wp = scene.cameras.main.getWorldPoint(ptr.x, ptr.y);
    const aim = Math.atan2(wp.y - localContainer.y, wp.x - localContainer.x);
    const fire = ptr.leftButtonDown();
    const f = { mv, aim, fire, swap: this.swapPressed, reload: this.reloadPressed };
    this.swapPressed = false;
    this.reloadPressed = false;
    return f;
  }

  destroy() {}
}
