import { Wall } from '../types';
import { 
  MAP_SIZE, 
  MIN_OBSTACLES, 
  MAX_OBSTACLES, 
  WALL_MIN_SIZE, 
  WALL_MAX_SIZE,
  CIRCULAR_WALL_MIN_RADIUS,
  CIRCULAR_WALL_MAX_RADIUS,
  PLAYER_RADIUS
} from '../constants';

/**
 * Generates a random number between min and max using provided RNG
 */
function randomRange(min: number, max: number, rng: () => number = Math.random): number {
  return rng() * (max - min) + min;
}

/**
 * Checks if a new wall would overlap with existing walls or be too close to spawn points
 */
function isValidWallPlacement(
  newWall: Wall, 
  existingWalls: Wall[], 
  spawnPoints: { x: number; y: number }[],
  minClearance: number = 150
): boolean {
  // Check distance from spawn points
  for (const spawn of spawnPoints) {
    const dx = newWall.position.x - spawn.x;
    const dy = newWall.position.y - spawn.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < minClearance + (newWall.isCircular ? newWall.radius : Math.max(newWall.width, newWall.height))) {
      return false;
    }
  }
  
  // Check overlap with existing walls
  for (const wall of existingWalls) {
    if (checkWallOverlap(newWall, wall)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Checks if two walls overlap
 */
function checkWallOverlap(wall1: Wall, wall2: Wall): boolean {
  const buffer = 50; // Minimum spacing between walls
  
  if (wall1.isCircular && wall2.isCircular) {
    // Circle-circle collision
    const dx = wall1.position.x - wall2.position.x;
    const dy = wall1.position.y - wall2.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < wall1.radius + wall2.radius + buffer;
  } else if (!wall1.isCircular && !wall2.isCircular) {
    // Rectangle-rectangle collision with buffer
    return !(
      wall1.position.x + wall1.width / 2 + buffer < wall2.position.x - wall2.width / 2 ||
      wall1.position.x - wall1.width / 2 - buffer > wall2.position.x + wall2.width / 2 ||
      wall1.position.y + wall1.height / 2 + buffer < wall2.position.y - wall2.height / 2 ||
      wall1.position.y - wall1.height / 2 - buffer > wall2.position.y + wall2.height / 2
    );
  } else {
    // Circle-rectangle collision
    const circle = wall1.isCircular ? wall1 : wall2;
    const rect = wall1.isCircular ? wall2 : wall1;
    
    const closestX = Math.max(
      rect.position.x - rect.width / 2,
      Math.min(circle.position.x, rect.position.x + rect.width / 2)
    );
    const closestY = Math.max(
      rect.position.y - rect.height / 2,
      Math.min(circle.position.y, rect.position.y + rect.height / 2)
    );
    
    const dx = circle.position.x - closestX;
    const dy = circle.position.y - closestY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    return distance < circle.radius + buffer;
  }
}

/**
 * Generates a rectangular wall
 */
function generateRectangularWall(id: string, rng: () => number): Wall {
  const width = randomRange(WALL_MIN_SIZE, WALL_MAX_SIZE, rng);
  const height = randomRange(WALL_MIN_SIZE, WALL_MAX_SIZE, rng);
  
  return {
    id,
    position: { x: 0, y: 0 }, // Will be set later
    radius: Math.max(width, height) / 2, // Used for broad-phase collision
    width,
    height,
    isCircular: false
  };
}

/**
 * Generates a circular wall (pillar)
 */
function generateCircularWall(id: string, rng: () => number): Wall {
  const radius = randomRange(CIRCULAR_WALL_MIN_RADIUS, CIRCULAR_WALL_MAX_RADIUS, rng);
  
  return {
    id,
    position: { x: 0, y: 0 }, // Will be set later
    radius,
    width: radius * 2,
    height: radius * 2,
    isCircular: true
  };
}

/**
 * Generates an L-shaped wall (composed of two rectangles)
 */
function generateLShapedWalls(baseId: string, rng: () => number): Wall[] {
  const longSide = randomRange(150, 250, rng);
  const shortSide = randomRange(80, 120, rng);
  const thickness = randomRange(40, 60, rng);
  
  // Horizontal part
  const horizontal: Wall = {
    id: `${baseId}_h`,
    position: { x: 0, y: 0 },
    radius: Math.max(longSide, thickness) / 2,
    width: longSide,
    height: thickness,
    isCircular: false
  };
  
  // Vertical part (will be offset from horizontal)
  const vertical: Wall = {
    id: `${baseId}_v`,
    position: { x: 0, y: 0 },
    radius: Math.max(thickness, shortSide) / 2,
    width: thickness,
    height: shortSide,
    isCircular: false
  };
  
  return [horizontal, vertical];
}

/**
 * Generates a T-shaped wall (composed of two rectangles)
 */
function generateTShapedWalls(baseId: string, rng: () => number): Wall[] {
  const topWidth = randomRange(150, 250, rng);
  const stemHeight = randomRange(100, 150, rng);
  const thickness = randomRange(40, 60, rng);
  
  // Top horizontal part
  const top: Wall = {
    id: `${baseId}_top`,
    position: { x: 0, y: 0 },
    radius: Math.max(topWidth, thickness) / 2,
    width: topWidth,
    height: thickness,
    isCircular: false
  };
  
  // Vertical stem
  const stem: Wall = {
    id: `${baseId}_stem`,
    position: { x: 0, y: 0 },
    radius: Math.max(thickness, stemHeight) / 2,
    width: thickness,
    height: stemHeight,
    isCircular: false
  };
  
  return [top, stem];
}

/**
 * Positions L-shaped walls relative to a base position
 */
function positionLShapedWalls(walls: Wall[], baseX: number, baseY: number): void {
  const [horizontal, vertical] = walls;
  
  // Position horizontal part
  horizontal.position.x = baseX;
  horizontal.position.y = baseY;
  
  // Position vertical part at the end of horizontal
  vertical.position.x = baseX + horizontal.width / 2 - vertical.width / 2;
  vertical.position.y = baseY + horizontal.height / 2 + vertical.height / 2;
}

/**
 * Positions T-shaped walls relative to a base position
 */
function positionTShapedWalls(walls: Wall[], baseX: number, baseY: number): void {
  const [top, stem] = walls;
  
  // Position top part
  top.position.x = baseX;
  top.position.y = baseY;
  
  // Position stem below top
  stem.position.x = baseX;
  stem.position.y = baseY + top.height / 2 + stem.height / 2;
}

/**
 * Generates diverse obstacles for the map
 */
/**
 * Simple seeded random number generator
 */
function seededRandom(seed: number): () => number {
  let currentSeed = seed;
  return () => {
    currentSeed = (currentSeed * 9301 + 49297) % 233280;
    return currentSeed / 233280;
  };
}

export function generateObstacles(seed?: number): Wall[] {
  // Use seed for deterministic generation if provided
  const rng = seed !== undefined ? seededRandom(seed) : Math.random;
  
  const walls: Wall[] = [];
  const obstacleCount = Math.floor(rng() * (MAX_OBSTACLES - MIN_OBSTACLES) + MIN_OBSTACLES);
  
  // Define spawn points to keep clear
  const spawnPoints = [
    { x: MAP_SIZE / 4, y: MAP_SIZE / 2 }, // Player 1 spawn
    { x: MAP_SIZE * 0.75, y: MAP_SIZE / 2 }, // Player 2/Bot spawn
    { x: MAP_SIZE / 2, y: MAP_SIZE / 2 } // Center (often used)
  ];
  
  const margin = 200; // Keep walls away from edges
  let attempts = 0;
  const maxAttempts = obstacleCount * 10; // Prevent infinite loops
  
  while (walls.length < obstacleCount && attempts < maxAttempts) {
    attempts++;
    
    // Randomly choose wall type
    const wallType = rng();
    let newWalls: Wall[] = [];
    let baseX = 0;
    let baseY = 0;
    
    if (wallType < 0.4) {
      // 40% chance: Rectangular wall
      const wall = generateRectangularWall(`wall_${walls.length}`, rng);
      baseX = randomRange(margin, MAP_SIZE - margin, rng);
      baseY = randomRange(margin, MAP_SIZE - margin, rng);
      wall.position.x = baseX;
      wall.position.y = baseY;
      newWalls = [wall];
      
    } else if (wallType < 0.65) {
      // 25% chance: Circular wall
      const wall = generateCircularWall(`wall_${walls.length}`, rng);
      baseX = randomRange(margin, MAP_SIZE - margin, rng);
      baseY = randomRange(margin, MAP_SIZE - margin, rng);
      wall.position.x = baseX;
      wall.position.y = baseY;
      newWalls = [wall];
      
    } else if (wallType < 0.85) {
      // 20% chance: L-shaped wall
      newWalls = generateLShapedWalls(`wall_${walls.length}`, rng);
      baseX = randomRange(margin, MAP_SIZE - margin - 150, rng);
      baseY = randomRange(margin, MAP_SIZE - margin - 150, rng);
      positionLShapedWalls(newWalls, baseX, baseY);
      
    } else {
      // 15% chance: T-shaped wall
      newWalls = generateTShapedWalls(`wall_${walls.length}`, rng);
      baseX = randomRange(margin, MAP_SIZE - margin - 150, rng);
      baseY = randomRange(margin, MAP_SIZE - margin - 150, rng);
      positionTShapedWalls(newWalls, baseX, baseY);
    }
    
    // Check if all new walls are valid
    let allValid = true;
    for (const wall of newWalls) {
      if (!isValidWallPlacement(wall, walls, spawnPoints)) {
        allValid = false;
        break;
      }
    }
    
    if (allValid) {
      walls.push(...newWalls);
    }
  }
  
  console.log(`Generated ${walls.length} obstacle components from ${obstacleCount} attempted obstacles`);
  
  return walls;
}
