import { Vector2, Entity, Wall } from '../types';

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