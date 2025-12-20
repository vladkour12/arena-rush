import * as THREE from 'three';

export interface ParticleOptions {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color?: THREE.Color;
  size?: number;
  lifetime?: number; // milliseconds
  decay?: number; // 0-1, how fast particles fade
}

export interface ParticlePool {
  positions: Float32Array;
  velocities: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  lifetimes: Float32Array;
  maxAlpha: Float32Array;
  geometry: THREE.BufferGeometry;
  material: THREE.PointsMaterial;
  mesh: THREE.Points;
  particleCount: number;
  activeParticles: number;
}

const PARTICLE_POOL_SIZE = 5000; // Max particles at once
const DEFAULT_LIFETIME = 1000; // ms
const DEFAULT_DECAY = 0.98;
const DEFAULT_SIZE = 2;

/**
 * Create a GPU-accelerated particle system using Three.js
 */
export function createParticlePool(maxParticles: number = PARTICLE_POOL_SIZE): ParticlePool {
  const geometry = new THREE.BufferGeometry();

  // Initialize arrays
  const positions = new Float32Array(maxParticles * 3);
  const velocities = new Float32Array(maxParticles * 3);
  const colors = new Float32Array(maxParticles * 3);
  const sizes = new Float32Array(maxParticles);
  const lifetimes = new Float32Array(maxParticles); // Age in ms
  const maxAlpha = new Float32Array(maxParticles); // Max alpha for each particle

  // Set default values
  for (let i = 0; i < maxParticles; i++) {
    sizes[i] = DEFAULT_SIZE;
    lifetimes[i] = -1; // -1 means inactive
    maxAlpha[i] = 1;
  }

  // Add attributes to geometry
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('lifetime', new THREE.BufferAttribute(lifetimes, 1));
  geometry.setAttribute('maxAlpha', new THREE.BufferAttribute(maxAlpha, 1));

  // Custom shader material for particles
  const material = new THREE.PointsMaterial({
    sizeAttenuation: true,
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    size: DEFAULT_SIZE,
    opacity: 0.8,
    blending: THREE.AdditiveBlending // Nice glow effect
  });

  const mesh = new THREE.Points(geometry, material);

  return {
    positions,
    velocities,
    colors,
    sizes,
    lifetimes,
    maxAlpha,
    geometry,
    material,
    mesh,
    particleCount: maxParticles,
    activeParticles: 0
  };
}

/**
 * Emit particles from a position
 */
export function emitParticles(
  pool: ParticlePool,
  count: number,
  options: ParticleOptions
): void {
  const { position, velocity, color = new THREE.Color(0xffffff), size = DEFAULT_SIZE, lifetime = DEFAULT_LIFETIME } = options;

  // Find inactive particle slots
  let emitted = 0;
  for (let i = 0; i < pool.particleCount && emitted < count; i++) {
    if (pool.lifetimes[i] < 0) {
      const idx = i * 3;

      // Set position with small random offset for spread
      const spread = 2;
      pool.positions[idx] = position.x + (Math.random() - 0.5) * spread;
      pool.positions[idx + 1] = position.y + (Math.random() - 0.5) * spread;
      pool.positions[idx + 2] = position.z + (Math.random() - 0.5) * spread;

      // Set velocity with small random variation
      const velVariation = 50;
      pool.velocities[idx] = velocity.x + (Math.random() - 0.5) * velVariation;
      pool.velocities[idx + 1] = velocity.y + (Math.random() - 0.5) * velVariation;
      pool.velocities[idx + 2] = velocity.z + (Math.random() - 0.5) * velVariation;

      // Set color
      pool.colors[idx] = color.r;
      pool.colors[idx + 1] = color.g;
      pool.colors[idx + 2] = color.b;

      // Set size
      pool.sizes[i] = size;

      // Initialize lifetime (0 = just created)
      pool.lifetimes[i] = 0;
      pool.maxAlpha[i] = 1;

      pool.activeParticles++;
      emitted++;
    }
  }

  // Mark attributes as needing update
  pool.geometry.attributes.position.needsUpdate = true;
  pool.geometry.attributes.velocity.needsUpdate = true;
  pool.geometry.attributes.color.needsUpdate = true;
  pool.geometry.attributes.lifetime.needsUpdate = true;
}

/**
 * Update particle system (called each frame)
 */
export function updateParticles(pool: ParticlePool, deltaTime: number): void {
  const dt = deltaTime / 1000; // Convert to seconds
  let activeCount = 0;

  for (let i = 0; i < pool.particleCount; i++) {
    if (pool.lifetimes[i] >= 0) {
      const idx = i * 3;

      // Update lifetime
      pool.lifetimes[i] += deltaTime;

      // Check if particle should die
      if (pool.lifetimes[i] >= 1000) { // 1 second max
        pool.lifetimes[i] = -1; // Mark as inactive
        continue;
      }

      // Apply gravity
      pool.velocities[idx + 1] -= 300 * dt; // Gravity downward

      // Update position based on velocity
      pool.positions[idx] += pool.velocities[idx] * dt;
      pool.positions[idx + 1] += pool.velocities[idx + 1] * dt;
      pool.positions[idx + 2] += pool.velocities[idx + 2] * dt;

      // Apply velocity decay (drag)
      const decayFactor = DEFAULT_DECAY;
      pool.velocities[idx] *= decayFactor;
      pool.velocities[idx + 1] *= decayFactor;
      pool.velocities[idx + 2] *= decayFactor;

      activeCount++;
    }
  }

  pool.activeParticles = activeCount;

  // Mark attributes as needing update
  pool.geometry.attributes.position.needsUpdate = true;
  pool.geometry.attributes.velocity.needsUpdate = true;
  pool.geometry.attributes.lifetime.needsUpdate = true;

  // Only render active particles
  pool.geometry.setDrawRange(0, activeCount);
}

/**
 * Create bullet trail particles
 */
export function createBulletTrail(
  pool: ParticlePool,
  from: THREE.Vector3,
  to: THREE.Vector3,
  color: THREE.Color = new THREE.Color(0xffff00)
): void {
  const direction = new THREE.Vector3().subVectors(to, from).normalize();
  const distance = from.distanceTo(to);

  // Spawn particles along the bullet path
  const particlesPerUnit = 0.5;
  const particleCount = Math.floor(distance * particlesPerUnit);

  for (let i = 0; i < particleCount; i++) {
    const t = i / particleCount;
    const pos = new THREE.Vector3().lerpVectors(from, to, t);

    // Velocity outward from path
    const spreadDir = new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2
    ).normalize();

    emitParticles(pool, 1, {
      position: pos,
      velocity: spreadDir.multiplyScalar(200),
      color,
      size: 1.5,
      lifetime: 300
    });
  }
}

/**
 * Create explosion particles
 */
export function createExplosion(
  pool: ParticlePool,
  center: THREE.Vector3,
  color: THREE.Color = new THREE.Color(0xff6600),
  intensity: number = 1
): void {
  const particleCount = Math.floor(30 * intensity);

  for (let i = 0; i < particleCount; i++) {
    // Random direction
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    const r = 200 + Math.random() * 100;

    const velocity = new THREE.Vector3(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi)
    );

    emitParticles(pool, 1, {
      position: center.clone(),
      velocity,
      color: color.clone(),
      size: 2 + Math.random() * 2,
      lifetime: 500
    });
  }
}

/**
 * Create damage number particles (text-based)
 */
export function createDamageNumber(
  scene: THREE.Scene,
  position: THREE.Vector3,
  damage: number,
  isCritical: boolean = false
): void {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;

  const ctx = canvas.getContext('2d')!;
  ctx.font = isCritical ? 'bold 48px Arial' : '32px Arial';
  ctx.fillStyle = isCritical ? '#ff0000' : '#ffff00';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(damage.toString(), 32, 32);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false
  });

  const geometry = new THREE.PlaneGeometry(50, 50);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);

  scene.add(mesh);

  // Animate upward and fade out
  let age = 0;
  const duration = 1000;
  const updateDamageNumber = () => {
    age += 16;
    if (age >= duration) {
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
      return;
    }

    const progress = age / duration;
    mesh.position.y += 1;
    (material as THREE.MeshBasicMaterial).opacity = 1 - progress;

    requestAnimationFrame(updateDamageNumber);
  };

  updateDamageNumber();
}

/**
 * Dispose particle system
 */
export function disposeParticlePool(pool: ParticlePool): void {
  pool.geometry.dispose();
  pool.material.dispose();
}
