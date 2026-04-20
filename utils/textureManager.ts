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
   * Create a futuristic brick wall texture with neon styling
   */
  private createBrickTexture(): void {
    const canvas = document.createElement('canvas');
    const size = this.isMobile ? 128 : 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Dark futuristic base with cyan tint
    ctx.fillStyle = '#0A1628';
    ctx.fillRect(0, 0, size, size);

    // Draw brick pattern with neon accents
    const scale = this.isMobile ? 0.5 : 1;
    const brickWidth = 64 * scale;
    const brickHeight = 32 * scale;
    const mortarWidth = 2 * scale;

    // Dark gray bricks
    ctx.fillStyle = '#1A2840';
    for (let y = 0; y < size; y += brickHeight + mortarWidth) {
      const offset = (y / (brickHeight + mortarWidth)) % 2 === 0 ? 0 : brickWidth / 2;
      for (let x = -brickWidth; x < size + brickWidth; x += brickWidth + mortarWidth) {
        ctx.fillRect(x + offset, y, brickWidth, brickHeight);
      }
    }

    // Neon cyan mortar lines
    ctx.strokeStyle = '#00FFFF';
    ctx.lineWidth = mortarWidth;
    ctx.shadowColor = '#00FFFF';
    ctx.shadowBlur = 3;
    for (let y = 0; y <= size; y += brickHeight + mortarWidth) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    this.textures.set('brick', texture);
  }

  /**
   * Create a futuristic concrete texture with metallic finish
   */
  private createConcreteTexture(): void {
    const canvas = document.createElement('canvas');
    const size = this.isMobile ? 128 : 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Dark metallic base
    ctx.fillStyle = '#1A1F2E';
    ctx.fillRect(0, 0, size, size);

    // Add circuit-like pattern for futuristic look
    ctx.strokeStyle = '#00FF88';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < 5; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const size2 = 20 + Math.random() * 30;
      ctx.strokeRect(x, y, size2, size2);
    }
    ctx.globalAlpha = 1;

    // Add noise for texture depth
    const imageData = ctx.getImageData(0, 0, size, size);
    const noiseAmount = this.isMobile ? 15 : 25;
    for (let i = 0; i < imageData.data.length; i += 4) {
      const noise = (Math.random() - 0.5) * noiseAmount;
      imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise));
      imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + noise));
      imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + noise));
    }
    ctx.putImageData(imageData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    this.textures.set('concrete', texture);
  }

  /**
   * Create a futuristic metal texture with neon highlights
   */
  private createMetalTexture(): void {
    const canvas = document.createElement('canvas');
    const size = this.isMobile ? 128 : 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Dark metallic base
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#0F1620');
    gradient.addColorStop(0.5, '#1A2635');
    gradient.addColorStop(1, '#0A0E18');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // Add neon blue/cyan metallic highlights
    const highlightCount = this.isMobile ? 15 : 30;
    for (let i = 0; i < highlightCount; i++) {
      ctx.strokeStyle = `rgba(0, 255, 255, ${0.15 + Math.random() * 0.25})`;
      ctx.lineWidth = 1 + Math.random();
      ctx.beginPath();
      ctx.moveTo(Math.random() * size, Math.random() * size);
      ctx.lineTo(Math.random() * size, Math.random() * size);
      ctx.stroke();
    }

    // Add small neon accent dots
    ctx.fillStyle = '#00FFFF';
    for (let i = 0; i < 5; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.textures.set('metal', texture);
  }

  /**
   * Create a futuristic neon grass texture
   */
  private createGrassTexture(): void {
    const canvas = document.createElement('canvas');
    const size = this.isMobile ? 128 : 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Dark base with neon green
    ctx.fillStyle = '#0A1A0A';
    ctx.fillRect(0, 0, size, size);

    // Add bioluminescent grass blades
    ctx.strokeStyle = '#00FF55';
    ctx.lineWidth = 1;
    const bladeCount = this.isMobile ? 100 : 300;
    for (let i = 0; i < bladeCount; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const length = 5 + Math.random() * 12;
      ctx.globalAlpha = 0.4 + Math.random() * 0.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 3, y - length);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(10, 10);
    this.textures.set('grass', texture);
  }

  /**
   * Create a futuristic carbon fiber texture
   */
  private createWoodTexture(): void {
    const canvas = document.createElement('canvas');
    const size = this.isMobile ? 128 : 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Dark carbon fiber base
    ctx.fillStyle = '#0D0D0D';
    ctx.fillRect(0, 0, size, size);

    // Weave pattern with neon accent
    const step = this.isMobile ? 4 : 2;
    for (let y = 0; y < size; y += step) {
      const variation = Math.sin(y / 15) * 5;
      ctx.strokeStyle = `rgba(0, 255, 200, ${0.1 + Math.random() * 0.15})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + variation);
      ctx.lineTo(size, y + variation);
      ctx.stroke();
    }

    // Add diagonal carbon weave
    for (let x = 0; x < size; x += step * 2) {
      ctx.strokeStyle = `rgba(0, 200, 255, ${0.08 + Math.random() * 0.12})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + size, size);
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
   * Create a futuristic glowing weapon texture
   */
  private createWeaponTexture(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // Base weapon color (dark matte metal)
    ctx.fillStyle = '#0A0E18';
    ctx.fillRect(0, 0, 128, 128);

    // Futuristic energy lines
    ctx.strokeStyle = '#00FFFF';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(10, 64);
    ctx.lineTo(118, 64);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Metallic highlights with neon
    const gradient = ctx.createLinearGradient(0, 0, 128, 128);
    gradient.addColorStop(0, 'rgba(0, 255, 255, 0.25)');
    gradient.addColorStop(0.5, 'rgba(0, 200, 255, 0.1)');
    gradient.addColorStop(1, 'rgba(0, 100, 150, 0.15)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    // Energy core
    ctx.fillStyle = '#00FF88';
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(64, 64, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    const texture = new THREE.CanvasTexture(canvas);
    this.textures.set('weapon', texture);
  }

  /**
   * Create a futuristic glowing loot texture
   */
  private createLootTexture(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // Base loot color (neon magenta/cyan crystal)
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, '#FF00FF');
    gradient.addColorStop(0.5, '#00FFFF');
    gradient.addColorStop(1, '#0A0020');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    // Add bright glowing shine effect
    ctx.fillStyle = 'rgba(255, 100, 255, 0.8)';
    ctx.beginPath();
    ctx.arc(40, 40, 25, 0, Math.PI * 2);
    ctx.fill();

    // Cyan glow overlay
    ctx.fillStyle = 'rgba(0, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.arc(88, 88, 20, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    this.textures.set('loot', texture);
  }

  /**
   * Create a futuristic crystal stone texture
   */
  private createStoneTexture(): void {
    const canvas = document.createElement('canvas');
    const size = this.isMobile ? 128 : 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Dark futuristic stone base
    ctx.fillStyle = '#1A1A24';
    ctx.fillRect(0, 0, size, size);

    // Add crystalline pattern
    ctx.strokeStyle = '#00FF99';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 15; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const size2 = 20 + Math.random() * 40;
      ctx.strokeRect(x, y, size2, size2);
    }
    ctx.globalAlpha = 1;

    // Add noise and cracks with neon accents
    const imageData = ctx.getImageData(0, 0, size, size);
    const noiseAmount = this.isMobile ? 20 : 30;
    for (let i = 0; i < imageData.data.length; i += 4) {
      const noise = (Math.random() - 0.5) * noiseAmount;
      imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise));
      imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + noise + 20));
      imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + noise + 40));
    }
    ctx.putImageData(imageData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.textures.set('stone', texture);
  }

  /**
   * Create a futuristic alien dirt/terrain texture
   */
  private createDirtTexture(): void {
    const canvas = document.createElement('canvas');
    const size = this.isMobile ? 128 : 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Alien terrain base - dark with neon accents
    ctx.fillStyle = '#1A1A2E';
    ctx.fillRect(0, 0, size, size);

    // Add bioluminescent particles
    const imageData = ctx.getImageData(0, 0, size, size);
    const noiseAmount = this.isMobile ? 25 : 40;
    for (let i = 0; i < imageData.data.length; i += 4) {
      const noise = (Math.random() - 0.5) * noiseAmount;
      imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise));
      imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + noise + 30));
      imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + noise + 50));
    }
    ctx.putImageData(imageData, 0, 0);

    // Add glowing energy deposits
    ctx.fillStyle = 'rgba(0, 255, 150, 0.5)';
    const clumpCount = this.isMobile ? 10 : 20;
    for (let i = 0; i < clumpCount; i++) {
      ctx.beginPath();
      ctx.arc(
        Math.random() * size,
        Math.random() * size,
        Math.random() * 12 + 4,
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
   * Create a futuristic tech crate texture
   */
  private createCrateTexture(): void {
    const canvas = document.createElement('canvas');
    const size = this.isMobile ? 128 : 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Dark futuristic crate base
    ctx.fillStyle = '#0D0D15';
    ctx.fillRect(0, 0, size, size);

    // Tech panel lines with neon glow
    const plankWidth = size / 4;
    ctx.strokeStyle = '#00FFFF';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * plankWidth, 0);
      ctx.lineTo(i * plankWidth, size);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Energy bands (cyan/magenta)
    ctx.fillStyle = '#00FF88';
    const bandWidth = size / 20;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(0, size / 3 - bandWidth / 2, size, bandWidth);
    ctx.fillStyle = '#FF00FF';
    ctx.fillRect(0, 2 * size / 3 - bandWidth / 2, size, bandWidth);
    ctx.globalAlpha = 1;

    // Tech details
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, size / 3 - bandWidth / 2 + 2);
    ctx.lineTo(size, size / 3 - bandWidth / 2 + 2);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.textures.set('crate', texture);
  }

  /**
   * Create a futuristic tech panel texture
   */
  private createMetalPanelTexture(): void {
    const canvas = document.createElement('canvas');
    const size = this.isMobile ? 128 : 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Dark futuristic panel
    ctx.fillStyle = '#0F1520';
    ctx.fillRect(0, 0, size, size);

    // Tech panel grid with neon
    ctx.strokeStyle = '#00FFFF';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
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
    ctx.globalAlpha = 1;

    // Neon rivets with glow
    ctx.fillStyle = '#00FF88';
    const rivetSize = this.isMobile ? 2 : 3;
    for (let i = 0; i <= 3; i++) {
      for (let j = 0; j <= 3; j++) {
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(i * panelSize, j * panelSize, rivetSize, 0, Math.PI * 2);
        ctx.fill();
        // Glow effect
        ctx.fillStyle = 'rgba(0, 255, 136, 0.3)';
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(i * panelSize, j * panelSize, rivetSize * 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#00FF88';
        ctx.globalAlpha = 1;
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

