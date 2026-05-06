import { MAP, MAP_WIDTH, MAP_HEIGHT, isInsideWall, clampToBounds, pickFarSpawn } from './Map.js';
import { WEAPONS } from './Weapons.js';

const PLAYER_SPEED = 200;
const PLAYER_RADIUS = 16;
const MATCH_DURATION_MS = 5 * 60 * 1000;
const KILL_TARGET = 10;

export class Match {
  constructor({ matchId, code, p1, p2 }) {
    this.matchId = matchId;
    this.code = code;
    this.tickCount = 0;
    this.startedAt = Date.now();
    this.endedAt = null;
    this.endReason = null;
    this.winnerId = null;
    this.suddenDeath = false;

    const spawnA = MAP.spawns[0];
    const spawnB = MAP.spawns[1];
    this.players = {
      A: this._mkPlayer({ ...p1, slot: 'A' }, spawnA),
      B: this._mkPlayer({ ...p2, slot: 'B' }, spawnB),
    };
    this.score = { A: 0, B: 0 };
    this.bullets = [];
    this.nextBulletId = 1;
    this.events = [];
    this.pickups = MAP.pickupSpawns.map(p => ({
      id: p.id, kind: p.kind, x: p.x, y: p.y, available: true, respawnAt: 0,
    }));
    this.pendingInputs = { A: [], B: [] };
  }

  _mkPlayer(info, spawn) {
    return {
      id: info.id, name: info.name, isBot: !!info.isBot,
      slot: info.slot,
      x: spawn.x, y: spawn.y,
      hp: 100, dead: false, respawnAt: 0,
      weapon: 'pistol',
      pickupWeapon: null,
      ammo: WEAPONS.pistol.magSize,
      reloadingUntil: 0,
      nextShotAt: 0,
      aim: 0,
      lastAckSeq: 0,
    };
  }

  applyInput(slot, input) {
    if (!input || typeof input.seq !== 'number') return;
    this.pendingInputs[slot].push(input);
  }

  tick(dt) {
    if (this.endedAt) return;
    this.tickCount++;
    this.events = [];
    this._processInputs(dt);
    this._stepBullets(dt);
  }

  _processInputs(dt) {
    for (const slot of ['A', 'B']) {
      const inputs = this.pendingInputs[slot];
      if (inputs.length === 0) continue;
      inputs.sort((a, b) => a.seq - b.seq);
      const p = this.players[slot];
      for (const inp of inputs) {
        if (inp.seq <= p.lastAckSeq) continue;
        p.lastAckSeq = inp.seq;
        p.aim = inp.aim ?? p.aim;
        if (!p.dead) {
          this._applyMovement(p, inp.mv, dt);
          if (inp.reload) this._tryReload(p);
          if (inp.swap)   this._trySwap(p);
          if (inp.fire)   this._tryFire(p);
        }
      }
      this.pendingInputs[slot] = [];
    }
  }

  _applyMovement(p, mv, dt) {
    if (!mv) return;
    let mx = mv.x ?? 0, my = mv.y ?? 0;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const nx = p.x + mx * PLAYER_SPEED * dt;
    const ny = p.y + my * PLAYER_SPEED * dt;
    if (!isInsideWall(nx, p.y, PLAYER_RADIUS)) p.x = nx;
    if (!isInsideWall(p.x, ny, PLAYER_RADIUS)) p.y = ny;
    const c = clampToBounds(p.x, p.y, PLAYER_RADIUS);
    p.x = c.x; p.y = c.y;
  }

  _tryFire(p) {
    const now = Date.now();
    if (now < p.nextShotAt) return;
    if (this._isReloading(p)) return;
    const w = WEAPONS[p.weapon];
    if (p.ammo <= 0) { this._tryReload(p); return; }
    p.nextShotAt = now + 1000 / w.fireRate;
    p.ammo--;
    for (let i = 0; i < w.pellets; i++) {
      const spread = (Math.random() - 0.5) * 2 * w.spreadRad;
      const ang = p.aim + spread;
      const speed = w.bulletSpeed;
      this.bullets.push({
        id: this.nextBulletId++,
        x: p.x + Math.cos(p.aim) * 20,
        y: p.y + Math.sin(p.aim) * 20,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        owner: p.id,
        ownerSlot: p.slot,
        weapon: p.weapon,
        damage: w.damage,
        ttlMs: (w.rangePx / w.bulletSpeed) * 1000,
        bornAt: now,
      });
    }
  }

  _tryReload(p) {
    if (this._isReloading(p)) return;
    const w = WEAPONS[p.weapon];
    if (p.ammo === w.magSize) return;
    p.reloadingUntil = Date.now() + w.reloadMs;
  }

  _finishReloads() {
    const now = Date.now();
    for (const slot of ['A', 'B']) {
      const p = this.players[slot];
      if (p.reloadingUntil > 0 && now >= p.reloadingUntil) {
        const w = WEAPONS[p.weapon];
        p.ammo = w.magSize;
        p.reloadingUntil = 0;
      }
    }
  }

  _trySwap(p) {
    if (!p.pickupWeapon) return;
    p.weapon = p.weapon === 'pistol' ? p.pickupWeapon : 'pistol';
    p.ammo = WEAPONS[p.weapon].magSize;
    p.reloadingUntil = 0;
  }

  _stepBullets(dt) {
    this._finishReloads();
    const next = [];
    for (const b of this.bullets) {
      const stepX = b.vx * dt;
      const stepY = b.vy * dt;
      const newX = b.x + stepX;
      const newY = b.y + stepY;
      if (this._segmentHitsWall(b.x, b.y, newX, newY)) continue;
      const targetSlot = b.ownerSlot === 'A' ? 'B' : 'A';
      const tgt = this.players[targetSlot];
      if (!tgt.dead && this._segmentHitsCircle(b.x, b.y, newX, newY, tgt.x, tgt.y, PLAYER_RADIUS)) {
        this._damage(tgt, b.damage, b.ownerSlot, b.weapon);
        continue;
      }
      b.x = newX; b.y = newY;
      if (Date.now() - b.bornAt > b.ttlMs) continue;
      next.push(b);
    }
    this.bullets = next;
  }

  _segmentHitsWall(x1, y1, x2, y2) {
    const steps = 4;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      if (isInsideWall(x, y, 0)) return true;
    }
    return false;
  }

  _segmentHitsCircle(x1, y1, x2, y2, cx, cy, r) {
    const dx = x2 - x1, dy = y2 - y1;
    const fx = x1 - cx, fy = y1 - cy;
    const a = dx*dx + dy*dy;
    if (a === 0) return Math.hypot(fx, fy) < r;
    const b = 2 * (fx*dx + fy*dy);
    const c = fx*fx + fy*fy - r*r;
    let disc = b*b - 4*a*c;
    if (disc < 0) return false;
    disc = Math.sqrt(disc);
    const t1 = (-b - disc) / (2*a);
    const t2 = (-b + disc) / (2*a);
    return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
  }

  _damage(target, amount, fromSlot, weapon) {
    if (target.dead) return;
    target.hp = Math.max(0, target.hp - amount);
    if (target.hp === 0) {
      target.dead = true;
      target.respawnAt = Date.now() + 2000;
      this.score[fromSlot]++;
      this.events.push({ t: 'KILL', killer: this.players[fromSlot].id, victim: target.id, weapon, at: { x: target.x, y: target.y } });
    }
  }

  serializeSnapshot() {
    return {
      tick: this.tickCount,
      serverTime: Date.now(),
      players: ['A', 'B'].map(slot => {
        const p = this.players[slot];
        return {
          id: p.id, slot,
          x: Math.round(p.x * 10) / 10,
          y: Math.round(p.y * 10) / 10,
          hp: p.hp, weapon: p.weapon, ammo: p.ammo,
          reloading: this._isReloading(p),
          dead: p.dead,
          aim: Math.round(p.aim * 1000) / 1000,
        };
      }),
      bullets: this.bullets.map(b => ({
        id: b.id, x: Math.round(b.x), y: Math.round(b.y),
        vx: b.vx, vy: b.vy, owner: b.owner, weapon: b.weapon,
      })),
      pickups: this.pickups.map(p => ({
        id: p.id, kind: p.kind, x: p.x, y: p.y, available: p.available,
      })),
      score: { ...this.score },
      timeLeftMs: Math.max(0, MATCH_DURATION_MS - (Date.now() - this.startedAt)),
    };
  }

  _isReloading(p) { return Date.now() < p.reloadingUntil; }

  getAckSeq(slot) { return this.players[slot].lastAckSeq; }
}

export const _testing = { PLAYER_SPEED, PLAYER_RADIUS, MATCH_DURATION_MS, KILL_TARGET };
