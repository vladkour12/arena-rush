/**
 * Frame Time Monitor for debugging and optimization
 * Tracks rendering performance metrics in real-time
 */

export interface FrameMetrics {
  frameNumber: number;
  gameLoopTime: number;
  renderTime: number;
  threeDTime: number;
  totalFrameTime: number;
  fps: number;
  gpuMemory?: number;
}

export class FrameMonitor {
  private frameNumber: number = 0;
  private frameMetrics: FrameMetrics[] = [];
  private maxSamples: number = 120; // Keep last 2 seconds of 60 FPS data
  
  private gameLoopStart: number = 0;
  private renderStart: number = 0;
  private threeDStart: number = 0;
  private frameStart: number = 0;
  
  private enabled: boolean = false;
  private debugMode: boolean = false;

  constructor(enabled: boolean = false, debugMode: boolean = false) {
    this.enabled = enabled;
    this.debugMode = debugMode;
  }

  /**
   * Mark start of frame
   */
  startFrame(): void {
    if (!this.enabled) return;
    this.frameStart = performance.now();
  }

  /**
   * Mark start of game loop (logic, physics, etc.)
   */
  startGameLoop(): void {
    if (!this.enabled) return;
    this.gameLoopStart = performance.now();
  }

  /**
   * Mark end of game loop
   */
  endGameLoop(): void {
    if (!this.enabled) return;
    // This will be recorded when render starts
  }

  /**
   * Mark start of 2D rendering
   */
  startRender(): void {
    if (!this.enabled) return;
    this.renderStart = performance.now();
  }

  /**
   * Mark end of 2D rendering
   */
  endRender(): void {
    if (!this.enabled) return;
    // This will be recorded when 3D starts
  }

  /**
   * Mark start of 3D rendering
   */
  startThreeD(): void {
    if (!this.enabled) return;
    this.threeDStart = performance.now();
  }

  /**
   * Mark end of 3D rendering (end of frame)
   */
  endThreeD(): void {
    if (!this.enabled) return;
    
    const now = performance.now();
    const gameLoopTime = this.renderStart - this.gameLoopStart;
    const renderTime = this.threeDStart - this.renderStart;
    const threeDTime = now - this.threeDStart;
    const totalFrameTime = now - this.frameStart;
    
    this.frameNumber++;
    
    const metrics: FrameMetrics = {
      frameNumber: this.frameNumber,
      gameLoopTime,
      renderTime,
      threeDTime,
      totalFrameTime,
      fps: totalFrameTime > 0 ? 1000 / totalFrameTime : 0
    };
    
    this.frameMetrics.push(metrics);
    
    // Keep only last N samples
    if (this.frameMetrics.length > this.maxSamples) {
      this.frameMetrics.shift();
    }
    
    if (this.debugMode) {
      console.debug(`Frame ${this.frameNumber}: Total=${totalFrameTime.toFixed(2)}ms (GL=${gameLoopTime.toFixed(2)}ms, 2D=${renderTime.toFixed(2)}ms, 3D=${threeDTime.toFixed(2)}ms), FPS=${metrics.fps.toFixed(1)}`);
    }
  }

  /**
   * Get average metrics over last N frames
   */
  getAverageMetrics(samples: number = 30): FrameMetrics {
    const metricsToAverage = this.frameMetrics.slice(-samples);
    
    if (metricsToAverage.length === 0) {
      return {
        frameNumber: 0,
        gameLoopTime: 0,
        renderTime: 0,
        threeDTime: 0,
        totalFrameTime: 0,
        fps: 0
      };
    }
    
    const avg = metricsToAverage.reduce(
      (acc, m) => ({
        frameNumber: m.frameNumber,
        gameLoopTime: acc.gameLoopTime + m.gameLoopTime,
        renderTime: acc.renderTime + m.renderTime,
        threeDTime: acc.threeDTime + m.threeDTime,
        totalFrameTime: acc.totalFrameTime + m.totalFrameTime,
        fps: acc.fps + m.fps
      }),
      { frameNumber: 0, gameLoopTime: 0, renderTime: 0, threeDTime: 0, totalFrameTime: 0, fps: 0 }
    );
    
    const count = metricsToAverage.length;
    return {
      frameNumber: avg.frameNumber,
      gameLoopTime: avg.gameLoopTime / count,
      renderTime: avg.renderTime / count,
      threeDTime: avg.threeDTime / count,
      totalFrameTime: avg.totalFrameTime / count,
      fps: avg.fps / count
    };
  }

  /**
   * Get worst frame time
   */
  getWorstFrameTime(): number {
    return Math.max(...this.frameMetrics.map(m => m.totalFrameTime), 0);
  }

  /**
   * Get best frame time
   */
  getBestFrameTime(): number {
    return Math.min(...this.frameMetrics.map(m => m.totalFrameTime), Infinity);
  }

  /**
   * Get 95th percentile frame time (for detecting hitches)
   */
  getPercentileFrameTime(percentile: number = 95): number {
    if (this.frameMetrics.length === 0) return 0;
    
    const sorted = [...this.frameMetrics].sort((a, b) => a.totalFrameTime - b.totalFrameTime);
    const index = Math.floor((percentile / 100) * sorted.length);
    return sorted[index].totalFrameTime;
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): FrameMetrics[] {
    return [...this.frameMetrics];
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.frameMetrics = [];
    this.frameNumber = 0;
  }

  /**
   * Get summary report
   */
  getReport(): string {
    const avg = this.getAverageMetrics(60);
    const worst = this.getWorstFrameTime();
    const best = this.getBestFrameTime();
    const p95 = this.getPercentileFrameTime(95);
    
    return `
Frame Monitor Report:
  Total Frames: ${this.frameNumber}
  Avg Frame Time: ${avg.totalFrameTime.toFixed(2)}ms
  Avg FPS: ${avg.fps.toFixed(1)}
  Best Frame: ${best.toFixed(2)}ms
  Worst Frame: ${worst.toFixed(2)}ms
  95th Percentile: ${p95.toFixed(2)}ms
  
Breakdown (avg):
  Game Loop: ${avg.gameLoopTime.toFixed(2)}ms (${((avg.gameLoopTime / avg.totalFrameTime) * 100).toFixed(1)}%)
  2D Render: ${avg.renderTime.toFixed(2)}ms (${((avg.renderTime / avg.totalFrameTime) * 100).toFixed(1)}%)
  3D Render: ${avg.threeDTime.toFixed(2)}ms (${((avg.threeDTime / avg.totalFrameTime) * 100).toFixed(1)}%)
    `;
  }

  /**
   * Toggle debug logging
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  /**
   * Toggle monitoring
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

// Global frame monitor instance
export const frameMonitor = new FrameMonitor(false, false); // Disabled by default
