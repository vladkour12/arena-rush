import * as Phaser from 'phaser';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { CombatSystem } from '../systems/CombatSystem';
import { TILE_SIZE } from '../config/map';

// Arena uses tile coordinates for building placement

export interface ArenaCallbacks {
  onTimerUpdate: (secs: number) => void;
  onGameEnd: (winner: 'player' | 'bot' | 'draw', reason: string) => void;
}

const ARENA_COLS = 20;
const ARENA_ROWS = 15;
const ARENA_DURATION = 180; // 3 minutes

export class ArenaScene extends Phaser.Scene {
  private callbacks!: ArenaCallbacks;
  private p1Units: Unit[] = [];
  private p2Units: Unit[] = [];
  private p1Castle!: Building;
  private p2Castle!: Building;
  private combatSystem!: CombatSystem;
  private elapsed = 0;
  private gameOver = false;
  private groundLayer!: Phaser.GameObjects.Graphics;
  private readonly minZoom = 0.72;
  private readonly maxZoom = 2.4;
  private pinchDistanceLast: number | null = null;
  private lastTapMs = 0;

  constructor() {
    super({ key: 'ArenaScene' });
  }

  init(data: { callbacks: ArenaCallbacks }) {
    this.callbacks = data.callbacks || {
      onTimerUpdate: () => {},
      onGameEnd: () => {},
    };
    this.elapsed = 0;
    this.gameOver = false;
    this.p1Units = [];
    this.p2Units = [];
  }

  create() {
    this.buildArena();
    this.placeCastles();
    this.spawnStartUnits();

    this.combatSystem = new CombatSystem(this);

    // Camera
    const worldW = ARENA_COLS * TILE_SIZE;
    const worldH = ARENA_ROWS * TILE_SIZE;
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.centerOn(worldW / 2, worldH / 2);
    this.cameras.main.setZoom(this.sys.game.device.input.touch ? 1.0 : 1.1);

    this.setupInput();

    // Title banner
    this.add
      .text(worldW / 2, 40, '⚔  ARENA BATTLE  ⚔', {
        fontSize: '28px',
        color: '#ffe066',
        fontFamily: 'serif',
        stroke: '#000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(100);
  }

  private setupInput() {
    const cam = this.cameras.main;
    this.input.addPointer(2);

    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.pointerType !== 'touch') return;
      const now = this.time.now;
      if (now - this.lastTapMs < 280) {
        this.resetCameraView();
      }
      this.lastTapMs = now;
    });

    this.input.on('wheel', (_ptr: Phaser.Input.Pointer, _objs: unknown, _dx: number, dy: number) => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom - dy * 0.0012, this.minZoom, this.maxZoom));
    });

    this.input.keyboard!.on('keydown-EQUALS', () => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom + 0.1, this.minZoom, this.maxZoom));
    });
    this.input.keyboard!.on('keydown-NUMPAD_ADD', () => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom + 0.1, this.minZoom, this.maxZoom));
    });
    this.input.keyboard!.on('keydown-MINUS', () => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom - 0.1, this.minZoom, this.maxZoom));
    });
    this.input.keyboard!.on('keydown-NUMPAD_SUBTRACT', () => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom - 0.1, this.minZoom, this.maxZoom));
    });
  }

  private buildArena() {
    const g = this.add.graphics();
    this.groundLayer = g;

    const worldW = ARENA_COLS * TILE_SIZE;
    const worldH = ARENA_ROWS * TILE_SIZE;

    // Sand floor
    g.fillStyle(0xd4a96a, 1);
    g.fillRect(0, 0, worldW, worldH);

    // Grass patches
    g.fillStyle(0x7aad55, 1);
    for (let r = 0; r < ARENA_ROWS; r++) {
      for (let c = 0; c < ARENA_COLS; c++) {
        const hash = (r * 31 + c * 17) % 3;
        if (hash === 0) {
          g.fillRect(c * TILE_SIZE + 8, r * TILE_SIZE + 8, TILE_SIZE - 16, TILE_SIZE - 16);
        }
      }
    }

    // Grid lines (subtle)
    g.lineStyle(1, 0x000000, 0.08);
    for (let c = 0; c <= ARENA_COLS; c++) {
      g.lineBetween(c * TILE_SIZE, 0, c * TILE_SIZE, worldH);
    }
    for (let r = 0; r <= ARENA_ROWS; r++) {
      g.lineBetween(0, r * TILE_SIZE, worldW, r * TILE_SIZE);
    }

    // Border wall
    g.lineStyle(6, 0x5c3d11, 1);
    g.strokeRect(0, 0, worldW, worldH);

    // Mid divider (soft)
    g.lineStyle(2, 0x8b5e3c, 0.5);
    g.lineBetween(worldW / 2, 0, worldW / 2, worldH);

    // Player label (blue)
    this.add
      .text(worldW * 0.25, worldH - 18, 'PLAYER', {
        fontSize: '14px',
        color: '#88aaff',
        fontFamily: 'serif',
        stroke: '#000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(1);

    // Bot label (red)
    this.add
      .text(worldW * 0.75, worldH - 18, 'BOT', {
        fontSize: '14px',
        color: '#ff8888',
        fontFamily: 'serif',
        stroke: '#000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(1);
  }

  private placeCastles() {
    const midRow = Math.floor(ARENA_ROWS / 2) - 1;

    // P1 castle: left side (tx=1, ty=midRow)
    this.p1Castle = new Building(this, 1, midRow, 'castle', 'blue');

    // P2 castle: right side
    this.p2Castle = new Building(this, ARENA_COLS - 5, midRow, 'castle', 'red');
  }

  private spawnStartUnits() {
    const mid = Math.floor(ARENA_ROWS / 2) * TILE_SIZE;

    // P1 units — left cluster
    const p1Positions: [number, number][] = [
      [5 * TILE_SIZE, mid - 2 * TILE_SIZE],
      [5 * TILE_SIZE, mid],
      [5 * TILE_SIZE, mid + 2 * TILE_SIZE],
      [7 * TILE_SIZE, mid - TILE_SIZE],
      [7 * TILE_SIZE, mid + TILE_SIZE],
    ];
    const p1Types: Array<'warrior' | 'archer'> = ['warrior', 'warrior', 'warrior', 'archer', 'archer'];
    for (let i = 0; i < p1Types.length; i++) {
      const u = new Unit(this, p1Positions[i][0], p1Positions[i][1], p1Types[i], 'blue');
      this.p1Units.push(u);
    }

    // P2 units — right cluster
    const p2Positions: [number, number][] = [
      [(ARENA_COLS - 6) * TILE_SIZE, mid - 2 * TILE_SIZE],
      [(ARENA_COLS - 6) * TILE_SIZE, mid],
      [(ARENA_COLS - 6) * TILE_SIZE, mid + 2 * TILE_SIZE],
      [(ARENA_COLS - 8) * TILE_SIZE, mid - TILE_SIZE],
      [(ARENA_COLS - 8) * TILE_SIZE, mid + TILE_SIZE],
    ];
    const p2Types: Array<'warrior' | 'archer'> = ['warrior', 'warrior', 'warrior', 'archer', 'archer'];
    for (let i = 0; i < p2Types.length; i++) {
      const u = new Unit(this, p2Positions[i][0], p2Positions[i][1], p2Types[i], 'red');
      this.p2Units.push(u);
    }
  }

  update(_time: number, delta: number) {
    if (this.gameOver) return;

    this.elapsed += delta / 1000;
    this.handleTouchCamera();
    const remaining = Math.max(0, ARENA_DURATION - Math.floor(this.elapsed));
    this.callbacks.onTimerUpdate(remaining);

    // Update units
    for (const u of this.p1Units) u.update(delta);
    for (const u of this.p2Units) u.update(delta);

    // Combat
    this.combatSystem.update(this.p1Units, this.p2Units, [this.p1Castle], [this.p2Castle]);

    // Remove dead units
    this.p1Units = this.p1Units.filter((u) => u.isAlive());
    this.p2Units = this.p2Units.filter((u) => u.isAlive());

    // Win conditions
    if (this.p2Castle.isDestroyed) {
      this.endGame('player', 'Enemy castle destroyed!');
      return;
    }
    if (this.p1Castle.isDestroyed) {
      this.endGame('bot', 'Your castle was destroyed!');
      return;
    }
    if (remaining === 0) {
      // Compare castle HP
      const p1Pct = this.p1Castle.hp / this.p1Castle.maxHp;
      const p2Pct = this.p2Castle.hp / this.p2Castle.maxHp;
      if (p1Pct > p2Pct) {
        this.endGame('player', 'Time up — highest castle HP wins!');
      } else if (p2Pct > p1Pct) {
        this.endGame('bot', 'Time up — bot had higher castle HP!');
      } else {
        this.endGame('draw', 'Time up — it\'s a draw!');
      }
    }
  }

  private handleTouchCamera() {
    const cam = this.cameras.main;
    const pointer1 = this.input.pointer1;
    const pointer2 = this.input.pointer2;
    const p1Touch = pointer1.isDown && pointer1.pointerType === 'touch';
    const p2Touch = pointer2.isDown && pointer2.pointerType === 'touch';

    if (p1Touch && p2Touch) {
      const distance = Phaser.Math.Distance.Between(pointer1.x, pointer1.y, pointer2.x, pointer2.y);
      if (this.pinchDistanceLast !== null) {
        const zoomDelta = (distance - this.pinchDistanceLast) * 0.0032;
        cam.setZoom(Phaser.Math.Clamp(cam.zoom + zoomDelta, this.minZoom, this.maxZoom));
      }
      this.pinchDistanceLast = distance;

      const prevMidX = (pointer1.prevPosition.x + pointer2.prevPosition.x) * 0.5;
      const prevMidY = (pointer1.prevPosition.y + pointer2.prevPosition.y) * 0.5;
      const midX = (pointer1.x + pointer2.x) * 0.5;
      const midY = (pointer1.y + pointer2.y) * 0.5;
      cam.scrollX -= (midX - prevMidX) / cam.zoom;
      cam.scrollY -= (midY - prevMidY) / cam.zoom;
      return;
    }

    this.pinchDistanceLast = null;

    if (p1Touch) {
      const dragDx = pointer1.x - pointer1.prevPosition.x;
      const dragDy = pointer1.y - pointer1.prevPosition.y;
      cam.scrollX -= dragDx / cam.zoom;
      cam.scrollY -= dragDy / cam.zoom;
    }
  }

  public moveCameraBy(deltaX: number, deltaY: number) {
    const cam = this.cameras.main;
    cam.scrollX += deltaX / cam.zoom;
    cam.scrollY += deltaY / cam.zoom;
  }

  public zoomCameraBy(step: number) {
    const cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Clamp(cam.zoom + step, this.minZoom, this.maxZoom));
  }

  public resetCameraView() {
    const worldW = ARENA_COLS * TILE_SIZE;
    const worldH = ARENA_ROWS * TILE_SIZE;
    this.cameras.main.centerOn(worldW / 2, worldH / 2);
    this.cameras.main.setZoom(this.sys.game.device.input.touch ? 1.0 : 1.1);
  }

  private endGame(winner: 'player' | 'bot' | 'draw', reason: string) {
    this.gameOver = true;
    const worldW = ARENA_COLS * TILE_SIZE;
    const worldH = ARENA_ROWS * TILE_SIZE;

    const msg = winner === 'player' ? '🏆 VICTORY!' : winner === 'bot' ? '💀 DEFEAT!' : '🤝 DRAW!';
    const color = winner === 'player' ? '#ffe066' : winner === 'bot' ? '#ff4444' : '#aaaaaa';

    this.add
      .text(worldW / 2, worldH / 2 - 40, msg, {
        fontSize: '56px',
        color,
        fontFamily: 'serif',
        stroke: '#000',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200);

    this.add
      .text(worldW / 2, worldH / 2 + 20, reason, {
        fontSize: '22px',
        color: '#ffffff',
        fontFamily: 'serif',
        stroke: '#000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200);

    this.time.delayedCall(3000, () => {
      this.callbacks.onGameEnd(winner, reason);
    });
  }
}
