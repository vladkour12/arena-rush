import { MAP_WIDTH, MAP_HEIGHT, MAP } from './Map.js';
import { WEAPONS } from './Weapons.js';

const PROFILES = {
  easy:   { reactionMs: 500, accuracy: 0.55, contestPickups: false, jitterMs: 600 },
  normal: { reactionMs: 250, accuracy: 0.78, contestPickups: true,  jitterMs: 400 },
  hard:   { reactionMs: 100, accuracy: 0.92, contestPickups: true,  jitterMs: 250 },
};

// Preferred engagement distance per weapon (kept slightly inside max range).
const PREFERRED_DIST = {
  pistol:  300,
  smg:     220,
  shotgun: 150,
  sniper:  900,
};

export class Bot {
  constructor({ slot, difficulty = 'normal' }) {
    this.slot = slot;
    this.profile = PROFILES[difficulty] ?? PROFILES.normal;
    this.elapsedMs = 0;
    this.seq = 0;
    this.strafeDir = 1;       // +1 right of enemy facing, -1 left
    this.strafeFlipAt = 0;    // ms timestamp to next flip
  }

  decide(match, dt) {
    this.elapsedMs += dt * 1000;
    const me = match.players[this.slot];
    const enemy = match.players[this.slot === 'A' ? 'B' : 'A'];
    if (!me || me.dead) return this._idle();

    const lowHp = me.hp < 35;
    const reactionReady = this.elapsedMs > this.profile.reactionMs;
    const myWeapon = WEAPONS[me.weapon] ?? WEAPONS.pistol;
    const preferDist = PREFERRED_DIST[me.weapon] ?? 300;

    let mv = { x: 0, y: 0 };
    let fire = false;
    let aim = me.aim;
    let reload = false;

    const bestPickup = this._bestPickup(match, me);
    const goPickup = this.profile.contestPickups && bestPickup && (lowHp || me.weapon === 'pistol');

    if (lowHp && bestPickup && !this._lineBlockedByWall(me.x, me.y, bestPickup.x, bestPickup.y)) {
      // Flee toward pickup, look at enemy if visible to suppress
      mv = this._unit(bestPickup.x - me.x, bestPickup.y - me.y);
      if (enemy && !enemy.dead && this._canSee(me, enemy)) {
        aim = Math.atan2(enemy.y - me.y, enemy.x - me.x);
        if (reactionReady && me.ammo > 0) fire = true;
      } else {
        aim = Math.atan2(bestPickup.y - me.y, bestPickup.x - me.x);
      }
    } else if (enemy && !enemy.dead && this._canSee(me, enemy) && reactionReady) {
      const dx = enemy.x - me.x, dy = enemy.y - me.y;
      const dist = Math.hypot(dx, dy);
      const idealAim = Math.atan2(dy, dx);

      // Aim with accuracy-noise scaled by distance (further = harder)
      const distFactor = Math.min(1, dist / 600);
      const miss = (1 - this.profile.accuracy) * (0.25 + 0.4 * distFactor);
      aim = idealAim + (Math.random() - 0.5) * 2 * miss;

      // Movement: strafe perpendicular + close/open distance to preferred range
      if (this.elapsedMs > this.strafeFlipAt) {
        this.strafeDir *= Math.random() < 0.45 ? -1 : 1;
        this.strafeFlipAt = this.elapsedMs + this.profile.jitterMs + Math.random() * 300;
      }
      const strafe = {
        x: Math.cos(idealAim + Math.PI / 2) * this.strafeDir,
        y: Math.sin(idealAim + Math.PI / 2) * this.strafeDir,
      };
      const wantClose = dist > preferDist + 60;
      const wantBack  = dist < preferDist - 80;
      const closer = { x: Math.cos(idealAim), y: Math.sin(idealAim) };
      const back   = { x: -closer.x, y: -closer.y };
      const radial = wantClose ? closer : wantBack ? back : { x: 0, y: 0 };
      mv = {
        x: strafe.x * 0.7 + radial.x * 0.6,
        y: strafe.y * 0.7 + radial.y * 0.6,
      };
      mv = this._clamp(mv);

      // Fire only if within useful range and ammo available
      if (dist < myWeapon.rangePx * 0.92 && me.ammo > 0) fire = true;
    } else if (goPickup) {
      // Picking up a weapon when not threatened
      mv = this._unit(bestPickup.x - me.x, bestPickup.y - me.y);
      aim = Math.atan2(bestPickup.y - me.y, bestPickup.x - me.x);
    } else {
      // Roam: head toward map center via a simple jitter
      const cx = MAP_WIDTH / 2, cy = MAP_HEIGHT / 2;
      const angleNoise = (Math.random() - 0.5) * 0.6;
      const baseAng = Math.atan2(cy - me.y, cx - me.x) + angleNoise;
      mv = { x: Math.cos(baseAng), y: Math.sin(baseAng) };
      aim = baseAng;
    }

    // Auto-reload when empty
    if (me.ammo === 0) reload = true;

    return { seq: ++this.seq, mv, aim, fire, swap: false, reload };
  }

  _idle() {
    return { seq: ++this.seq, mv: { x: 0, y: 0 }, aim: 0, fire: false, swap: false, reload: false };
  }

  _unit(dx, dy) {
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  }

  _clamp(v) {
    const len = Math.hypot(v.x, v.y);
    if (len > 1) return { x: v.x / len, y: v.y / len };
    return v;
  }

  _bestPickup(match, me) {
    if (!match.pickups) return null;
    let best = null, bestD = Infinity;
    for (const p of match.pickups) {
      if (!p.available) continue;
      const d = Math.hypot(p.x - me.x, p.y - me.y);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  _canSee(me, target) {
    return !this._lineBlockedByWall(me.x, me.y, target.x, target.y);
  }

  _lineBlockedByWall(x1, y1, x2, y2) {
    // Sample 6 points along the segment and check whether any sit inside a wall.
    const steps = 6;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      for (const w of MAP.walls) {
        if (x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h) return true;
      }
    }
    return false;
  }
}
