import * as Phaser from 'phaser';
import { WALLS, MAP_WIDTH, MAP_HEIGHT, PICKUP_SPAWNS } from '../config/map';
import { Prediction } from '../net/Prediction';
import { Interpolation } from '../net/Interpolation';
import type { ShooterClient } from '../net/ShooterClient';
import type { SnapMsg } from '../net/protocol';
import { DesktopInput, type InputFrame } from '../input/DesktopInput';
import { MobileInput } from '../input/MobileInput';

interface InitData {
  client: ShooterClient;
  localPlayerId: string;
}

interface InputAdapter {
  sample: (scene: Phaser.Scene, c: Phaser.GameObjects.Container) => InputFrame;
  destroy: () => void;
}

export class ShooterScene extends Phaser.Scene {
  private client!: ShooterClient;
  private localPlayerId!: string;
  private localSlot: 'A' | 'B' | null = null;

  private playerSprites = new Map<string, Phaser.GameObjects.Container>();
  private bulletSprites = new Map<number, Phaser.GameObjects.Arc>();
  private pickupSprites = new Map<number, Phaser.GameObjects.Container>();

  private prediction!: Prediction;
  private remoteInterp = new Map<string, Interpolation>();

  private latestSnap: SnapMsg | null = null;
  private inputAdapter: InputAdapter | null = null;
  private lastInputAt = 0;

  constructor() { super({ key: 'Shooter' }); }

  init(data: InitData) {
    this.client = data.client;
    this.localPlayerId = data.localPlayerId;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a1a26');
    this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // Walls
    const g = this.add.graphics();
    g.fillStyle(0x3a3a4a, 1);
    g.lineStyle(2, 0x6a6a8a, 1);
    for (const w of WALLS) {
      g.fillRect(w.x, w.y, w.w, w.h);
      g.strokeRect(w.x, w.y, w.w, w.h);
    }

    // Pickup spawn placeholders
    for (const sp of PICKUP_SPAWNS) {
      const c = this.add.container(sp.x, sp.y);
      const ring = this.add.circle(0, 0, 24, 0x44ff88, 0.3);
      const label = this.add.text(0, 0, sp.kind[0].toUpperCase(), { fontSize: '20px', color: '#ffffff' }).setOrigin(0.5);
      c.add([ring, label]);
      this.pickupSprites.set(sp.id, c);
    }

    this.client.on('snap', (snap: SnapMsg) => this._onSnap(snap));
    this.client.on('matchStart', (msg: any) => this._onMatchStart(msg));

    this.prediction = new Prediction({ x: 0, y: 0, speed: 200, radius: 16 });

    const isMobile = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    this.input.addPointer(isMobile ? 2 : 0);
    this.inputAdapter = isMobile ? new MobileInput(this) : new DesktopInput(this);
  }

  shutdown() { this.inputAdapter?.destroy(); }

  private _onMatchStart(msg: { code: string; players: { A: string; B: string } }) {
    this.localSlot = msg.players.A === this.localPlayerId ? 'A' : 'B';
  }

  private _onSnap(snap: SnapMsg) {
    this.latestSnap = snap;

    const seenPlayers = new Set<string>();
    for (const sp of snap.players) {
      seenPlayers.add(sp.id);
      let cont = this.playerSprites.get(sp.id);
      if (!cont) {
        const c = this.add.container(sp.x, sp.y);
        const body = this.add.circle(0, 0, 16, sp.id === this.localPlayerId ? 0x66aaff : 0xff6666);
        const aim = this.add.rectangle(20, 0, 24, 4, 0xffffff).setOrigin(0, 0.5);
        const name = this.add.text(0, -30, sp.id.slice(0, 6), { fontSize: '12px', color: '#fff' }).setOrigin(0.5);
        c.add([body, aim, name]);
        this.playerSprites.set(sp.id, c);
        cont = c;
      }
      if (sp.id === this.localPlayerId) {
        this.prediction.reconcile({ x: sp.x, y: sp.y, ackSeq: snap.ackSeq }, 1/30);
        const pos = this.prediction.getPosition();
        cont.setPosition(pos.x, pos.y);
        this.cameras.main.startFollow(cont, true, 0.2, 0.2);
      } else {
        let interp = this.remoteInterp.get(sp.id);
        if (!interp) { interp = new Interpolation({ delayMs: 100 }); this.remoteInterp.set(sp.id, interp); }
        interp.push({ serverTime: snap.serverTime ?? Date.now(), x: sp.x, y: sp.y });
      }
      cont.setRotation(sp.aim ?? 0);
      cont.setVisible(!sp.dead);
    }

    // Bullets
    const seenBullets = new Set<number>();
    for (const b of snap.bullets) {
      seenBullets.add(b.id);
      let s = this.bulletSprites.get(b.id);
      if (!s) {
        s = this.add.circle(b.x, b.y, 4, 0xffee44);
        this.bulletSprites.set(b.id, s);
      } else {
        s.setPosition(b.x, b.y);
      }
    }
    for (const [id, s] of this.bulletSprites) {
      if (!seenBullets.has(id)) { s.destroy(); this.bulletSprites.delete(id); }
    }

    // Pickup availability + dynamic temp pickups
    const seenPickups = new Set<number>();
    for (const pu of snap.pickups) {
      seenPickups.add(pu.id);
      let c = this.pickupSprites.get(pu.id);
      if (!c) {
        c = this.add.container(pu.x, pu.y);
        const ring = this.add.circle(0, 0, 24, 0xffaa44, 0.4);
        const label = this.add.text(0, 0, pu.kind[0].toUpperCase(), { fontSize: '20px', color: '#ffffff' }).setOrigin(0.5);
        c.add([ring, label]);
        this.pickupSprites.set(pu.id, c);
      }
      c.setAlpha(pu.available ? 1 : 0.2);
    }
    for (const [id, c] of this.pickupSprites) {
      if (!seenPickups.has(id)) { c.destroy(); this.pickupSprites.delete(id); }
    }
  }

  update(_t: number, _dt: number): void {
    if (!this.latestSnap) return;
    const now = Date.now();

    // Interpolate remote players
    for (const [id, interp] of this.remoteInterp) {
      const cont = this.playerSprites.get(id);
      if (!cont) continue;
      const p = interp.getAt(now);
      if (p) cont.setPosition(p.x, p.y);
    }

    // Sample input + send + apply prediction locally
    const perfNow = performance.now();
    if (perfNow - this.lastInputAt >= 33 && this.inputAdapter && this.localSlot) {
      const localCont = this.playerSprites.get(this.localPlayerId);
      if (localCont) {
        const f = this.inputAdapter.sample(this, localCont);
        const seq = this.client.sendInput(f);
        this.prediction.applyInput({ seq, mv: f.mv }, 1/30);
        const pos = this.prediction.getPosition();
        localCont.setPosition(pos.x, pos.y);
        localCont.setRotation(f.aim);
        this.lastInputAt = perfNow;
      }
    }
  }
}
