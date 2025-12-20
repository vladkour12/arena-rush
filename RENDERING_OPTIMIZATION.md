# Rendering Architecture & Performance Optimization Guide

## Current Architecture

### Dual 2D + 3D Rendering System

```
┌─────────────────────────────────────────────┐
│         Game Loop (60 FPS on PC)            │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │  Game Logic & Physics (dt-based)     │  │
│  └──────────────────────────────────────┘  │
│                  ↓                          │
│  ┌──────────────────────────────────────┐  │
│  │  2D Canvas Rendering (frame N)       │  │
│  │  - Game world, bullets, particles    │  │
│  │  - UI overlays, effects              │  │
│  └──────────────────────────────────────┘  │
│                  ↓                          │
│  ┌──────────────────────────────────────┐  │
│  │  3D WebGL Rendering (async update)   │  │
│  │  - Character models                  │  │
│  │  - Environment detail                │  │
│  │  - Synchronized via state update     │  │
│  └──────────────────────────────────────┘  │
│                  ↓                          │
│  ┌──────────────────────────────────────┐  │
│  │  Next Frame Request (requestAnimFrame)   │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## Key Optimizations Implemented

### 1. Frame Throttling Optimization
- **FrameThrottler class**: Precise FPS control with drift compensation
  - Adaptive timing prevents frame rate drift
  - Exponential moving average smooths timing
  - Supports 30 FPS (mobile) and 60 FPS (desktop)
  - Configurable adaptive FPS mode

### 2. 3D Renderer Synchronization
- **Target frame rates:**
  - Desktop: 60 FPS for game loop, 60 FPS for 3D renderer
  - Mobile: 30 FPS for game loop, 30 FPS for 3D renderer
- **Reduced state updates:**
  - 3D state updates throttled to 30Hz on desktop (16ms)
  - Mobile remains at 30Hz (33ms)
- **Async rendering:**
  - 3D rendering happens asynchronously
  - No blocking on 2D render completion

### 3. Redundant Calculation Reduction
- **Cached values:**
  - Mobile detection cached in ref
  - Viewport size calculated once per frame
  - Normalized move/aim vectors
  - DPR (device pixel ratio) cached

- **Deferred calculations:**
  - 3D mesh updates only when props change
  - Wall meshes reused across frames
  - Animation frame time interpolation

### 4. Frame Time Monitoring
- **FrameMonitor class:**
  - Real-time frame time tracking
  - Breakdown by component (game loop, 2D render, 3D render)
  - Statistical analysis (avg, worst, 95th percentile)
  - Performance reports with detailed metrics

- **PerformanceMonitor component:**
  - In-game overlay with FPS/frame time
  - Color-coded performance indicators
  - Real-time drift tracking

### 5. Mobile-Specific Optimizations
- **Rendering quality adjustments:**
  - Lower particle count: 15 vs 80 (desktop)
  - Reduced 3D model segments: 6 vs 16 (characters)
  - 8-segment cylinders vs 24 (walls)
  - Smaller pixel ratio: 1x vs 2x

- **Performance adaptations:**
  - Simpler loot rendering
  - Reduced shadow blur
  - Shorter bullet trails
  - Optimized canvas rendering

## Performance Metrics

### Target Performance
```
Device      | Game Logic | 2D Render | 3D Render | Total Frame Time
------------|------------|-----------|-----------|------------------
Desktop     | ~3-5ms     | ~5-8ms    | ~6-9ms    | ~16-20ms (60 FPS)
Mobile      | ~5-8ms     | ~8-12ms   | ~5-8ms    | ~30-33ms (30 FPS)
```

### Memory Usage
- **2D Canvas:** ~2-4 MB (viewport dependent)
- **3D Scene:** ~8-15 MB (mesh count dependent)
- **Particles:** ~2-5 MB (count dependent)
- **Total:** ~15-25 MB (target)

## How to Enable Monitoring

### In-game Performance Monitor
```typescript
// Enable in GameCanvas or your app
const [enableMonitor, setEnableMonitor] = useState(false);

// Toggle with keyboard shortcut (in your input handler)
if (key === 'p') setEnableMonitor(!enableMonitor);

<PerformanceMonitor throttler={frameThrottlerRef.current} enabled={enableMonitor} />
```

### Console Reporting
```typescript
// Get frame metrics
const metrics = frameMonitor.getAverageMetrics(60);
console.log(frameMonitor.getReport());

// Enable debug logging
frameMonitor.setDebugMode(true);
frameThrottler.setDebugMode(true);
```

## Frame Pacing Algorithm

### Frame Throttler Logic
```
if (timeSinceLastFrame < targetFrameTime - driftCompensation):
  return false  // Skip frame, request next

timeDelta = (now - lastFrameTime) / 1000
clampedDelta = min(timeDelta, 1/30)  // Cap at 30 FPS minimum

drift = (timeDelta * 1000) - targetFrameTime
accumulatedDrift = 0.8 * oldDrift + 0.2 * newDrift
accumulatedDrift = clamp(accumulatedDrift, -5ms, 5ms)

return clampedDelta
```

### Benefits
1. **Stability:** Exponential moving average prevents spikes
2. **Consistency:** Drift compensation ensures steady frame rate
3. **Responsiveness:** Quick adjustment to performance changes
4. **Fairness:** Equal time budgets for all frame operations

## Best Practices

### Frame Budget Allocation (60 FPS / 16.67ms)
- Game Logic: 4-5ms (25%)
- 2D Rendering: 5-7ms (35%)
- 3D Rendering: 4-6ms (30%)
- Overhead: 1-2ms (10%)

### Reducing Frame Time
1. **Game Logic:**
   - Cache distance calculations
   - Use spatial partitioning for collision checks
   - Limit AI updates per frame

2. **2D Rendering:**
   - Batch similar draw calls
   - Cache gradient/pattern objects
   - Minimize shadow blur operations

3. **3D Rendering:**
   - Limit mesh updates
   - Use frustum culling
   - Batch geometry updates

## Debugging

### Enable Frame Analysis
```typescript
// In GameCanvas initialization
frameMonitor.setEnabled(true);
frameMonitor.setDebugMode(true);
frameThrottlerRef.current.setDebugMode(true);

// Periodically log metrics
setInterval(() => {
  console.log(frameMonitor.getReport());
  console.log(frameThrottlerRef.current.getReport());
}, 5000);
```

### Monitor Specific Events
```typescript
frameMonitor.startFrame();
frameMonitor.startGameLoop();
// ... game logic ...
frameMonitor.endGameLoop();

frameMonitor.startRender();
// ... 2D rendering ...
frameMonitor.endRender();

frameMonitor.startThreeD();
// ... 3D rendering ...
frameMonitor.endThreeD();
```

## Future Optimizations

1. **Worker Threads:** Offload physics to Web Worker
2. **Texture Atlasing:** Combine textures to reduce draw calls
3. **LOD System:** Lower detail for distant objects
4. **Frame Interpolation:** Predict future frames for smoother motion
5. **Adaptive Scaling:** Dynamically adjust canvas resolution
6. **GPU Instancing:** Batch similar 3D objects
