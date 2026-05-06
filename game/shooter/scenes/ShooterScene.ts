import * as Phaser from 'phaser';
import { WALLS, MAP_WIDTH, MAP_HEIGHT } from '../config/map';
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

// Display sizing — the actual silhouette is 266×460.
const PLAYER_SCALE = 0.18;      // 266×460 → ~48×83 px on screen
const PLAYER_ORIGIN_Y = 0.4;    // head sits in the upper half; pivot near head/shoulder junction
const WEAPON_SCALE = 0.05;      // 1196 * 0.05 = ~60px tall weapon
const WEAPON_OFFSET_Y = -28;    // sit weapon in front of player along container's local "up"
const PICKUP_SCALE = 0.07;
const ASSET_FORWARD = Math.PI / 2;  // assets face up; rotate by +π/2 so aim=0 → face right

// Map server weapon id → preloaded frame name in 'shooter-weapons-raw' texture.
const WEAPON_FRAME: Record<string, string> = {
  pistol: 'w-pistol',
  shotgun: 'w-shotgun',
  smg: 'w-smg',
  sniper: 'w-sniper',
};

interface PlayerSprites {
  container: Phaser.GameObjects.Container;
  weapon: Phaser.GameObjects.Image;
}

export class ShooterScene extends Phaser.Scene {
  private client!: ShooterClient;
  private localPlayerId!: string;
  private localSlot: 'A' | 'B' | null = null;

  private players = new Map<string, PlayerSprites>();
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

    // Floor: tile the 2x2 stone-floor cell across the playable area, no tint.
    const floor = this.add.tileSprite(0, 0, MAP_WIDTH, MAP_HEIGHT, 'shooter-tileset-raw', 'tile-floor');
    floor.setOrigin(0, 0);
    floor.setDepth(0);

    // Walls: dark navy fill + gold border, matching the asset pack palette.
    const wallG = this.add.graphics();
    wallG.setDepth(1);
    wallG.fillStyle(0x1f2a3a, 1);
    wallG.lineStyle(4, 0xc69b4d, 1);
    for (const w of WALLS) {
      if (w.x < 0 || w.y < 0) continue;
      wallG.fillRect(w.x, w.y, w.w, w.h);
      wallG.strokeRect(w.x, w.y, w.w, w.h);
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

  private _ensurePlayer(sp: SnapMsg['players'][number]): PlayerSprites {
    let ps = this.players.get(sp.id);
    if (ps) return ps;
    const skinFrame = sp.slot === 'A' ? 'skin-A' : 'skin-B';
    const cont = this.add.container(sp.x, sp.y);
    cont.setDepth(10);

    const body = this.add.image(0, 0, 'shooter-assembled', skinFrame);
    body.setScale(PLAYER_SCALE);
    body.setOrigin(0.5, PLAYER_ORIGIN_Y);

    const weapon = this.add.image(0, WEAPON_OFFSET_Y, 'shooter-weapons-raw', WEAPON_FRAME[sp.weapon] ?? 'w-pistol');
    weapon.setScale(WEAPON_SCALE);
    weapon.setOrigin(0.5, 0.85);   // pivot near grip so weapon "extends" forward

    cont.add([body, weapon]);
    ps = { container: cont, weapon };
    this.players.set(sp.id, ps);
    return ps;
  }

  private _ensurePickup(pu: SnapMsg['pickups'][number]): Phaser.GameObjects.Container {
    let c = this.pickupSprites.get(pu.id);
    if (c) return c;
    c = this.add.container(pu.x, pu.y);
    c.setDepth(5);
    const ring = this.add.circle(0, 0, 28, 0xffd866, 0.35);
    const glow = this.add.circle(0, 0, 18, 0xffd866, 0.55);
    const wpnFrame = WEAPON_FRAME[pu.kind] ?? 'w-pistol';
    const sprite = this.add.image(0, 0, 'shooter-weapons-raw', wpnFrame);
    sprite.setScale(PICKUP_SCALE);
    sprite.setOrigin(0.5, 0.5);
    c.add([ring, glow, sprite]);
    this.pickupSprites.set(pu.id, c);
    return c;
  }

  private _onSnap(snap: SnapMsg) {
    this.latestSnap = snap;

    // Derive localSlot from the snapshot if MATCH_START was missed.
    if (!this.localSlot) {
      const me = snap.players.find(p => p.id === this.localPlayerId);
      if (me) this.localSlot = me.slot;
    }

    for (const sp of snap.players) {
      const ps = this._ensurePlayer(sp);
      const cont = ps.container;

      // Swap weapon frame if it changed
      const desired = WEAPON_FRAME[sp.weapon] ?? 'w-pistol';
      if (ps.weapon.frame.name !== desired) ps.weapon.setFrame(desired);

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
      cont.setRotation((sp.aim ?? 0) + ASSET_FORWARD);
      cont.setVisible(!sp.dead);
    }

    // Bullets
    const seenBullets = new Set<number>();
    for (const b of snap.bullets) {
      seenBullets.add(b.id);
      let s = this.bulletSprites.get(b.id);
      if (!s) {
        s = this.add.circle(b.x, b.y, 5, 0xffee44).setDepth(20);
        this.bulletSprites.set(b.id, s);
      } else {
        s.setPosition(b.x, b.y);
      }
    }
    for (const [id, s] of this.bulletSprites) {
      if (!seenBullets.has(id)) { s.destroy(); this.bulletSprites.delete(id); }
    }

    // Pickups: ensure + update availability + cull removed ones
    const seenPickups = new Set<number>();
    for (const pu of snap.pickups) {
      seenPickups.add(pu.id);
      const c = this._ensurePickup(pu);
      c.setAlpha(pu.available ? 1 : 0.15);
    }
    for (const [id, c] of this.pickupSprites) {
      if (!seenPickups.has(id)) { c.destroy(); this.pickupSprites.delete(id); }
    }
  }

  update(_t: number, _dt: number): void {
    const now = Date.now();

    // Interpolate remote players
    for (const [id, interp] of this.remoteInterp) {
      const ps = this.players.get(id);
      if (!ps) continue;
      const p = interp.getAt(now);
      if (p) ps.container.setPosition(p.x, p.y);
    }

    // Pulse pickup ring (visual flair)
    const t = (now / 600) * Math.PI;
    const pulse = 1 + Math.sin(t) * 0.08;
    for (const c of this.pickupSprites.values()) {
      c.setScale(pulse);
    }

    // Sample input + send + apply prediction locally
    const perfNow = performance.now();
    if (perfNow - this.lastInputAt >= 33 && this.inputAdapter && this.localSlot) {
      const localPs = this.players.get(this.localPlayerId);
      if (localPs) {
        const f = this.inputAdapter.sample(this, localPs.container);
        const seq = this.client.sendInput(f);
        this.prediction.applyInput({ seq, mv: f.mv }, 1/30);
        const pos = this.prediction.getPosition();
        localPs.container.setPosition(pos.x, pos.y);
        localPs.container.setRotation(f.aim + ASSET_FORWARD);
        this.lastInputAt = perfNow;
      }
    }
  }
}
