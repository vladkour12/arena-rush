import * as Phaser from 'phaser';
import { WALLS, MAP_WIDTH, MAP_HEIGHT } from '../config/map';
import { Prediction } from '../net/Prediction';
import { Interpolation } from '../net/Interpolation';
import type { ShooterClient } from '../net/ShooterClient';
import type { SnapMsg } from '../net/protocol';
import { DesktopInput, type InputFrame } from '../input/DesktopInput';
import { MobileInput } from '../input/MobileInput';
import {
  initShooterAudio,
  playFire,
  playHit,
  playDeath,
  playPickup,
  playFootstep,
} from '../audio/shooterSounds';

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
const PLAYER_ORIGIN_Y = 0.5;    // body's geometric center
const WEAPON_SCALE = 0.05;      // 1196 * 0.05 = ~60px tall weapon
const WEAPON_OFFSET_Y = 42;     // forward of player center in container-local +y direction
const PICKUP_SCALE = 0.07;
// Body asset forward = +y (down in source: head at top, gun extends down). Rotate by -π/2 so
// asset-down maps to screen-right at aim=0. Weapons.png uses the opposite convention
// (muzzle-up), so the weapon sprite is flipped 180° to match.
const ASSET_FORWARD = -Math.PI / 2;
const WEAPON_LOCAL_ROT = Math.PI;
const CROSSHAIR_LEN = 220;

// Map server weapon id → preloaded frame name in 'shooter-weapons-raw' texture.
const WEAPON_FRAME: Record<string, string> = {
  pistol: 'w-pistol',
  shotgun: 'w-shotgun',
  smg: 'w-smg',
  sniper: 'w-sniper',
};

interface PlayerSprites {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  weapon: Phaser.GameObjects.Image;
  prevHp: number;
  prevDead: boolean;
  walkPhase: number;
}

interface BulletSprite {
  head: Phaser.GameObjects.Arc;
  trail: { x: number; y: number }[];
  graphic: Phaser.GameObjects.Graphics;
}

export class ShooterScene extends Phaser.Scene {
  private client!: ShooterClient;
  private localPlayerId!: string;
  private localSlot: 'A' | 'B' | null = null;

  private players = new Map<string, PlayerSprites>();
  private bulletSprites = new Map<number, BulletSprite>();
  private pickupSprites = new Map<number, Phaser.GameObjects.Container>();
  private crosshair!: Phaser.GameObjects.Graphics;

  private prediction!: Prediction;
  private remoteInterp = new Map<string, Interpolation>();

  private latestSnap: SnapMsg | null = null;
  private inputAdapter: InputAdapter | null = null;
  private lastInputAt = 0;
  private localPrevFire = false;
  private localPrevAmmo = 0;
  private cameraConfigured = false;
  private lastShakeAt = 0;

  constructor() { super({ key: 'Shooter' }); }

  init(data: InitData) {
    this.client = data.client;
    this.localPlayerId = data.localPlayerId;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a1a26');
    this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // Initialise audio (no-op until first user gesture unlocks it; ShooterLobby tap counts).
    initShooterAudio();

    // Floor: tile the 2x2 stone-floor cell across the playable area, no tint.
    const floor = this.add.tileSprite(0, 0, MAP_WIDTH, MAP_HEIGHT, 'shooter-tileset-raw', 'tile-floor');
    floor.setOrigin(0, 0);
    floor.setDepth(0);

    // Walls: dark navy fill + gold border.
    const wallG = this.add.graphics();
    wallG.setDepth(1);
    wallG.fillStyle(0x1f2a3a, 1);
    wallG.lineStyle(4, 0xc69b4d, 1);
    for (const w of WALLS) {
      if (w.x < 0 || w.y < 0) continue;
      wallG.fillRect(w.x, w.y, w.w, w.h);
      wallG.strokeRect(w.x, w.y, w.w, w.h);
    }

    // Crosshair / aim line — drawn fresh each update.
    this.crosshair = this.add.graphics();
    this.crosshair.setDepth(25);

    this.client.on('snap', (snap: SnapMsg) => this._onSnap(snap));
    this.client.on('matchStart', (msg: any) => this._onMatchStart(msg));
    this.client.on('pickup', (msg: any) => {
      // Only play pickup sound for the local player to avoid confusion.
      if (msg.player === this.localSlot) playPickup();
    });
    this.client.on('kill', (msg: any) => {
      if (msg.victim === this.localPlayerId || msg.killer === this.localPlayerId) {
        playDeath();
      }
    });

    this.prediction = new Prediction({
      x: 0, y: 0, speed: 200, radius: 16,
      bounds: { minX: 0, minY: 0, maxX: MAP_WIDTH, maxY: MAP_HEIGHT },
    });

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
    weapon.setOrigin(0.5, 0.85);
    weapon.setRotation(WEAPON_LOCAL_ROT);

    cont.add([body, weapon]);
    ps = { container: cont, body, weapon, prevHp: sp.hp, prevDead: sp.dead, walkPhase: 0 };
    this.players.set(sp.id, ps);
    return ps;
  }

  private _flashHit(ps: PlayerSprites) {
    ps.body.setTint(0xff5555);
    this.time.delayedCall(120, () => ps.body.clearTint());
  }

  private _kickRecoil(ps: PlayerSprites) {
    const baseY = WEAPON_OFFSET_Y;
    this.tweens.add({
      targets: ps.weapon,
      y: baseY - 6,
      duration: 50,
      yoyo: true,
      onComplete: () => ps.weapon.setY(baseY),
    });
  }

  private _muzzleFlash(ps: PlayerSprites) {
    // Muzzle is at container-local (0, WEAPON_OFFSET_Y + 51) after the 180° sprite flip.
    const muzzleLocalY = WEAPON_OFFSET_Y + 51;
    const cont = ps.container;
    const cosR = Math.cos(cont.rotation);
    const sinR = Math.sin(cont.rotation);
    const wx = cont.x - muzzleLocalY * sinR;
    const wy = cont.y + muzzleLocalY * cosR;
    // Inner core
    const core = this.add.circle(wx, wy, 7, 0xffffff, 1).setDepth(16);
    // Outer flare
    const flare = this.add.circle(wx, wy, 14, 0xffcc44, 0.9).setDepth(15);
    this.tweens.add({
      targets: core,
      alpha: 0,
      scale: 1.6,
      duration: 90,
      onComplete: () => core.destroy(),
    });
    this.tweens.add({
      targets: flare,
      alpha: 0,
      scale: 2.6,
      duration: 140,
      onComplete: () => flare.destroy(),
    });
  }

  private _damageNumber(worldX: number, worldY: number, amount: number) {
    const txt = this.add.text(worldX, worldY - 30, `-${amount}`, {
      fontSize: '20px', color: '#ffdd44', stroke: '#000', strokeThickness: 4, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(40);
    this.tweens.add({
      targets: txt,
      y: worldY - 80,
      alpha: 0,
      duration: 700,
      ease: 'Cubic.Out',
      onComplete: () => txt.destroy(),
    });
  }

  private _deathFade(ps: PlayerSprites) {
    this.tweens.add({
      targets: ps.container,
      alpha: 0,
      scale: 0.6,
      duration: 250,
    });
  }

  private _respawnPop(ps: PlayerSprites) {
    ps.container.setAlpha(1);
    ps.container.setScale(0.4);
    this.tweens.add({
      targets: ps.container,
      scale: 1,
      duration: 220,
      ease: 'Back.Out',
    });
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

    if (!this.localSlot) {
      const me = snap.players.find(p => p.id === this.localPlayerId);
      if (me) this.localSlot = me.slot;
    }

    for (const sp of snap.players) {
      const ps = this._ensurePlayer(sp);
      const cont = ps.container;

      const desired = WEAPON_FRAME[sp.weapon] ?? 'w-pistol';
      if (ps.weapon.frame.name !== desired) ps.weapon.setFrame(desired);

      // Hit flash + damage popup + sounds + screen shake on local damage
      if (sp.hp < ps.prevHp && !sp.dead) {
        this._flashHit(ps);
        this._damageNumber(sp.x, sp.y, ps.prevHp - sp.hp);
        playHit();
        if (sp.id === this.localPlayerId) {
          // Throttle: at most one shake per 250ms so rapid SMG hits don't compound.
          const now = performance.now();
          if (now - this.lastShakeAt > 250) {
            this.cameras.main.shake(90, 0.004);
            this.lastShakeAt = now;
          }
        }
      }

      if (sp.dead && !ps.prevDead) this._deathFade(ps);
      if (!sp.dead && ps.prevDead) this._respawnPop(ps);

      ps.prevHp = sp.hp;
      ps.prevDead = sp.dead;

      if (sp.id === this.localPlayerId) {
        this.prediction.reconcile({ x: sp.x, y: sp.y, ackSeq: snap.ackSeq }, 1/30);
        const pos = this.prediction.getPosition();
        cont.setPosition(pos.x, pos.y);
        // Configure camera follow once — repeating it every snap interferes with the lerp
        if (!this.cameraConfigured) {
          this.cameras.main.startFollow(cont, true, 0.18, 0.18);
          this.cameras.main.setFollowOffset(0, -100);
          this.cameraConfigured = true;
        }
      } else {
        let interp = this.remoteInterp.get(sp.id);
        if (!interp) { interp = new Interpolation({ delayMs: 100 }); this.remoteInterp.set(sp.id, interp); }
        interp.push({ serverTime: snap.serverTime ?? Date.now(), x: sp.x, y: sp.y });
      }
      cont.setRotation((sp.aim ?? 0) + ASSET_FORWARD);
    }

    // Bullets — track trail history per bullet id
    const seenBullets = new Set<number>();
    for (const b of snap.bullets) {
      seenBullets.add(b.id);
      let bs = this.bulletSprites.get(b.id);
      if (!bs) {
        const head = this.add.circle(b.x, b.y, 4, 0xffffff).setDepth(20);
        const graphic = this.add.graphics().setDepth(19);
        bs = { head, trail: [], graphic };
        this.bulletSprites.set(b.id, bs);
      }
      bs.head.setPosition(b.x, b.y);
      bs.trail.push({ x: b.x, y: b.y });
      if (bs.trail.length > 6) bs.trail.shift();
    }
    for (const [id, bs] of this.bulletSprites) {
      if (!seenBullets.has(id)) { bs.head.destroy(); bs.graphic.destroy(); this.bulletSprites.delete(id); }
    }

    // Pickups
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

  update(_t: number, dtMs: number): void {
    const now = Date.now();

    // Interpolate remote players
    for (const [id, interp] of this.remoteInterp) {
      const ps = this.players.get(id);
      if (!ps) continue;
      const p = interp.getAt(now);
      if (p) ps.container.setPosition(p.x, p.y);
    }

    // Pulse pickup ring
    const t = (now / 600) * Math.PI;
    const pulse = 1 + Math.sin(t) * 0.08;
    for (const c of this.pickupSprites.values()) {
      c.setScale(pulse);
    }

    // Redraw bullet trails (fading orange line behind each bullet)
    for (const bs of this.bulletSprites.values()) {
      bs.graphic.clear();
      const tr = bs.trail;
      if (tr.length < 2) continue;
      for (let i = 1; i < tr.length; i++) {
        const alpha = (i / tr.length) * 0.7;
        bs.graphic.lineStyle(3, 0xffaa44, alpha);
        bs.graphic.beginPath();
        bs.graphic.moveTo(tr[i - 1].x, tr[i - 1].y);
        bs.graphic.lineTo(tr[i].x, tr[i].y);
        bs.graphic.strokePath();
      }
    }

    // Walk wobble + input loop
    const localPs = this.players.get(this.localPlayerId);
    let movingMag = 0;
    let localAim = 0;
    if (this.inputAdapter && localPs) {
      const perfNow = performance.now();
      if (perfNow - this.lastInputAt >= 33 && this.localSlot) {
        const f = this.inputAdapter.sample(this, localPs.container);
        const seq = this.client.sendInput(f);
        this.prediction.applyInput({ seq, mv: f.mv }, 1 / 30);
        const pos = this.prediction.getPosition();
        localPs.container.setPosition(pos.x, pos.y);
        localPs.container.setRotation(f.aim + ASSET_FORWARD);
        this.lastInputAt = perfNow;
        movingMag = Math.hypot(f.mv.x, f.mv.y);
        localAim = f.aim;

        if (f.fire && !this.localPrevFire) {
          this._kickRecoil(localPs);
          this._muzzleFlash(localPs);
        }
        this.localPrevFire = f.fire;

        // Footstep cadence while moving
        if (movingMag > 0.2) playFootstep();
      }
    }

    // Walk wobble for all players
    for (const [id, ps] of this.players) {
      const isLocal = id === this.localPlayerId;
      const isMoving = isLocal ? movingMag > 0.1 : this._remoteIsMoving(id);
      if (isMoving) {
        ps.walkPhase += dtMs * 0.022;
        ps.body.setAngle(Math.sin(ps.walkPhase) * 6);
      } else {
        const cur = ps.body.angle;
        ps.body.setAngle(cur * 0.85);
        if (Math.abs(cur) < 0.5) ps.body.setAngle(0);
      }
    }

    // Crosshair / aim line — only drawn if local player is alive
    this.crosshair.clear();
    if (localPs && this.latestSnap) {
      const me = this.latestSnap.players.find(p => p.id === this.localPlayerId);
      if (me && !me.dead) {
        const muzzleLocalY = WEAPON_OFFSET_Y + 51;
        const cont = localPs.container;
        const cosR = Math.cos(cont.rotation);
        const sinR = Math.sin(cont.rotation);
        const sx = cont.x - muzzleLocalY * sinR;
        const sy = cont.y + muzzleLocalY * cosR;
        const ex = sx + Math.cos(localAim) * CROSSHAIR_LEN;
        const ey = sy + Math.sin(localAim) * CROSSHAIR_LEN;
        // Faint line + small dot at end
        this.crosshair.lineStyle(1.5, 0xffeebb, 0.4);
        this.crosshair.beginPath();
        this.crosshair.moveTo(sx, sy);
        this.crosshair.lineTo(ex, ey);
        this.crosshair.strokePath();
        this.crosshair.fillStyle(0xffeebb, 0.7);
        this.crosshair.fillCircle(ex, ey, 4);
      }
    }

    // Local fire sound — play on the snap-derived ammo decrement edge so it survives
    // packet loss / single missed inputs. Triggered when ammo goes down.
    if (this.latestSnap) {
      const me = this.latestSnap.players.find(p => p.id === this.localPlayerId);
      if (me) {
        if (me.ammo < this.localPrevAmmo) playFire(me.weapon);
        this.localPrevAmmo = me.ammo;
      }
    }
  }

  private _lastRemotePos = new Map<string, { x: number; y: number; t: number }>();
  private _remoteIsMoving(id: string): boolean {
    const ps = this.players.get(id);
    if (!ps) return false;
    const cont = ps.container;
    const last = this._lastRemotePos.get(id);
    const now = Date.now();
    let moving = false;
    if (last && now - last.t > 0) {
      const dx = cont.x - last.x, dy = cont.y - last.y;
      moving = Math.hypot(dx, dy) > 0.5;
    }
    this._lastRemotePos.set(id, { x: cont.x, y: cont.y, t: now });
    return moving;
  }
}
