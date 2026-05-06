interface InputFrame {
  seq: number;
  mv: { x: number; y: number };
  dt: number;
}

export class Prediction {
  private x: number;
  private y: number;
  private speed: number;
  private radius: number;
  private pending: InputFrame[] = [];

  constructor({ x, y, speed, radius }: { x: number; y: number; speed: number; radius: number }) {
    this.x = x; this.y = y; this.speed = speed; this.radius = radius;
  }

  applyInput(input: { seq: number; mv: { x: number; y: number } }, dt: number): void {
    this.pending.push({ seq: input.seq, mv: input.mv, dt });
    const { x, y } = this._step(this.x, this.y, input.mv, dt);
    this.x = x; this.y = y;
  }

  reconcile(server: { x: number; y: number; ackSeq: number }, _dt: number): void {
    this.x = server.x;
    this.y = server.y;
    this.pending = this.pending.filter(f => f.seq > server.ackSeq);
    for (const f of this.pending) {
      const { x, y } = this._step(this.x, this.y, f.mv, f.dt);
      this.x = x; this.y = y;
    }
  }

  setPosition(x: number, y: number): void { this.x = x; this.y = y; this.pending = []; }

  getPosition() { return { x: this.x, y: this.y }; }

  private _step(x: number, y: number, mv: { x: number; y: number }, dt: number) {
    let mx = mv.x, my = mv.y;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    return { x: x + mx * this.speed * dt, y: y + my * this.speed * dt };
  }
}
