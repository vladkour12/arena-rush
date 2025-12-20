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
  // If wall is circular, use circle-to-circle collision
  if (wall.isCircular) {
    const dist = getDistance(circle.position, wall.position);
    return dist < circle.radius + wall.radius;
  }
  
  // Rectangle collision (original logic)
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

/**
 * Check if there's a clear line of sight between two points
 * Returns true if line of sight is clear (no obstacles blocking)
 */
export const hasLineOfSight = (from: Vector2, to: Vector2, obstacles: Wall[]): boolean => {
  // Check if line intersects with any obstacle
  for (const obstacle of obstacles) {
    if (lineIntersectsObstacle(from, to, obstacle)) {
      return false; // Line of sight blocked
    }
  }
  return true; // Clear line of sight
};

/**
 * Check if a line segment intersects with an obstacle
 */
const lineIntersectsObstacle = (p1: Vector2, p2: Vector2, obstacle: Wall): boolean => {
  if (obstacle.isCircular) {
    // Check line-circle intersection
    return lineIntersectsCircle(p1, p2, obstacle.position, obstacle.radius);
  } else {
    // Check line-rectangle intersection
    return lineIntersectsRect(p1, p2, obstacle);
  }
};

/**
 * Check if a line segment intersects with a circle
 */
const lineIntersectsCircle = (p1: Vector2, p2: Vector2, center: Vector2, radius: number): boolean => {
  // Vector from p1 to p2
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  
  // Vector from p1 to circle center
  const fx = p1.x - center.x;
  const fy = p1.y - center.y;
  
  // Quadratic formula coefficients
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  
  const discriminant = b * b - 4 * a * c;
  
  // No intersection
  if (discriminant < 0) {
    return false;
  }
  
  // Check if intersection points are within the line segment
  const t1 = (-b - Math.sqrt(discriminant)) / (2 * a);
  const t2 = (-b + Math.sqrt(discriminant)) / (2 * a);
  
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1) || (t1 < 0 && t2 > 1);
};

/**
 * Check if a line segment intersects with a rectangle
 */
const lineIntersectsRect = (p1: Vector2, p2: Vector2, rect: Wall): boolean => {
  // Check if line intersects any of the four edges of the rectangle
  const left = rect.position.x;
  const right = rect.position.x + rect.width;
  const top = rect.position.y;
  const bottom = rect.position.y + rect.height;
  
  // Check all four edges
  return (
    lineIntersectsLine(p1, p2, {x: left, y: top}, {x: right, y: top}) ||      // Top edge
    lineIntersectsLine(p1, p2, {x: right, y: top}, {x: right, y: bottom}) ||  // Right edge
    lineIntersectsLine(p1, p2, {x: left, y: bottom}, {x: right, y: bottom}) || // Bottom edge
    lineIntersectsLine(p1, p2, {x: left, y: top}, {x: left, y: bottom})       // Left edge
  );
};

/**
 * Check if two line segments intersect
 */
const lineIntersectsLine = (p1: Vector2, p2: Vector2, p3: Vector2, p4: Vector2): boolean => {
  const d1 = (p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x);
  const d2 = (p4.x - p3.x) * (p2.y - p3.y) - (p4.y - p3.y) * (p2.x - p3.x);
  const d3 = (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
  const d4 = (p2.x - p1.x) * (p4.y - p1.y) - (p2.y - p1.y) * (p4.x - p1.x);
  
  return (d1 * d2 < 0) && (d3 * d4 < 0);
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
  // Cap at 1.5 for mobile devices to significantly improve performance
  if (isMobileDevice()) {
    return Math.min(baseDPR, 1.5);
  }
  // Cap at 2 for desktop to balance quality and performance
  return Math.min(baseDPR, 2);
};

/**
 * Resolves collision between a circle and a wall with sliding/bouncing
 * Returns adjusted velocity to prevent getting stuck
 */
export const resolveWallCollision = (
  circle: Entity,
  velocity: Vector2,
  wall: Wall,
  friction: number = 0.3,
  elasticity: number = 0.2
): Vector2 => {
  if (wall.isCircular) {
    return resolveCircularWallCollision(circle, velocity, wall, friction, elasticity);
  } else {
    return resolveRectangularWallCollision(circle, velocity, wall, friction, elasticity);
  }
};

/**
 * Resolves collision with circular walls (pillars)
 */
const resolveCircularWallCollision = (
  circle: Entity,
  velocity: Vector2,
  wall: Wall,
  friction: number,
  elasticity: number
): Vector2 => {
  const dx = circle.position.x - wall.position.x;
  const dy = circle.position.y - wall.position.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  if (distance === 0) return velocity; // Avoid division by zero
  
  // Normal vector from wall to circle
  const nx = dx / distance;
  const ny = dy / distance;
  
  // Push circle out of wall
  const overlap = (circle.radius + wall.radius) - distance;
  if (overlap > 0) {
    circle.position.x += nx * overlap;
    circle.position.y += ny * overlap;
  }
  
  // Calculate velocity components
  const dotProduct = velocity.x * nx + velocity.y * ny;
  
  // If moving away from wall, don't modify velocity
  if (dotProduct > 0) return velocity;
  
  // Split velocity into normal and tangent components
  const normalVel = { x: nx * dotProduct, y: ny * dotProduct };
  const tangentVel = { x: velocity.x - normalVel.x, y: velocity.y - normalVel.y };
  
  // Apply elasticity to normal component (bounce) and friction to tangent (slide)
  return {
    x: tangentVel.x * (1 - friction) - normalVel.x * elasticity,
    y: tangentVel.y * (1 - friction) - normalVel.y * elasticity
  };
};

/**
 * Resolves collision with rectangular walls
 */
const resolveRectangularWallCollision = (
  circle: Entity,
  velocity: Vector2,
  wall: Wall,
  friction: number,
  elasticity: number
): Vector2 => {
  // Find closest point on rectangle to circle
  const halfWidth = wall.width / 2;
  const halfHeight = wall.height / 2;
  
  const closestX = clamp(
    circle.position.x,
    wall.position.x - halfWidth,
    wall.position.x + halfWidth
  );
  const closestY = clamp(
    circle.position.y,
    wall.position.y - halfHeight,
    wall.position.y + halfHeight
  );
  
  // Vector from closest point to circle center
  const dx = circle.position.x - closestX;
  const dy = circle.position.y - closestY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  if (distance === 0) {
    // Circle center is inside rectangle - push out in direction of velocity or up
    const pushDir = getLength(velocity) > 0 ? normalize(velocity) : { x: 0, y: -1 };
    circle.position.x += pushDir.x * (circle.radius + 5);
    circle.position.y += pushDir.y * (circle.radius + 5);
    return { x: velocity.x * elasticity, y: velocity.y * elasticity };
  }
  
  // Normal vector from wall to circle
  const nx = dx / distance;
  const ny = dy / distance;
  
  // Push circle out if overlapping
  const overlap = circle.radius - distance;
  if (overlap > 0) {
    circle.position.x += nx * overlap;
    circle.position.y += ny * overlap;
  }
  
  // Calculate velocity components
  const dotProduct = velocity.x * nx + velocity.y * ny;
  
  // If moving away from wall, don't modify velocity
  if (dotProduct > 0) return velocity;
  
  // Split velocity into normal and tangent components
  const normalVel = { x: nx * dotProduct, y: ny * dotProduct };
  const tangentVel = { x: velocity.x - normalVel.x, y: velocity.y - normalVel.y };
  
  // Apply elasticity to normal component (bounce) and friction to tangent (slide)
  return {
    x: tangentVel.x * (1 - friction) - normalVel.x * elasticity,
    y: tangentVel.y * (1 - friction) - normalVel.y * elasticity
  };
};