import { Vector2, Entity, Wall } from '../types';

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const getLength = (v: Vector2) => Math.sqrt(v.x * v.x + v.y * v.y);

export const normalize = (v: Vector2): Vector2 => {
  const len = getLength(v);
  if (len <= 0.00001) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
};

/**
 * Applies a radial deadzone and preserves direction.
 * Returned vector is clamped to length <= 1.
 */
export const applyRadialDeadzone = (v: Vector2, deadzone: number): Vector2 => {
  const dz = clamp(deadzone, 0, 0.99);
  const len = getLength(v);
  if (len <= dz) return { x: 0, y: 0 };
  const dir = { x: v.x / len, y: v.y / len };
  const scaled = clamp((len - dz) / (1 - dz), 0, 1);
  return { x: dir.x * scaled, y: dir.y * scaled };
};

export const getDistance = (p1: Vector2, p2: Vector2): number => {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

export const getAngle = (p1: Vector2, p2: Vector2): number => {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x);
};

export const lerp = (start: number, end: number, t: number): number => {
  return start * (1 - t) + end * t;
};

export const lerpAngle = (start: number, end: number, t: number): number => {
  const diff = (end - start + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  return start + diff * t;
};

export const normalizeAngle = (angle: number): number => {
  let a = angle;
  while (a <= -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
};

export const checkCircleCollision = (c1: Entity, c2: Entity): boolean => {
  const dist = getDistance(c1.position, c2.position);
  return dist < c1.radius + c2.radius;
};

export const checkWallCollision = (circle: Entity, wall: Wall): boolean => {
  // Find the closest point to the circle within the rectangle
  const closestX = Math.max(wall.position.x, Math.min(circle.position.x, wall.position.x + wall.width));
  const closestY = Math.max(wall.position.y, Math.min(circle.position.y, wall.position.y + wall.height));

  // Calculate the distance between the circle's center and this closest point
  const distanceX = circle.position.x - closestX;
  const distanceY = circle.position.y - closestY;

  // If the distance is less than the circle's radius, an intersection occurs
  const distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);
  return distanceSquared < (circle.radius * circle.radius);
};

// Simple pseudo-random for consistent spawning if needed, or just Math.random
export const randomRange = (min: number, max: number) => {
  return Math.random() * (max - min) + min;
};

/**
 * Detect if running on a mobile device
 * Uses 768px breakpoint to target phones while allowing tablets to use desktop performance
 */
export const isMobileDevice = (): boolean => {
  // SSR safety check
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  
  // Check for touch support and small screen (phones, not tablets)
  const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isSmallScreen = window.innerWidth < 768; // Target phones specifically
  return hasTouchScreen && isSmallScreen;
};

/**
 * Get optimized device pixel ratio for performance
 * Caps DPR to prevent excessive canvas rendering on high-DPI mobile devices
 */
export const getOptimizedDPR = (): number => {
  // SSR safety check
  if (typeof window === 'undefined') {
    return 1;
  }
  
  const baseDPR = window.devicePixelRatio || 1;
  // Cap at 2 for mobile devices to improve performance
  if (isMobileDevice()) {
    return Math.min(baseDPR, 2);
  }
  // Cap at 2.5 for desktop to balance quality and performance
  return Math.min(baseDPR, 2.5);
};