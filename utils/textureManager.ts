import * as THREE from 'three';

/**
 * Texture Manager for loading and managing 3D textures
 * Creates procedural textures for game elements
 * Optimized for mobile devices (Android & iOS)
 */
export class TextureManager {
  private textures: Map<string, THREE.Texture> = new Map();
  private loader: THREE.TextureLoader;
  private isMobile: boolean;

  constructor() {
    this.loader = new THREE.TextureLoader();
    // Detect mobile device for texture optimization
    this.isMobile = typeof window !== 'undefined' && 
      ('ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0)) &&
      window.innerWidth < 768;
    this.initializeTextures();
  }

  /**
   * Initialize all game textures
   */
  private initializeTextures(): void {
    // Create procedural textures for various game elements
    // Use smaller textures on mobile for better performance
    this.createBrickTexture();
    this.createConcreteTexture();
    this.createMetalTexture();
    this.createGrassTexture();
    this.createWoodTexture();
    this.createPlayerTexture();
    this.createWeaponTexture();
    this.createLootTexture();
  }

  /**
   * Create a brick wall texture
   */
  private createBrickTexture(): void {
    const canvas = document.createElement('canvas');
    const size = this.isMobile ? 128 : 256; // Smaller on mobile
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Base brick color
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(0, 0, 256, 256);

    // Draw brick pattern (scaled for mobile)
    const scale = this.isMobile ? 0.5 : 1;
    const brickWidth = 64 * scale;
    const brickHeight = 32 * scale;
    const mortarWidth = 4 * scale;

    ctx.fillStyle = '#654321';
    for (let y = 0; y < size; y += brickHeight + mortarWidth) {
      const offset = (y / (brickHeight + mortarWidth)) % 2 === 0 ? 0 : brickWidth / 2;
      for (let x = -brickWidth; x < size + brickWidth; x += brickWidth + mortarWidth) {
        ctx.fillRect(x + offset, y, brickWidth, brickHeight);
      }
    }

    // Mortar lines
    ctx.strokeStyle = '#5C4033';
    ctx.lineWidth = mortarWidth;
    for (let y = 0; y <= size; y += brickHeight + mortarWidth) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    this.textures.set('brick', texture);
  }

  /**
   * Create a concrete texture
   */
  private createConcreteTexture(): void {
    const canvas = document.createElement('canvas');
    const size = this.isMobile ? 128 : 256; // Smaller on mobile
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Base concrete color
    ctx.fillStyle = '#7A7A7A';
    ctx.fillRect(0, 0, size, size);

    // Add noise for texture (less noise on mobile for performance)
    const imageData = ctx.getImageData(0, 0, size, size);
    const noiseAmount = this.isMobile ? 20 : 30; // Less noise on mobile
    for (let i = 0; i < imageData.data.length; i += 4) {
      const noise = (Math.random() - 0.5) * noiseAmount;
      imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise)); // R
      imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + noise)); // G
      imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + noise)); // B
    }
    ctx.putImageData(imageData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    this.textures.set('concrete', texture);
  }

  /**
   * Create a metal texture
   */
  private createMetalTexture(): void {
    const canvas = document.createElement('canvas');
    const size = this.isMobile ? 128 : 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Base metal color
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#4A4A4A');
    gradient.addColorStop(0.5, '#6A6A6A');
    gradient.addColorStop(1, '#3A3A3A');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // Add metallic highlights (fewer on mobile)
    const highlightCount = this.isMobile ? 10 : 20;
    for (let i = 0; i < highlightCount; i++) {
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 + Math.random() * 0.2})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.random() * size, Math.random() * size);
      ctx.lineTo(Math.random() * size, Math.random() * size);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.textures.set('metal', texture);
  }

  /**
   * Create a grass texture
   */
  private createGrassTexture(): void {
    const canvas = document.createElement('canvas');
    const size = this.isMobile ? 128 : 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Base grass color
    ctx.fillStyle = '#2D5016';
    ctx.fillRect(0, 0, size, size);

    // Add grass blades (fewer on mobile for performance)
    ctx.strokeStyle = '#3A6B1F';
    ctx.lineWidth = 1;
    const bladeCount = this.isMobile ? 150 : 500; // Much fewer on mobile
    for (let i = 0; i < bladeCount; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const length = 5 + Math.random() * 10;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 2, y - length);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(10, 10);
    this.textures.set('grass', texture);
  }

  /**
   * Create a wood texture
   */
  private createWoodTexture(): void {
    const canvas = document.createElement('canvas');
    const size = this.isMobile ? 128 : 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Base wood color
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(0, 0, size, size);

    // Wood grain (fewer lines on mobile)
    const step = this.isMobile ? 2 : 1; // Skip every other line on mobile
    for (let y = 0; y < size; y += step) {
      const variation = Math.sin(y / 10) * 10;
      ctx.strokeStyle = `rgba(${139 + variation}, ${105 + variation}, ${20 + variation}, 0.5)`;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.textures.set('wood', texture);
  }

  /**
   * Create a player texture
   */
  private createPlayerTexture(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // Base player color
    ctx.fillStyle = '#4169E1';
    ctx.fillRect(0, 0, 128, 128);

    // Add details
    ctx.fillStyle = '#1E3A8A';
    ctx.fillRect(20, 20, 88, 88);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(40, 40, 48, 48);

    const texture = new THREE.CanvasTexture(canvas);
    this.textures.set('player', texture);
  }

  /**
   * Create a weapon texture
   */
  private createWeaponTexture(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // Base weapon color (dark metal)
    ctx.fillStyle = '#1A1A1A';
    ctx.fillRect(0, 0, 128, 128);

    // Metallic highlights
    const gradient = ctx.createLinearGradient(0, 0, 128, 128);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    const texture = new THREE.CanvasTexture(canvas);
    this.textures.set('weapon', texture);
  }

  /**
   * Create a loot texture
   */
  private createLootTexture(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // Base loot color (gold)
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, '#FFD700');
    gradient.addColorStop(1, '#B8860B');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    // Add shine
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.arc(40, 40, 20, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    this.textures.set('loot', texture);
  }

  /**
   * Get a texture by name
   */
  getTexture(name: string): THREE.Texture | null {
    return this.textures.get(name) || null;
  }

  /**
   * Create a material with a texture
   * Uses MeshBasicMaterial for better performance (no lighting calculations)
   */
  createMaterial(textureName: string, options?: {
    color?: string;
    emissive?: string;
    roughness?: number;
    metalness?: number;
  }): THREE.MeshBasicMaterial {
    const texture = this.getTexture(textureName);
    // Use MeshBasicMaterial instead of MeshStandardMaterial for better performance
    // It doesn't calculate lighting, making it much faster
    const material = new THREE.MeshBasicMaterial({
      map: texture || undefined,
      color: options?.color || 0xffffff,
    });

    if (texture) {
      texture.needsUpdate = true;
    }

    return material;
  }

  /**
   * Dispose of all textures
   */
  dispose(): void {
    this.textures.forEach(texture => texture.dispose());
    this.textures.clear();
  }
}

// Singleton instance
let textureManagerInstance: TextureManager | null = null;

export function getTextureManager(): TextureManager {
  if (!textureManagerInstance) {
    textureManagerInstance = new TextureManager();
  }
  return textureManagerInstance;
}

