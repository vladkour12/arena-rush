import { MAP, MAP_WIDTH, MAP_HEIGHT, isInsideWall, clampToBounds, pickFarSpawn } from './Map.js';
import { WEAPONS } from './Weapons.js';

const PLAYER_SPEED = 200;          // px/s
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
        if (!p.dead) this._applyMovement(p, inp.mv, dt);
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
