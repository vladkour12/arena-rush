import React, { useEffect, useRef, useState } from 'react';
import { frameMonitor } from '../utils/frameMonitor';
import { FrameThrottler } from '../utils/frameThrottler';

interface PerformanceMonitorProps {
  throttler: FrameThrottler;
  enabled?: boolean;
}

/**
 * Real-time performance monitoring display
 * Shows FPS, frame times, and performance metrics
 */
export const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({ throttler, enabled = false }) => {
  const [metrics, setMetrics] = useState({
    fps: 0,
    frameTime: 0,
    variance: 0,
    avgFrameTime: 0,
    p95: 0,
    drift: 0
  });
  const updateIntervalRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!enabled) return;

    updateIntervalRef.current = setInterval(() => {
      const avgFrameTime = throttler.getAverageFrameTime();
      const fps = throttler.getCurrentFPS();
      const variance = throttler.getFrameTimeVariance();
      const drift = throttler.getDrift();

      setMetrics({
        fps: Math.round(fps * 10) / 10,
        frameTime: Math.round(avgFrameTime * 100) / 100,
        variance: Math.round(variance * 100) / 100,
        avgFrameTime: Math.round(avgFrameTime * 100) / 100,
        p95: 0, // Would need to add to throttler
        drift: Math.round(drift * 100) / 100
      });
    }, 500);

    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, [enabled, throttler]);

  if (!enabled) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 10,
      right: 10,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      color: '#0f0',
      fontFamily: 'monospace',
      fontSize: '12px',
      padding: '10px',
      borderRadius: '5px',
      zIndex: 9999,
      pointerEvents: 'none',
      minWidth: '200px'
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Performance Monitor</div>
      
      <div>FPS: <span style={{ color: metrics.fps > 50 ? '#0f0' : metrics.fps > 25 ? '#ff0' : '#f00' }}>
        {metrics.fps}
      </span></div>
      
      <div>Frame Time: <span style={{ color: metrics.frameTime < 20 ? '#0f0' : metrics.frameTime < 33 ? '#ff0' : '#f00' }}>
        {metrics.frameTime}ms
      </span></div>
      
      <div>Variance: {metrics.variance.toFixed(2)}ms</div>
      
      <div>Drift: {metrics.drift.toFixed(2)}ms</div>
      
      <div style={{ marginTop: '8px', fontSize: '10px', opacity: 0.8 }}>
        Target: {throttler.getTargetFPS()} FPS
      </div>
    </div>
  );
};
