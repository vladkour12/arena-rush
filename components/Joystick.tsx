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
  deadzone = 0.02, // Minimal deadzone for instant response (was 0.05)
  responseCurve = 1.0, // Linear response for gamepad-like feel (was 1.2)
  maxRadiusPx = 35, // Slightly larger for better control (was 30)
  haptics = true
}: JoystickProps) => {
  const [active, setActive] = useState(false);
  const [origin, setOrigin] = useState<Vector2>({ x: 0, y: 0 });
  const [position, setPosition] = useState<Vector2>({ x: 0, y: 0 });

  const pointerIdRef = useRef<number | null>(null);
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

  const handleEnd = useCallback(() => {
    pointerIdRef.current = null;
    lastHapticAtMaxRef.current = false;
    setActive(false);
    setPosition({ x: 0, y: 0 });
    onMove({ x: 0, y: 0 });
  }, [onMove]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only left-click or touch/pen.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (pointerIdRef.current != null) return;

    e.preventDefault(); // Prevent default touch behavior
    e.stopPropagation(); // Stop event bubbling
    pointerIdRef.current = e.pointerId;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    setActive(true);
    setOrigin({ x: e.clientX, y: e.clientY });
    setPosition({ x: 0, y: 0 });
    onMove({ x: 0, y: 0 });
    vibrate(10);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!active) return;
    if (pointerIdRef.current !== e.pointerId) return;
    e.preventDefault(); // Prevent default touch behavior for better performance
    e.stopPropagation(); // Stop event bubbling
    // Zero-latency update - bypass all batching and RAF
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
      style={{ touchAction: 'none' }} // Disable all touch gestures for maximum responsiveness
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {/* Joysticks are now invisible but still fully functional */}
    </div>
  );
});
