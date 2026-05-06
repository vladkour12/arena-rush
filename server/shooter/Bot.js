const PROFILES = {
  easy:   { reactionMs: 500, accuracy: 0.60, contestPickups: false, prefSniper: false },
  normal: { reactionMs: 250, accuracy: 0.80, contestPickups: true,  prefSniper: false },
  hard:   { reactionMs: 100, accuracy: 0.92, contestPickups: true,  prefSniper: true  },
};

export class Bot {
  constructor({ slot, difficulty = 'normal' }) {
    this.slot = slot;
    this.profile = PROFILES[difficulty] ?? PROFILES.normal;
    this.elapsedMs = 0;
    this.seq = 0;
  }

  decide(match, dt) {
    this.elapsedMs += dt * 1000;
    const me = match.players[this.slot];
    const enemy = match.players[this.slot === 'A' ? 'B' : 'A'];
    if (!me || me.dead) return this._idle();

    const lowHp = me.hp < 30;
    const reactionReady = this.elapsedMs > this.profile.reactionMs;

    let mv = { x: 0, y: 0 };
    let fire = false;
    let aim = me.aim;

    const availPickup = match.pickups?.find(p => p.available);
    if (lowHp && availPickup) {
      const dx = availPickup.x - me.x, dy = availPickup.y - me.y;
      const len = Math.hypot(dx, dy) || 1;
      mv = { x: dx / len, y: dy / len };
      aim = Math.atan2(dy, dx);
    } else if (enemy && !enemy.dead && reactionReady) {
      const dx = enemy.x - me.x, dy = enemy.y - me.y;
      const dist = Math.hypot(dx, dy);
      const idealAim = Math.atan2(dy, dx);
      const miss = (1 - this.profile.accuracy) * 0.4;
      aim = idealAim + (Math.random() - 0.5) * 2 * miss;
      mv = {
        x: Math.cos(idealAim + Math.PI / 2) * 0.4,
        y: Math.sin(idealAim + Math.PI / 2) * 0.4,
      };
      if (dist < 600) fire = true;
    } else {
      const cx = 1920 / 2, cy = 1280 / 2;
      const dx = cx - me.x, dy = cy - me.y;
      const len = Math.hypot(dx, dy) || 1;
      mv = { x: dx / len, y: dy / len };
    }

    return {
      seq: ++this.seq,
      mv, aim, fire,
      swap: false,
      reload: me.ammo === 0,
    };
  }

  _idle() {
    return { seq: ++this.seq, mv: { x: 0, y: 0 }, aim: 0, fire: false, swap: false, reload: false };
  }
}
