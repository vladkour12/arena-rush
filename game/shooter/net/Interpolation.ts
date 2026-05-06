interface Snap { serverTime: number; x: number; y: number; }

export class Interpolation {
  private buf: Snap[] = [];
  private delayMs: number;

  constructor({ delayMs = 100 }: { delayMs?: number } = {}) {
    this.delayMs = delayMs;
  }

  push(s: Snap): void {
    this.buf.push(s);
    while (this.buf.length > 5) this.buf.shift();
  }

  getAt(now: number): { x: number; y: number } | null {
    if (this.buf.length === 0) return null;
    const t = now - this.delayMs;
    if (this.buf.length === 1 || t <= this.buf[0].serverTime) return { x: this.buf[0].x, y: this.buf[0].y };
    for (let i = 1; i < this.buf.length; i++) {
      const a = this.buf[i - 1], b = this.buf[i];
      if (t <= b.serverTime) {
        const f = (t - a.serverTime) / Math.max(1, b.serverTime - a.serverTime);
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      }
    }
    const last = this.buf[this.buf.length - 1];
    return { x: last.x, y: last.y };
  }

  size(): number { return this.buf.length; }
}
