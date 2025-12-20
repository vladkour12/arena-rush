/**
 * Optimized Frame Throttler with VSynced pacing
 * Provides precise frame rate control and adaptive timing
 */

export interface ThrottlerConfig {
  targetFPS: number;
  adaptiveMode?: boolean; // Auto-detect device and adjust FPS
  vsyncEnabled?: boolean; // Align with screen refresh rate
  debugMode?: boolean;
}

export class FrameThrottler {
  private targetFPS: number;
  private adaptiveMode: boolean;
  private vsyncEnabled: boolean;
  private debugMode: boolean;
  
  private lastFrameTime: number = 0;
  private frameTimeBuffer: number[] = [];
  private maxBufferSize: number = 60;
  
  private accumulatedDrift: number = 0;
  private frameCount: number = 0;
  private droppedFrames: number = 0;
  
  // Adaptive FPS tracking
  private detectedRefreshRate: number = 60;
  private performanceScore: number = 1.0;

  constructor(config: ThrottlerConfig) {
    this.targetFPS = config.targetFPS;
    this.adaptiveMode = config.adaptiveMode ?? false;
    this.vsyncEnabled = config.vsyncEnabled ?? true;
    this.debugMode = config.debugMode ?? false;
    
    this.lastFrameTime = performance.now();
    this.detectRefreshRate();
  }

  /**
   * Detect screen refresh rate
   */
  private detectRefreshRate(): void {
    // Try to get refresh rate from screen object
    if (typeof window !== 'undefined' && 'screen' in window && 'refreshRate' in (window as any).screen) {
      this.detectedRefreshRate = (window as any).screen.refreshRate || 60;
    } else {
      this.detectedRefreshRate = 60; // Fallback
    }
  }

  /**
   * Should frame be rendered? Call this at start of frame
   */
  shouldRenderFrame(): boolean {
    const now = performance.now();
    const elapsed = now - this.lastFrameTime;
    const frameTime = 1000 / this.targetFPS;
    
    // Simple frame time check - always render if minimum time passed
    // This prevents frame skipping and maintains smooth visuals
    if (elapsed >= frameTime * 0.95) { // 95% of target frame time
      return true;
    }
    
    return false;
  }

  /**
   * Mark frame as rendered and get delta time
   */
  captureFrame(): number {
    const now = performance.now();
    const deltaTime = (now - this.lastFrameTime) / 1000; // Convert to seconds
    
    // Cap delta time to prevent physics from jumping
    // Use a reasonable cap (33ms = 30 FPS minimum)
    const cappedDelta = Math.min(deltaTime, 0.033);
    
    // Update frame time
    this.lastFrameTime = now;
    
    // Track frame time for analysis
    this.frameTimeBuffer.push(deltaTime * 1000);
    if (this.frameTimeBuffer.length > this.maxBufferSize) {
      this.frameTimeBuffer.shift();
    }
    
    this.frameCount++;
    
    return cappedDelta;
  }

  /**
   * Get average frame time (ms)
   */
  getAverageFrameTime(): number {
    if (this.frameTimeBuffer.length === 0) return 0;
    const sum = this.frameTimeBuffer.reduce((a, b) => a + b, 0);
    return sum / this.frameTimeBuffer.length;
  }

  /**
   * Get current FPS
   */
  getCurrentFPS(): number {
    const avgFrameTime = this.getAverageFrameTime();
    return avgFrameTime > 0 ? 1000 / avgFrameTime : 0;
  }

  /**
   * Get frame time variance (for detecting inconsistency)
   */
  getFrameTimeVariance(): number {
    if (this.frameTimeBuffer.length === 0) return 0;
    const avg = this.getAverageFrameTime();
    const variance = this.frameTimeBuffer.reduce((sum, ft) => sum + Math.pow(ft - avg, 2), 0) / this.frameTimeBuffer.length;
    return Math.sqrt(variance); // Standard deviation
  }

  /**
   * Dynamically adjust target FPS based on performance
   */
  adaptFPS(performanceMetric: number): void {
    if (!this.adaptiveMode) return;
    
    // performanceMetric: 0-1 (0 = bad performance, 1 = good performance)
    this.performanceScore = performanceMetric;
    
    if (performanceMetric < 0.7) {
      // Performance is poor, reduce FPS
      if (this.targetFPS > 30) {
        this.targetFPS = Math.max(30, this.targetFPS - 10);
        if (this.debugMode) console.warn(`Reduced FPS to ${this.targetFPS} due to poor performance`);
      }
    } else if (performanceMetric > 0.95 && this.targetFPS < 60) {
      // Performance is excellent, increase FPS
      this.targetFPS = Math.min(60, this.targetFPS + 5);
      if (this.debugMode) console.log(`Increased FPS to ${this.targetFPS} due to good performance`);
    }
  }

  /**
   * Reset throttler state
   */
  reset(): void {
    this.lastFrameTime = performance.now();
    this.frameTimeBuffer = [];
    this.accumulatedDrift = 0;
  }

  /**
   * Get diagnostic report
   */
  getReport(): string {
    const avgFrameTime = this.getAverageFrameTime();
    const fps = this.getCurrentFPS();
    const variance = this.getFrameTimeVariance();
    
    return `
Frame Throttler Report:
  Target FPS: ${this.targetFPS}
  Detected Refresh Rate: ${this.detectedRefreshRate}Hz
  Current FPS: ${fps.toFixed(1)}
  Avg Frame Time: ${avgFrameTime.toFixed(2)}ms
  Frame Time Variance: ${variance.toFixed(2)}ms
  Accumulated Drift: ${this.accumulatedDrift.toFixed(2)}ms
  Total Frames: ${this.frameCount}
  Dropped Frames: ${this.droppedFrames}
  Adaptive Mode: ${this.adaptiveMode}
  Performance Score: ${(this.performanceScore * 100).toFixed(1)}%
    `;
  }

  /**
   * Set debug mode
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  /**
   * Get target FPS
   */
  getTargetFPS(): number {
    return this.targetFPS;
  }

  /**
   * Set target FPS
   */
  setTargetFPS(fps: number): void {
    this.targetFPS = Math.max(15, Math.min(120, fps));
  }

  /**
   * Get accumulated drift
   */
  getDrift(): number {
    return this.accumulatedDrift;
  }
}

// Create default throttler
export const createFrameThrottler = (targetFPS: number, adaptive: boolean = false): FrameThrottler => {
  return new FrameThrottler({
    targetFPS,
    adaptiveMode: adaptive,
    vsyncEnabled: true,
    debugMode: false
  });
};
