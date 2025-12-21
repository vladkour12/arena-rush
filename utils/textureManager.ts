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
    this.createStoneTexture();
    this.createDirtTexture();
    this.createCrateTexture();
    this.createMetalPanelTexture();
    this.createPoliceTexture();
    this.createTerroristTexture();
    this.createZombieTexture();
    this.createCamouflageTexture();
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
    ctx.fillRect(0, 0, size, size);

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
   * Create a player texture (police uniform)
   */
  private createPlayerTexture(): void {
    const canvas = document.createElement('canvas');
    const size = this.isMobile ? 128 : 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Base police uniform blue
    ctx.fillStyle = '#1E3A8A';
    ctx.fillRect(0, 0, size, size);

    // Badge/insignia area (lighter blue)
    ctx.fillStyle = '#3B82F6';
    const badgeSize = size / 4;
    ctx.fillRect(size / 2 - badgeSize / 2, size / 4, badgeSize, badgeSize);

    // Buttons
    ctx.fillStyle = '#FFC107';
    const buttonSize = size / 16;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(size / 2, size / 2 + i * buttonSize * 2, buttonSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Stripes on shoulders
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(size / 8, size / 8 + i * 5);
      ctx.lineTo(size / 4, size / 8 + i * 5);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.textures.set('player', texture);
  }

  /**
   * Create a police uniform texture
   */
  private createPoliceTexture(): void {
    const canvas = document.createElement('canvas');
    const size = this.isMobile ? 128 : 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Dark blue police uniform
    ctx.fillStyle = '#1E3A8A';
    ctx.fillRect(0, 0, size, size);

    // Vest/armor panels
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(size / 8, size / 4, size * 3 / 4, size / 2);

    // POLICE text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${size / 8}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText('POLICE', size / 2, size / 2);

    // Badge
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(size / 2, size / 4, size / 12, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.textures.set('police', texture);
  }

  /**
   * Create a terrorist/combat gear texture
   */
  private createTerroristTexture(): void {
    const canvas = document.createElement('canvas');
    const size = this.isMobile ? 128 : 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Tactical gear base (dark colors)
    ctx.fillStyle = '#2A2A2A';
    ctx.fillRect(0, 0, size, size);

    // Camouflage pattern
    const camos = ['#3A3A3A', '#1A1A1A', '#4A4A4A'];
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = camos[Math.floor(Math.random() * camos.length)];
      const x = Math.random() * size;
      const y = Math.random() * size;
      const w = 10 + Math.random() * 20;
      const h = 10 + Math.random() * 20;
      ctx.fillRect(x, y, w, h);
    }

    // Tactical vest straps
    ctx.strokeStyle = '#5A5A5A';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(size / 4, 0);
    ctx.lineTo(size / 4, size);
    ctx.moveTo(size * 3 / 4, 0);
    ctx.lineTo(size * 3 / 4, size);
    ctx.stroke();

    // Pouches
    ctx.fillStyle = '#4A4A4A';
    ctx.fillRect(size / 6, size / 2, size / 6, size / 8);
    ctx.fillRect(size * 2 / 3, size / 2, size / 6, size / 8);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.textures.set('terrorist', texture);
  }

  /**
   * Create a zombie skin texture
   */
  private createZombieTexture(): void {
    const canvas = document.createElement('canvas');
    const size = this.isMobile ? 128 : 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Rotting green/gray skin
    ctx.fillStyle = '#556B2F';
    ctx.fillRect(0, 0, size, size);

    // Add decay spots
    ctx.fillStyle = '#3A4A2F';
    const spotCount = this.isMobile ? 15 : 30;
    for (let i = 0; i < spotCount; i++) {
      ctx.beginPath();
      ctx.arc(
        Math.random() * size,
        Math.random() * size,
        Math.random() * 15 + 5,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    // Blood stains
    ctx.fillStyle = 'rgba(139, 0, 0, 0.4)';
    for (let i = 0; i < 10; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.beginPath();
      ctx.arc(x, y, Math.random() * 10 + 3, 0, Math.PI * 2);
      ctx.fill();
      // Drip effect
      ctx.fillRect(x - 2, y, 4, Math.random() * 20);
    }

    // Torn clothing texture
    ctx.strokeStyle = '#2A2A2A';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.random() * size, Math.random() * size);
      ctx.lineTo(Math.random() * size, Math.random() * size);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.textures.set('zombie', texture);
  }

  /**
   * Create a camouflage texture
   */
  private createCamouflageTexture(): void {
    const canvas = document.createElement('canvas');
    const size = this.isMobile ? 128 : 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Woodland camouflage
    const camoColors = ['#5A6B3D', '#3D4A2B', '#4A5833', '#6B7A4F'];
    
    // Base color
    ctx.fillStyle = camoColors[0];
    ctx.fillRect(0, 0, size, size);

    // Random camo patches
    const patchCount = this.isMobile ? 25 : 50;
    for (let i = 0; i < patchCount; i++) {
      ctx.fillStyle = camoColors[Math.floor(Math.random() * camoColors.length)];
      ctx.beginPath();
      
      // Irregular shapes for camo
      const x = Math.random() * size;
      const y = Math.random() * size;
      const radius = 10 + Math.random() * 30;
      
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 3) {
        const px = x + Math.cos(angle) * radius * (0.5 + Math.random());
        const py = y + Math.sin(angle) * radius * (0.5 + Math.random());
        if (angle === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.closePath();
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.textures.set('camouflage', texture);
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
   * Create a stone texture
   */
  private createStoneTexture(): void {
    const canvas = document.createElement('canvas');
    const size = this.isMobile ? 128 : 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Base stone color
    ctx.fillStyle = '#696969';
    ctx.fillRect(0, 0, size, size);

    // Add noise and cracks
    const imageData = ctx.getImageData(0, 0, size, size);
    const noiseAmount = this.isMobile ? 25 : 40;
    for (let i = 0; i < imageData.data.length; i += 4) {
      const noise = (Math.random() - 0.5) * noiseAmount;
      imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise));
      imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + noise));
      imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + noise));
    }
    ctx.putImageData(imageData, 0, 0);

    // Add cracks
    ctx.strokeStyle = 'rgba(50, 50, 50, 0.5)';
    ctx.lineWidth = 1;
    const crackCount = this.isMobile ? 5 : 10;
    for (let i = 0; i < crackCount; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.random() * size, Math.random() * size);
      for (let j = 0; j < 5; j++) {
        ctx.lineTo(
          Math.random() * size,
          Math.random() * size
        );
      }
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.textures.set('stone', texture);
  }

  /**
   * Create a dirt texture
   */
  private createDirtTexture(): void {
    const canvas = document.createElement('canvas');
    const size = this.isMobile ? 128 : 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Base dirt color
    ctx.fillStyle = '#8B7355';
    ctx.fillRect(0, 0, size, size);

    // Add dirt particles
    const imageData = ctx.getImageData(0, 0, size, size);
    const noiseAmount = this.isMobile ? 30 : 50;
    for (let i = 0; i < imageData.data.length; i += 4) {
      const noise = (Math.random() - 0.5) * noiseAmount;
      imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise));
      imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + noise));
      imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + noise));
    }
    ctx.putImageData(imageData, 0, 0);

    // Add dirt clumps
    ctx.fillStyle = 'rgba(100, 80, 60, 0.3)';
    const clumpCount = this.isMobile ? 15 : 30;
    for (let i = 0; i < clumpCount; i++) {
      ctx.beginPath();
      ctx.arc(
        Math.random() * size,
        Math.random() * size,
        Math.random() * 10 + 3,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.textures.set('dirt', texture);
  }

  /**
   * Create a crate/wooden box texture
   */
  private createCrateTexture(): void {
    const canvas = document.createElement('canvas');
    const size = this.isMobile ? 128 : 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Base crate color (wooden)
    ctx.fillStyle = '#A0826D';
    ctx.fillRect(0, 0, size, size);

    // Wood planks
    const plankWidth = size / 4;
    ctx.strokeStyle = '#6B5B3D';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * plankWidth, 0);
      ctx.lineTo(i * plankWidth, size);
      ctx.stroke();
    }

    // Metal bands
    ctx.fillStyle = '#3A3A3A';
    const bandWidth = size / 20;
    ctx.fillRect(0, size / 3 - bandWidth / 2, size, bandWidth);
    ctx.fillRect(0, 2 * size / 3 - bandWidth / 2, size, bandWidth);

    // Metal highlights
    ctx.strokeStyle = 'rgba(200, 200, 200, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, size / 3 - bandWidth / 2 + 1);
    ctx.lineTo(size, size / 3 - bandWidth / 2 + 1);
    ctx.moveTo(0, 2 * size / 3 - bandWidth / 2 + 1);
    ctx.lineTo(size, 2 * size / 3 - bandWidth / 2 + 1);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.textures.set('crate', texture);
  }

  /**
   * Create a metal panel texture
   */
  private createMetalPanelTexture(): void {
    const canvas = document.createElement('canvas');
    const size = this.isMobile ? 128 : 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Base metal panel color
    ctx.fillStyle = '#5A5A5A';
    ctx.fillRect(0, 0, size, size);

    // Panel lines
    ctx.strokeStyle = '#3A3A3A';
    ctx.lineWidth = 2;
    const panelSize = size / 3;
    for (let i = 0; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(i * panelSize, 0);
      ctx.lineTo(i * panelSize, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * panelSize);
      ctx.lineTo(size, i * panelSize);
      ctx.stroke();
    }

    // Rivets
    ctx.fillStyle = '#2A2A2A';
    const rivetSize = this.isMobile ? 3 : 4;
    for (let i = 0; i <= 3; i++) {
      for (let j = 0; j <= 3; j++) {
        ctx.beginPath();
        ctx.arc(i * panelSize, j * panelSize, rivetSize, 0, Math.PI * 2);
        ctx.fill();
        // Rivet highlight
        ctx.fillStyle = 'rgba(200, 200, 200, 0.3)';
        ctx.beginPath();
        ctx.arc(i * panelSize - 1, j * panelSize - 1, rivetSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2A2A2A';
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.textures.set('metalPanel', texture);
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

