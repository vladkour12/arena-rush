/**
 * CommandSystem.ts
 *
 * A generic command bus that decouples game-logic actions from their
 * execution and transport.  In single-player every command is executed
 * locally on the same frame.  In multiplayer the same commands are also
 * forwarded through a NetworkAdapter so the authoritative server (or
 * peer) receives them, and commands arriving from the network are
 * enqueued here and executed locally — keeping both clients in lockstep.
 *
 * Multiplayer flow (server-authoritative):
 *   1. Local player queues a command        → commandSystem.enqueue(cmd)
 *   2. CommandSystem serialises it          → adapter.send(json)
 *   3. Server validates + broadcasts        → all clients receive json
 *   4. Remote client's adapter fires        → commandSystem.enqueue(remote)
 *   5. Both clients call flush() each frame → deterministic execution
 */

import type { BuildingType } from '../config/buildings';
import type { UnitType, Faction } from '../config/units';

// ── Command type union ───────────────────────────────────────────────────────

export interface BuildCommand {
  readonly kind: 'build';
  readonly faction: Faction;
  readonly buildingType: BuildingType;
  /** Tile column – omit to let the system pick a valid spot (AI usage). */
  readonly tx?: number;
  /** Tile row  – omit to let the system pick a valid spot (AI usage). */
  readonly ty?: number;
}

export interface TrainCommand {
  readonly kind: 'train';
  readonly faction: Faction;
  readonly unitType: UnitType;
  /** Spawn origin in world-pixels.  Omit to use the faction's default. */
  readonly x?: number;
  readonly y?: number;
}

export interface MoveCommand {
  readonly kind: 'move';
  readonly faction: Faction;
  /** Logical unit ID (Unit.state.id). */
  readonly unitId: number;
  readonly x: number;
  readonly y: number;
}

export interface AttackCommand {
  readonly kind: 'attack';
  readonly faction: Faction;
  readonly unitId: number;
  /** ID of the target unit. */
  readonly targetId: number;
}

/**
 * Attack-move: all listed units advance toward (x, y), engaging any
 * enemy they encounter along the way.  This is the command used when
 * the AI launches an attack wave.
 */
export interface AttackMoveCommand {
  readonly kind: 'attackmove';
  readonly faction: Faction;
  readonly unitIds: readonly number[];
  readonly x: number;
  readonly y: number;
}

export type GameCommand =
  | BuildCommand
  | TrainCommand
  | MoveCommand
  | AttackCommand
  | AttackMoveCommand;

// ── Network adapter interface ────────────────────────────────────────────────

/**
 * Implement this interface to plug in a real transport layer.
 * Single-player: use LocalNetworkAdapter (no-op).
 * Online 1v1:    use WebSocketNetworkAdapter or a WebRTC adapter.
 */
export interface NetworkAdapter {
  /** Serialise + transmit a command to the remote side. */
  send(payload: string): void;
  /** Register the callback that fires when a command arrives from the remote. */
  onReceive(callback: (payload: string) => void): void;
  /** Returns true when an active remote session exists. */
  isConnected(): boolean;
}

// ── LocalNetworkAdapter (single-player / offline) ───────────────────────────

/** No-op adapter — all game logic stays on this client. */
export class LocalNetworkAdapter implements NetworkAdapter {
  send(_payload: string): void { /* intentionally empty */ }
  onReceive(_callback: (payload: string) => void): void { /* intentionally empty */ }
  isConnected(): boolean { return false; }
}

// ── WebSocketNetworkAdapter (placeholder for online multiplayer) ─────────────

/**
 * Thin WebSocket wrapper.  Drop this into CommandSystem to enable
 * online 1v1 without touching any other game code.
 *
 * Server contract (authoritative):
 *   → client sends:  { seq: number, cmd: GameCommand }
 *   ← server sends:  { seq: number, cmd: GameCommand }  (validated, broadcast)
 *
 * Swap this class for a WebRTC data-channel version for peer-to-peer.
 */
export class WebSocketNetworkAdapter implements NetworkAdapter {
  private ws: WebSocket | null = null;
  private receiveCallback: ((payload: string) => void) | null = null;
  private readonly url: string;

  constructor(serverUrl: string) {
    this.url = serverUrl;
    this.connect();
  }

  private connect(): void {
    try {
      this.ws = new WebSocket(this.url);
      this.ws.onmessage = (evt: MessageEvent) => {
        if (typeof evt.data === 'string' && this.receiveCallback) {
          this.receiveCallback(evt.data);
        }
      };
      this.ws.onerror = (err) => {
        console.warn('[WebSocketNetworkAdapter] error', err);
      };
      this.ws.onclose = () => {
        console.info('[WebSocketNetworkAdapter] connection closed');
      };
    } catch (err) {
      console.warn('[WebSocketNetworkAdapter] could not connect to', this.url, err);
    }
  }

  send(payload: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
    }
  }

  onReceive(callback: (payload: string) => void): void {
    this.receiveCallback = callback;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}

// ── CommandSystem ────────────────────────────────────────────────────────────

type AnyHandler = (cmd: GameCommand) => void;

/**
 * Central command bus.  All game-state mutations go through here.
 *
 * Quick-start (single-player):
 * ```ts
 * const cmds = new CommandSystem();
 * cmds.register('build', (c) => scene.placeBuilding(c.buildingType, c.faction, c.tx, c.ty));
 * cmds.register('train', (c) => scene.spawnUnit(c.unitType, c.faction, c.x, c.y));
 * // In create() — AI issues commands by calling cmds.enqueue(...)
 * // In update() — call cmds.flush() to execute them.
 * ```
 *
 * To upgrade to online multiplayer, replace LocalNetworkAdapter with
 * WebSocketNetworkAdapter.  Zero other changes required.
 */
export class CommandSystem {
  private readonly queue: GameCommand[] = [];
  private readonly handlers = new Map<string, AnyHandler>();
  private adapter: NetworkAdapter;

  constructor(adapter: NetworkAdapter = new LocalNetworkAdapter()) {
    this.adapter = adapter;
    this.adapter.onReceive((payload) => this.receiveRemote(payload));
  }

  // ── Handler registration ─────────────────────────────────────────────────

  /**
   * Register an executor for a command kind.
   * The handler runs synchronously inside flush().
   */
  register<K extends GameCommand['kind']>(
    kind: K,
    handler: (cmd: Extract<GameCommand, { kind: K }>) => void,
  ): this {
    this.handlers.set(kind, handler as AnyHandler);
    return this;
  }

  // ── Enqueue / flush ──────────────────────────────────────────────────────

  /**
   * Add a command to the queue.
   * @param sendToNetwork  Pass false for commands that arrived from the
   *                       network (already transmitted — don't re-send).
   */
  enqueue(cmd: GameCommand, sendToNetwork = true): void {
    this.queue.push(cmd);
    if (sendToNetwork && this.adapter.isConnected()) {
      this.adapter.send(JSON.stringify(cmd));
    }
  }

  /**
   * Execute every queued command in order, then clear the queue.
   * Call once per frame: `commandSystem.flush()` inside `update()`.
   */
  flush(): void {
    // Snapshot length so any commands enqueued by handlers execute next frame
    const len = this.queue.length;
    for (let i = 0; i < len; i++) {
      const cmd = this.queue[i];
      const handler = this.handlers.get(cmd.kind);
      if (handler) {
        handler(cmd);
      } else {
        console.warn('[CommandSystem] No handler for command kind:', cmd.kind, cmd);
      }
    }
    this.queue.splice(0, len);
  }

  /** Discard all pending commands without executing them. */
  clear(): void {
    this.queue.length = 0;
  }

  /** Number of commands waiting to be flushed. */
  get pendingCount(): number {
    return this.queue.length;
  }

  // ── Network ──────────────────────────────────────────────────────────────

  /**
   * Hot-swap the network adapter.  Useful when transitioning from
   * single-player to a multiplayer lobby.
   */
  setNetworkAdapter(adapter: NetworkAdapter): void {
    this.adapter = adapter;
    adapter.onReceive((payload) => this.receiveRemote(payload));
  }

  private receiveRemote(payload: string): void {
    try {
      const cmd = JSON.parse(payload) as GameCommand;
      // Remote commands must NOT be re-broadcast to avoid loops
      this.enqueue(cmd, false);
    } catch {
      console.warn('[CommandSystem] Malformed remote payload:', payload);
    }
  }

  // ── Serialisation helpers ────────────────────────────────────────────────

  /**
   * Serialise the current queue to JSON.
   * Useful for replays, deterministic testing, and server-side validation.
   */
  serialiseQueue(): string {
    return JSON.stringify(this.queue);
  }

  /**
   * Replay a serialised command list (e.g., a server-validated batch).
   * Commands are enqueued without forwarding to the network.
   */
  replayFromJSON(json: string): void {
    try {
      const cmds = JSON.parse(json) as GameCommand[];
      for (const cmd of cmds) this.enqueue(cmd, false);
    } catch {
      console.warn('[CommandSystem] Failed to replay from JSON:', json);
    }
  }
}
