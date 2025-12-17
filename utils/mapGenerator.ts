import { Wall, Vector2 } from '../types';
import { MAP_SIZE, MapType, MIN_OBSTACLES, MAX_OBSTACLES, CIRCULAR_WALL_MIN_RADIUS, CIRCULAR_WALL_MAX_RADIUS } from '../constants';

const randomRange = (min: number, max: number) => min + Math.random() * (max - min);

interface MapConfig {
  type: MapType;
  obstacleCount: number;
  minSpacing: number;
  zoneConfigs: Array<{
    centerX: number;
    centerY: number;
    type: string;
    obstacleCount: number;
    spread: number;
  }>;
}

const MAP_CONFIGURATIONS: Record<MapType, MapConfig> = {
  arena: {
    type: 'arena',
    obstacleCount: 25,
    minSpacing: 400,
    zoneConfigs: [
      { centerX: MAP_SIZE / 2, centerY: MAP_SIZE / 2, type: 'central', obstacleCount: 8, spread: 400 },
      { centerX: MAP_SIZE * 0.25, centerY: MAP_SIZE * 0.25, type: 'corner', obstacleCount: 4, spread: 250 },
      { centerX: MAP_SIZE * 0.75, centerY: MAP_SIZE * 0.25, type: 'corner', obstacleCount: 4, spread: 250 },
      { centerX: MAP_SIZE * 0.25, centerY: MAP_SIZE * 0.75, type: 'corner', obstacleCount: 4, spread: 250 },
      { centerX: MAP_SIZE * 0.75, centerY: MAP_SIZE * 0.75, type: 'corner', obstacleCount: 4, spread: 250 },
    ]
  },
  maze: {
    type: 'maze',
    obstacleCount: 35,
    minSpacing: 300,
    zoneConfigs: [
      { centerX: MAP_SIZE * 0.2, centerY: MAP_SIZE * 0.5, type: 'corridor', obstacleCount: 7, spread: 200 },
      { centerX: MAP_SIZE * 0.4, centerY: MAP_SIZE * 0.5, type: 'corridor', obstacleCount: 7, spread: 200 },
      { centerX: MAP_SIZE * 0.6, centerY: MAP_SIZE * 0.5, type: 'corridor', obstacleCount: 7, spread: 200 },
      { centerX: MAP_SIZE * 0.8, centerY: MAP_SIZE * 0.5, type: 'corridor', obstacleCount: 7, spread: 200 },
      { centerX: MAP_SIZE * 0.5, centerY: MAP_SIZE * 0.25, type: 'junction', obstacleCount: 4, spread: 150 },
      { centerX: MAP_SIZE * 0.5, centerY: MAP_SIZE * 0.75, type: 'junction', obstacleCount: 4, spread: 150 },
    ]
  },
  urban: {
    type: 'urban',
    obstacleCount: 30,
    minSpacing: 350,
    zoneConfigs: [
      { centerX: MAP_SIZE * 0.3, centerY: MAP_SIZE * 0.3, type: 'building', obstacleCount: 6, spread: 280 },
      { centerX: MAP_SIZE * 0.7, centerY: MAP_SIZE * 0.3, type: 'building', obstacleCount: 6, spread: 280 },
      { centerX: MAP_SIZE * 0.3, centerY: MAP_SIZE * 0.7, type: 'building', obstacleCount: 6, spread: 280 },
      { centerX: MAP_SIZE * 0.7, centerY: MAP_SIZE * 0.7, type: 'building', obstacleCount: 6, spread: 280 },
      { centerX: MAP_SIZE * 0.5, centerY: MAP_SIZE * 0.5, type: 'plaza', obstacleCount: 6, spread: 200 },
    ]
  },
  open: {
    type: 'open',
    obstacleCount: 15,
    minSpacing: 500,
    zoneConfigs: [
      { centerX: MAP_SIZE * 0.5, centerY: MAP_SIZE * 0.5, type: 'sparse', obstacleCount: 5, spread: 600 },
      { centerX: MAP_SIZE * 0.2, centerY: MAP_SIZE * 0.2, type: 'small_cluster', obstacleCount: 3, spread: 150 },
      { centerX: MAP_SIZE * 0.8, centerY: MAP_SIZE * 0.8, type: 'small_cluster', obstacleCount: 3, spread: 150 },
      { centerX: MAP_SIZE * 0.2, centerY: MAP_SIZE * 0.8, type: 'small_cluster', obstacleCount: 2, spread: 150 },
      { centerX: MAP_SIZE * 0.8, centerY: MAP_SIZE * 0.2, type: 'small_cluster', obstacleCount: 2, spread: 150 },
    ]
  },
  bunker: {
    type: 'bunker',
    obstacleCount: 28,
    minSpacing: 380,
    zoneConfigs: [
      { centerX: MAP_SIZE * 0.5, centerY: MAP_SIZE * 0.5, type: 'central_bunker', obstacleCount: 10, spread: 300 },
      { centerX: MAP_SIZE * 0.25, centerY: MAP_SIZE * 0.5, type: 'side_bunker', obstacleCount: 6, spread: 200 },
      { centerX: MAP_SIZE * 0.75, centerY: MAP_SIZE * 0.5, type: 'side_bunker', obstacleCount: 6, spread: 200 },
      { centerX: MAP_SIZE * 0.5, centerY: MAP_SIZE * 0.25, type: 'top_bunker', obstacleCount: 3, spread: 180 },
      { centerX: MAP_SIZE * 0.5, centerY: MAP_SIZE * 0.75, type: 'bottom_bunker', obstacleCount: 3, spread: 180 },
    ]
  }
};

export function generateMap(mapType?: MapType): Wall[] {
  // Random map if not specified
  const selectedType = mapType || MAP_TYPES[Math.floor(Math.random() * MAP_TYPES.length)];
  const config = MAP_CONFIGURATIONS[selectedType];
  
  const walls: Wall[] = [];
  
  // Add boundary walls
  const wallThickness = 50;
  const mapBoundary = 100;
  
  walls.push(
    { id: 'boundary-top', position: { x: mapBoundary, y: mapBoundary }, width: MAP_SIZE - mapBoundary * 2, height: wallThickness, radius: 0, isCircular: false },
    { id: 'boundary-bottom', position: { x: mapBoundary, y: MAP_SIZE - mapBoundary - wallThickness }, width: MAP_SIZE - mapBoundary * 2, height: wallThickness, radius: 0, isCircular: false },
    { id: 'boundary-left', position: { x: mapBoundary, y: mapBoundary }, width: wallThickness, height: MAP_SIZE - mapBoundary * 2, radius: 0, isCircular: false },
    { id: 'boundary-right', position: { x: MAP_SIZE - mapBoundary - wallThickness, y: mapBoundary }, width: wallThickness, height: MAP_SIZE - mapBoundary * 2, radius: 0, isCircular: false }
  );
  
  // Generate obstacles based on zones
  config.zoneConfigs.forEach((zone, zoneIdx) => {
    for (let i = 0; i < zone.obstacleCount; i++) {
      let attempts = 0;
      let obstaclePos = { x: 0, y: 0 };
      let isValid = false;
      
      while (!isValid && attempts < 40) {
        obstaclePos = {
          x: zone.centerX + randomRange(-zone.spread, zone.spread),
          y: zone.centerY + randomRange(-zone.spread, zone.spread)
        };
        
        // Check spacing from existing obstacles
        isValid = walls.every(w => {
          const dx = obstaclePos.x - w.position.x;
          const dy = obstaclePos.y - w.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          return dist >= config.minSpacing;
        });
        
        attempts++;
      }
      
      if (isValid) {
        // Determine obstacle size based on zone type
        let radius;
        if (zone.type === 'central_bunker' || zone.type === 'building') {
          radius = randomRange(80, 140); // Large structures
        } else if (zone.type === 'corridor' || zone.type === 'side_bunker') {
          radius = randomRange(60, 100); // Medium structures
        } else {
          radius = randomRange(CIRCULAR_WALL_MIN_RADIUS, CIRCULAR_WALL_MAX_RADIUS); // Default size
        }
        
        walls.push({
          id: `${selectedType}-obstacle-${zoneIdx}-${i}`,
          position: obstaclePos,
          width: 0,
          height: 0,
          radius: radius,
          isCircular: true
        });
      }
    }
  });
  
  // Add scattered obstacles for variety
  const scatteredCount = Math.floor(randomRange(MIN_OBSTACLES * 0.3, MAX_OBSTACLES * 0.3));
  for (let i = 0; i < scatteredCount; i++) {
    let attempts = 0;
    let obstaclePos = { x: 0, y: 0 };
    let isValid = false;
    
    while (!isValid && attempts < 40) {
      obstaclePos = {
        x: randomRange(400, MAP_SIZE - 400),
        y: randomRange(400, MAP_SIZE - 400)
      };
      
      isValid = walls.every(w => {
        const dx = obstaclePos.x - w.position.x;
        const dy = obstaclePos.y - w.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return dist >= config.minSpacing;
      });
      
      attempts++;
    }
    
    if (isValid) {
      const radius = randomRange(CIRCULAR_WALL_MIN_RADIUS, CIRCULAR_WALL_MAX_RADIUS);
      walls.push({
        id: `${selectedType}-scattered-${i}`,
        position: obstaclePos,
        width: 0,
        height: 0,
        radius: radius,
        isCircular: true
      });
    }
  }
  
  console.log(`Generated ${selectedType} map with ${walls.length - 4} obstacles`);
  return walls;
}

// Helper to get a random map type
export function getRandomMapType(): MapType {
  return MAP_TYPES[Math.floor(Math.random() * MAP_TYPES.length)];
}

// Export for use in GameCanvas
export const MAP_TYPES = ['arena', 'maze', 'urban', 'open', 'bunker'] as const;
