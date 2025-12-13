import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Vector2 } from '../types';

interface JoystickProps {
  onMove: (vector: Vector2) => void;
  color?: string;
  className?: string;
  threshold?: number; // Visual indicator for activation threshold (0-1)
}

export const Joystick: React.FC<JoystickProps> = ({ onMove, color = 'bg-white', className = '', threshold }) => {
  // Logic state
  const touchId = useRef<number | null>(null);
  const [active, setActive] = useState(false);
  
  // Visual state
  const [origin, setOrigin] = useState<Vector2>({ x: 0, y: 0 }); 
  const [position, setPosition] = useState<Vector2>({ x: 0, y: 0 });

  // Reduced radius for higher sensitivity (less movement needed to hit max)
  const MAX_RADIUS = 35; 

  const vibrate = (ms: number) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(ms);
    }
  };

  const processMove = useCallback((clientX: number, clientY: number, originX: number, originY: number) => {
    const dx = clientX - originX;
    const dy = clientY - originY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    let x = dx;
    let y = dy;
    
    // Haptic pop when hitting max range
    if (distance >= MAX_RADIUS && Math.sqrt(position.x**2 + position.y**2) < MAX_RADIUS) {
        vibrate(5);
    }

    if (distance > MAX_RADIUS) {
      const ratio = MAX_RADIUS / distance;
      x = dx * ratio;
      y = dy * ratio;
    }

    setPosition({ x, y });
    
    onMove({
      x: x / MAX_RADIUS,
      y: y / MAX_RADIUS
    });
  }, [onMove, position]);

  const handleStart = (clientX: number, clientY: number, id: number) => {
    touchId.current = id;
    setActive(true);
    setOrigin({ x: clientX, y: clientY });
    setPosition({ x: 0, y: 0 });
    onMove({ x: 0, y: 0 });
    vibrate(10);
  };

  const handleEnd = useCallback(() => {
    touchId.current = null;
    setActive(false);
    setPosition({ x: 0, y: 0 });
    onMove({ x: 0, y: 0 });
  }, [onMove]);

  const onTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    if (touchId.current !== null) return;
    const touch = e.changedTouches[0];
    handleStart(touch.clientX, touch.clientY, touch.identifier);
  };

  const onWindowTouchMove = useCallback((e: TouchEvent) => {
    if (!active || touchId.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === touchId.current) {
            e.preventDefault();
            processMove(touch.clientX, touch.clientY, origin.x, origin.y);
            return;
        }
    }
  }, [active, origin.x, origin.y, processMove]);

  const onWindowTouchEnd = useCallback((e: TouchEvent) => {
    if (!active || touchId.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchId.current) {
            handleEnd();
            return;
        }
    }
  }, [active, handleEnd]);

  // Mouse Handlers for debugging
  const onMouseDown = (e: React.MouseEvent) => {
    handleStart(e.clientX, e.clientY, 999);
  };
  const onWindowMouseMove = useCallback((e: MouseEvent) => {
    if (active && touchId.current === 999) {
        processMove(e.clientX, e.clientY, origin.x, origin.y);
    }
  }, [active, origin.x, origin.y, processMove]);
  const onWindowMouseUp = useCallback(() => {
    if (active && touchId.current === 999) {
        handleEnd();
    }
  }, [active, handleEnd]);

  useEffect(() => {
    if (active) {
      window.addEventListener('touchmove', onWindowTouchMove, { passive: false });
      window.addEventListener('touchend', onWindowTouchEnd);
      window.addEventListener('touchcancel', onWindowTouchEnd);
      window.addEventListener('mousemove', onWindowMouseMove);
      window.addEventListener('mouseup', onWindowMouseUp);
    }
    return () => {
      window.removeEventListener('touchmove', onWindowTouchMove);
      window.removeEventListener('touchend', onWindowTouchEnd);
      window.removeEventListener('touchcancel', onWindowTouchEnd);
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
    };
  }, [active, onWindowTouchMove, onWindowTouchEnd, onWindowMouseMove, onWindowMouseUp]);

  return (
    <div 
      className={`${className} touch-none select-none z-10`}
      onTouchStart={onTouchStart}
      onMouseDown={onMouseDown}
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
          <div className="relative w-24 h-24 rounded-full border-2 border-white/20 bg-black/20 backdrop-blur-sm shadow-xl flex items-center justify-center transition-transform duration-100 scale-105">
              {/* Threshold Ring */}
              {threshold && (
                  <div 
                    className="absolute rounded-full border border-white/30"
                    style={{
                        width: `${threshold * 100 * 2}%`,
                        height: `${threshold * 100 * 2}%`
                    }}
                  />
              )}
          </div>
          
          {/* Knob */}
          <div 
            className={`absolute top-1/2 left-1/2 w-12 h-12 -mt-6 -ml-6 rounded-full ${color} shadow-lg transition-transform duration-75 ease-linear flex items-center justify-center`}
            style={{
              transform: `translate(${position.x}px, ${position.y}px)`
            }}
          >
             <div className="w-8 h-8 rounded-full bg-white/30 blur-sm" />
          </div>
        </div>
      )}
    </div>
  );
};