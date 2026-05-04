import * as Phaser from 'phaser';

interface RotEntry {
  sprite: Phaser.GameObjects.GameObject & { rotation: number; active: boolean };
  phase: number;
  amplitudeRad: number;
  periodMs: number;
}

interface ScaleEntry {
  sprite: Phaser.GameObjects.GameObject & { scaleY: number; active: boolean };
  phase: number;
  baseScaleY: number;
  amplitude: number;
  periodMs: number;
}

/**
 * Drives subtle sway/scale animations on a list of registered sprites
 * using one shared sine-wave phase, instead of one Phaser tween per sprite.
 * Cuts cost from N tweens to a single per-frame iteration regardless of count.
 */
export class AmbientSwaySystem {
  private rotEntries: RotEntry[] = [];
  private scaleEntries: ScaleEntry[] = [];
  private elapsedMs = 0;
  private pruneCooldownMs = 0;

  registerSway(
    sprite: Phaser.GameObjects.GameObject & { rotation: number; active: boolean },
    amplitudeDeg = 2,
    periodMs = 1800,
  ): void {
    this.rotEntries.push({
      sprite,
      phase: Math.random() * Math.PI * 2,
      amplitudeRad: (amplitudeDeg * Math.PI) / 180,
      periodMs,
    });
  }

  registerScale(
    sprite: Phaser.GameObjects.GameObject & { scaleY: number; active: boolean },
    baseScaleY: number,
    amplitude = 0.04,
    periodMs = 2000,
  ): void {
    this.scaleEntries.push({
      sprite,
      phase: Math.random() * Math.PI * 2,
      baseScaleY,
      amplitude,
      periodMs,
    });
  }

  update(dtMs: number): void {
    this.elapsedMs += dtMs;
    for (const e of this.rotEntries) {
      if (!e.sprite.active) continue;
      const w = (2 * Math.PI * this.elapsedMs) / e.periodMs + e.phase;
      e.sprite.rotation = Math.sin(w) * e.amplitudeRad;
    }
    for (const e of this.scaleEntries) {
      if (!e.sprite.active) continue;
      const w = (2 * Math.PI * this.elapsedMs) / e.periodMs + e.phase;
      e.sprite.scaleY = e.baseScaleY * (1 - e.amplitude * 0.5 + e.amplitude * 0.5 * Math.sin(w));
    }
    this.pruneCooldownMs -= dtMs;
    if (this.pruneCooldownMs <= 0) {
      this.pruneCooldownMs = 5000;
      this.prune();
    }
  }

  prune(): void {
    this.rotEntries   = this.rotEntries  .filter(e => e.sprite.active);
    this.scaleEntries = this.scaleEntries.filter(e => e.sprite.active);
  }

  clear(): void {
    this.rotEntries = [];
    this.scaleEntries = [];
  }
}
