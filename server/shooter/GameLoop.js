const TICK_HZ = 30;
const SNAP_HZ = 20;
const TICK_MS = 1000 / TICK_HZ;
const SNAP_MS = 1000 / SNAP_HZ;

export class GameLoop {
  constructor({ match, onSnapshot, onEvent }) {
    this.match = match;
    this.onSnapshot = onSnapshot;
    this.onEvent = onEvent;
    this.tickInterval = null;
    this.snapInterval = null;
  }

  start() {
    this.tickInterval = setInterval(() => {
      if (this.match.endedAt) return;
      this.match.tick(TICK_MS / 1000);
      if (this.match.events && this.match.events.length) {
        for (const e of this.match.events) this.onEvent(e);
        this.match.events.length = 0;
      }
    }, TICK_MS);
    this.snapInterval = setInterval(() => {
      const snap = this.match.serializeSnapshot();
      this.onSnapshot(snap);
    }, SNAP_MS);
  }

  stop() {
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.snapInterval) clearInterval(this.snapInterval);
    this.tickInterval = null;
    this.snapInterval = null;
  }
}
