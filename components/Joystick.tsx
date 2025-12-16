import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Vector2 } from '../types';
import { applyRadialDeadzone, clamp, getLength } from '../utils/gameUtils';

interface JoystickProps {
  onMove: (vector: Vector2) => void;
  color?: string;
  className?: string;
  threshold?: number; // Visual indicator for activation threshold (0-1)
  deadzone?: number; // Radial deadzone (0..1)
  responseCurve?: number; // 1 = linear, >1 = finer near center
  maxRadiusPx?: number; // Visual/physical radius in px
  haptics?: boolean;
}

export const Joystick = React.memo(({
  onMove,
  color = 'bg-white',
  className = '',
  threshold,
  deadzone = 0.05, // Further reduced for better responsiveness
  responseCurve = 1.2, // Slightly curved for smoother feel at center
  maxRadiusPx = 30, // Smaller radius (was 40)
  haptics = true
}: JoystickProps) => {
  const [active, setActive] = useState(false);
  const [origin, setOrigin] = useState<Vector2>({ x: 0, y: 0 });
  const [position, setPosition] = useState<Vector2>({ x: 0, y: 0 });

  const pointerIdRef = useRef<number | null>(null);
  const latestClientRef = useRef<Vector2>({ x: 0, y: 0 });
  const rafIdRef = useRef<number | null>(null);
  const lastHapticAtMaxRef = useRef(false);

  const safeDeadzone = useMemo(() => clamp(deadzone, 0, 0.99), [deadzone]);
  const safeCurve = useMemo(() => Math.max(0.5, responseCurve), [responseCurve]);
  const maxRadius = useMemo(() => Math.max(20, maxRadiusPx), [maxRadiusPx]);

  const vibrate = useCallback(
    (ms: number) => {
      if (!haptics) return;
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(ms);
    },
    [haptics]
  );

  const computeOutput = useCallback(
    (clientX: number, clientY: number) => {
      const dx = clientX - origin.x;
      const dy = clientY - origin.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let px = dx;
      let py = dy;

      const isAtMax = dist >= maxRadius - 0.001;
      if (isAtMax && !lastHapticAtMaxRef.current) vibrate(5);
      lastHapticAtMaxRef.current = isAtMax;

      if (dist > maxRadius) {
        const ratio = maxRadius / dist;
        px = dx * ratio;
        py = dy * ratio;
      }

      const normalized = { x: px / maxRadius, y: py / maxRadius };
      const deadzoned = applyRadialDeadzone(normalized, safeDeadzone);

      // Response curve (radial): keeps direction, changes magnitude.
      const len = getLength(deadzoned);
      if (len <= 0.00001) return { positionPx: { x: 0, y: 0 }, output: { x: 0, y: 0 } };

      const scaledLen = clamp(Math.pow(len, safeCurve), 0, 1);
      const dirX = deadzoned.x / len;
      const dirY = deadzoned.y / len;

      return {
        positionPx: { x: px, y: py },
        output: { x: dirX * scaledLen, y: dirY * scaledLen }
      };
    },
    [maxRadius, origin.x, origin.y, safeCurve, safeDeadzone, vibrate]
  );

  const flush = useCallback(() => {
    rafIdRef.current = null;
    const { x, y } = latestClientRef.current;
    const { positionPx, output } = computeOutput(x, y);
    setPosition(positionPx);
    // Immediate callback for better responsiveness
    onMove(output);
  }, [computeOutput, onMove]);

  const scheduleFlush = useCallback(() => {
    if (rafIdRef.current != null) return;
    rafIdRef.current = window.requestAnimationFrame(flush);
  }, [flush]);

  const handleEnd = useCallback(() => {
    pointerIdRef.current = null;
    lastHapticAtMaxRef.current = false;
    if (rafIdRef.current != null) {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    setActive(false);
    setPosition({ x: 0, y: 0 });
    onMove({ x: 0, y: 0 });
  }, [onMove]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current != null) window.cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only left-click or touch/pen.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (pointerIdRef.current != null) return;

    pointerIdRef.current = e.pointerId;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    setActive(true);
    setOrigin({ x: e.clientX, y: e.clientY });
    latestClientRef.current = { x: e.clientX, y: e.clientY };
    setPosition({ x: 0, y: 0 });
    onMove({ x: 0, y: 0 });
    vibrate(10);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!active) return;
    if (pointerIdRef.current !== e.pointerId) return;
    latestClientRef.current = { x: e.clientX, y: e.clientY };
    // Immediate flush for better responsiveness
    const { positionPx, output } = computeOutput(e.clientX, e.clientY);
    setPosition(positionPx);
    onMove(output);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;
    handleEnd();
  };

  const onPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;
    handleEnd();
  };

  return (
    <div 
      className={`${className} touch-none select-none z-10`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {active && (
        <div 
          className="fixed pointer-events-none"
          style={{ 
            left: origin.x, 
            top: origin.y,
            transform: 'translate(-50%, -50%)' 
          }}
        >
          {/* Base */}
          <div 
            className="relative rounded-full border-2 border-white/10 bg-black/10 backdrop-blur-sm shadow-lg flex items-center justify-center transition-transform duration-100 scale-105"
            style={{
                width: maxRadius * 2 + 16,
                height: maxRadius * 2 + 16
            }}
          >
              {/* Threshold Ring */}
              {threshold != null && (
                  <div 
                    className="absolute rounded-full border border-white/15"
                    style={{
                        width: `${threshold * 100 * 2}%`,
                        height: `${threshold * 100 * 2}%`
                    }}
                  />
              )}
          </div>
          
          {/* Knob - removed transition for instant response */}
          <div 
            className={`absolute top-1/2 left-1/2 w-10 h-10 -mt-5 -ml-5 rounded-full ${color} shadow-lg flex items-center justify-center opacity-40`}
            style={{
              transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
              willChange: 'transform' // Optimize for frequent transforms
            }}
          >
             <div className="w-6 h-6 rounded-full bg-white/20 blur-sm" />
          </div>
        </div>
      )}
    </div>
  );
});
