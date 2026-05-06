import { MSG, type SnapMsg } from './protocol';

type Handler = (data: any) => void;

interface ClientArgs {
  url: string;
  code: string;
  playerId: string;
  name: string;
}

export class ShooterClient {
  private url: string;
  private code: string;
  private playerId: string;
  private name: string;
  private ws: WebSocket | null = null;
  private seq = 0;
  private handlers: Record<string, Handler[]> = {};
  private isOpen = false;

  constructor(args: ClientArgs) {
    this.url = args.url;
    this.code = args.code;
    this.playerId = args.playerId;
    this.name = args.name;
  }

  connect(): void {
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      this.isOpen = true;
      this._send({ t: MSG.JOIN_MATCH, code: this.code, playerId: this.playerId, name: this.name });
      this._emit('open', null);
    };
    this.ws.onmessage = (ev) => {
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }
      switch (msg.t) {
        case MSG.SNAP:        this._emit('snap', msg as SnapMsg); break;
        case MSG.KILL:        this._emit('kill', msg); break;
        case MSG.PICKUP:      this._emit('pickup', msg); break;
        case MSG.MATCH_START: this._emit('matchStart', msg); break;
        case MSG.MATCH_END:   this._emit('matchEnd', msg); break;
        case MSG.RESPAWN:     this._emit('respawn', msg); break;
      }
    };
    this.ws.onclose = () => { this.isOpen = false; this._emit('close', null); };
  }

  sendInput(input: { mv: { x: number; y: number }; aim: number; fire: boolean; swap: boolean; reload: boolean }): number {
    this.seq++;
    this._send({ t: MSG.INPUT, seq: this.seq, ...input });
    return this.seq;
  }

  sendRematch(): void { this._send({ t: MSG.REMATCH_REQUEST, code: this.code }); }
  sendLeave(): void { this._send({ t: MSG.LEAVE_MATCH, code: this.code }); }

  on(event: string, handler: Handler): void {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(handler);
  }

  off(event: string, handler: Handler): void {
    this.handlers[event] = (this.handlers[event] || []).filter(h => h !== handler);
  }

  disconnect(): void { this.ws?.close(); }

  getSeq(): number { return this.seq; }

  private _send(msg: any): void {
    if (this.ws && this.isOpen && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private _emit(event: string, data: any): void {
    for (const h of this.handlers[event] || []) h(data);
  }
}
