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
  deadzone = 0.01, // Even smaller deadzone for maximum responsiveness
  responseCurve = 1.0, // Linear response for gamepad-like feel
  maxRadiusPx = 50, // Larger radius for better control range
  haptics = true
}: JoystickProps) => {
  const [active, setActive] = useState(false);
  const [origin, setOrigin] = useState<Vector2>({ x: 0, y: 0 });
  const [position, setPosition] = useState<Vector2>({ x: 0, y: 0 });

  const pointerIdRef = useRef<number | null>(null);
  const lastHapticAtMaxRef = useRef(false);
  const elementRef = useRef<HTMLDivElement | null>(null);
  const validationIntervalRef = useRef<number | null>(null);
  const touchFallbackActiveRef = useRef(false);
  const lastPointerEventTimeRef = useRef<number>(Date.now());

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
    touchFallbackActiveRef.current = false;
    setActive(false);
    setPosition({ x: 0, y: 0 });
    onMove({ x: 0, y: 0 });
    
    // Clear validation interval
    if (validationIntervalRef.current !== null) {
      clearInterval(validationIntervalRef.current);
      validationIntervalRef.current = null;
    }
  }, [onMove]);

  // Periodic pointer capture validation (iOS fix)
  const validatePointerCapture = useCallback(() => {
    if (!active || pointerIdRef.current === null || !elementRef.current) return;
    
    // Check if pointer events are still responsive
    const now = Date.now();
    const timeSinceLastEvent = now - lastPointerEventTimeRef.current;
    
    // If no pointer events received in 150ms while active, log warning
    if (timeSinceLastEvent > 150 && active) {
      console.warn('[Joystick] Pointer events may be throttled or lost', {
        timeSinceLastEvent,
        pointerId: pointerIdRef.current,
        active
      });
    }
    
    // Try to re-establish pointer capture if needed
    try {
      if (elementRef.current && pointerIdRef.current !== null) {
        // Check if we still have capture (hasPointerCapture is available in modern browsers)
        const hasCapture = (elementRef.current as any).hasPointerCapture?.(pointerIdRef.current);
        if (hasCapture === false) {
          console.warn('[Joystick] Pointer capture lost, attempting to re-establish');
          elementRef.current.setPointerCapture(pointerIdRef.current);
        }
      }
    } catch (error) {
      console.error('[Joystick] Error validating pointer capture:', error);
    }
  }, [active]);

  // Start validation interval when active
  useEffect(() => {
    if (active && validationIntervalRef.current === null) {
      validationIntervalRef.current = window.setInterval(validatePointerCapture, 100);
    } else if (!active && validationIntervalRef.current !== null) {
      clearInterval(validationIntervalRef.current);
      validationIntervalRef.current = null;
    }
    
    return () => {
      if (validationIntervalRef.current !== null) {
        clearInterval(validationIntervalRef.current);
        validationIntervalRef.current = null;
      }
    };
  }, [active, validatePointerCapture]);

  // Handle visibility change (iOS fix)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Release pointer when tab is hidden
        if (active && pointerIdRef.current !== null && elementRef.current) {
          console.log('[Joystick] Tab hidden, releasing pointer capture');
          try {
            elementRef.current.releasePointerCapture(pointerIdRef.current);
          } catch (error) {
            // Ignore errors
          }
        }
      } else if (!document.hidden && active && pointerIdRef.current !== null && elementRef.current) {
        // Re-establish pointer when tab becomes visible
        console.log('[Joystick] Tab visible, re-establishing pointer capture');
        try {
          elementRef.current.setPointerCapture(pointerIdRef.current);
        } catch (error) {
          console.error('[Joystick] Error re-establishing pointer capture:', error);
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [active]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only left-click or touch/pen.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (pointerIdRef.current != null) return;

    e.preventDefault(); // Prevent default touch behavior
    e.stopPropagation(); // Stop event bubbling
    
    lastPointerEventTimeRef.current = Date.now();
    pointerIdRef.current = e.pointerId;
    
    try {
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      console.log('[Joystick] Pointer capture established', { pointerId: e.pointerId, pointerType: e.pointerType });
    } catch (error) {
      console.error('[Joystick] Failed to set pointer capture:', error);
    }
    
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
    
    lastPointerEventTimeRef.current = Date.now();
    
    // Zero-latency update - bypass all batching and RAF
    const { positionPx, output } = computeOutput(e.clientX, e.clientY);
    setPosition(positionPx);
    onMove(output);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;
    console.log('[Joystick] Pointer up', { pointerId: e.pointerId });
    handleEnd();
  };

  const onPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;
    console.warn('[Joystick] Pointer cancelled', { pointerId: e.pointerId });
    handleEnd();
  };

  // Touch event fallback (iOS fix)
  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    // Only use touch events if pointer events are not working
    if (pointerIdRef.current !== null) return;
    if (touchFallbackActiveRef.current) return;
    if (e.touches.length === 0) return;
    
    console.log('[Joystick] Touch fallback activated');
    touchFallbackActiveRef.current = true;
    
    const touch = e.touches[0];
    setActive(true);
    setOrigin({ x: touch.clientX, y: touch.clientY });
    setPosition({ x: 0, y: 0 });
    onMove({ x: 0, y: 0 });
    vibrate(10);
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchFallbackActiveRef.current) return;
    if (e.touches.length === 0) return;
    
    e.preventDefault();
    
    const touch = e.touches[0];
    const { positionPx, output } = computeOutput(touch.clientX, touch.clientY);
    setPosition(positionPx);
    onMove(output);
  };

  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchFallbackActiveRef.current) return;
    console.log('[Joystick] Touch fallback ended');
    handleEnd();
  };

  return (
    <div 
      ref={elementRef}
      className={`${className} touch-none select-none z-10`}
      style={{ touchAction: 'none' }} // Disable all touch gestures for maximum responsiveness
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Joystick visual indicator */}
      {active && (
        <div
          className="pointer-events-none absolute"
          style={{
            left: origin.x - 50,
            top: origin.y - 50,
            width: 100,
            height: 100,
          }}
        >
          {/* Outer ring */}
          <div className="absolute inset-0 rounded-full border-2 border-white/30 bg-black/20" />
          {/* Inner knob */}
          <div
            className={`absolute w-10 h-10 rounded-full ${color} shadow-lg`}
            style={{
              left: 30 + position.x,
              top: 30 + position.y,
              transform: 'translate(-50%, -50%)',
              opacity: 0.8,
            }}
          />
        </div>
      )}
    </div>
  );
});
