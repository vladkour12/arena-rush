# Phase 2 Integration Guide - How to Use Particles

## Quick Start

### 1. Import Particle Utilities
```typescript
import { 
  createBulletTrail, 
  createExplosion, 
  createDamageNumber,
  emitParticles 
} from '../utils/particleSystem';
```

### 2. Access Particle Pool in GameCanvas
The particle pool is automatically created in Game3DRenderer and should be exposed as a prop or through a ref callback.

## Integration Points in GameCanvas

### When Player Fires (Bullet Trail)
In the weapon fire logic:
```typescript
// After bullet is created
if (particlePool) {
  createBulletTrail(
    particlePool,
    playerPosition,
    bulletTarget,
    new THREE.Color(0xffff00)  // Yellow
  );
}
```

### When Damage is Dealt (Damage Number + Particles)
In the damage handler:
```typescript
// After damage is calculated
if (particlePool) {
  // Floating damage number
  createDamageNumber(
    scene3D,
    targetPosition,
    damageAmount,
    isCriticalHit
  );
  
  // Blood/impact particles
  createExplosion(
    particlePool,
    impactPosition,
    new THREE.Color(0xff3333),  // Red
    0.5                          // intensity
  );
}
```

### When Enemy Dies (Explosion)
In the death handler:
```typescript
// When enemy is defeated
if (particlePool) {
  createExplosion(
    particlePool,
    enemyPosition,
    new THREE.Color(0xff6600),  // Orange
    2.0                          // intensity
  );
}
```

### When Items are Picked Up (Sparkle Effect)
```typescript
// Item collection
if (particlePool) {
  for (let i = 0; i < 5; i++) {
    emitParticles(particlePool, 1, {
      position: itemPosition,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 300,
        Math.random() * 200,
        (Math.random() - 0.5) * 300
      ),
      color: new THREE.Color(0x00ff00),  // Green
      size: 1.5,
      lifetime: 400
    });
  }
}
```

## PC Controls Implementation

### Keyboard Controls Already Active
The keyboard controls are automatically enabled when:
- App state is AppState.Playing
- User presses keys (WASD, Arrows, Space, Shift)
- Mouse moves or clicks

### Accessing Input in GameCanvas
The inputRef is passed from App.tsx:
```typescript
// In GameCanvas, access input like:
const moveX = inputRef.current.move.x;
const moveY = inputRef.current.move.y;
const isFiring = inputRef.current.fire;
const isAiming = inputRef.current.isPointerAiming;
const aimPosition = inputRef.current.pointer;  // Screen pixels
```

### Processing Mouse Aim for Gameplay
Convert screen coordinates to game world coordinates:
```typescript
// Mouse position to world coordinates
const mouseWorldX = cameraPosition.x + (aimPosition.x / screenWidth) * viewportWidth;
const mouseWorldY = cameraPosition.y + (aimPosition.y / screenHeight) * viewportHeight;

// Use for aiming direction
const aimAngle = Math.atan2(mouseWorldY - playerY, mouseWorldX - playerX);
```

## Expected Changes to GameCanvas

### 1. Add Input Handling
```typescript
// In useEffect or game loop
const input = inputRefFromApp.current;

// Update player velocity from keyboard
player.velocity.x = input.move.x * moveSpeed;
player.velocity.y = input.move.y * moveSpeed;

// Handle sprint
if (input.sprint) {
  speedMultiplier = 1.5;
}

// Handle dash
if (input.dash && canDash) {
  performDash();
}
```

### 2. Integrate Firing
```typescript
// In weapon update
if (input.fire) {
  fireWeapon(input.pointer, aimAngle);
}
```

### 3. Expose Particle Pool
The Game3DRenderer needs to provide particle pool access to GameCanvas:
```typescript
// Pass callback to get particle pool
export interface Game3DRendererProps {
  // ... existing props
  onParticlePoolReady?: (pool: ParticlePool) => void;
}

// In initialization
if (onParticlePoolReady && particlePoolRef.current) {
  onParticlePoolReady(particlePoolRef.current);
}
```

## Particle Effect Color Reference

### Standard Colors
```typescript
// Bullets
0xffff00  // Bright Yellow

// Explosions
0xff6600  // Orange
0xff3333  // Red (blood)

// Pickups
0x00ff00  // Green (health)
0x0099ff  // Blue (ammo)

// Special
0x00ff00  // Green (healing)
0xff00ff  // Magenta (critical)
```

## Testing Particles Without Full Integration

### Test Emission in Dev Console
```typescript
// Get reference to particle pool (if exposed)
const particlePool = window.gameParticlePool;

// Test bullet trail
createBulletTrail(
  particlePool,
  new THREE.Vector3(0, 10, 0),
  new THREE.Vector3(100, 10, 100),
  new THREE.Color(0xffff00)
);

// Test explosion
createExplosion(
  particlePool,
  new THREE.Vector3(200, 10, 200),
  new THREE.Color(0xff6600),
  1.0
);
```

## Performance Considerations

### Particle Count Limits
- Desktop: 5000 particles max
- Mobile: 2000 particles max

### Budget Per Frame
- Bullet trails: ~30-50 particles
- Explosion: ~30 particles
- Impact: ~20 particles

### Monitor Active Particles
```typescript
console.log(`Active: ${particlePool.activeParticles}/${particlePool.particleCount}`);
```

## Debugging

### Check Particle System Health
```typescript
// In game loop
if (particlePool.activeParticles > particlePool.particleCount * 0.8) {
  console.warn('Particle system near capacity!');
}
```

### Verify Particle Updates
```typescript
// Add to render loop
console.log(`Particles: ${particlePool.activeParticles}`);
```

## Next Steps

1. **Expose Particle Pool** - Modify Game3DRenderer props to pass particle pool to GameCanvas
2. **Wire up Firing** - Connect bullet firing to createBulletTrail
3. **Damage Effects** - Add particle effects when damage dealt
4. **Death Effects** - Large explosion when enemies die
5. **Polish** - Fine-tune colors, speeds, sizes

## Summary

Particle system is ready to use! Just:
1. Expose particlePoolRef from Game3DRenderer
2. Call particle functions at appropriate game events
3. Test and adjust colors/intensity as needed
4. Monitor FPS to ensure performance stays good

See PHASE2_IMPLEMENTATION.md for technical details.
