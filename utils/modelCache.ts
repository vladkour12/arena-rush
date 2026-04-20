import * as THREE from 'three';
import { WeaponType } from '../types';

// Global model cache to share loaded models across components
let cachedPlayerModel: THREE.Group | null = null;
let cachedBotModel: THREE.Group | null = null;
let cachedPlayerAnimations: THREE.AnimationClip[] | null = null;
let cachedBotAnimations: THREE.AnimationClip[] | null = null;
let playerLoadingPromise: Promise<THREE.Group | null> | null = null;
let botLoadingPromise: Promise<THREE.Group | null> | null = null;

// Gun model cache
const gunModelCache = new Map<WeaponType, THREE.Group | null>();
const gunLoadingPromises = new Map<WeaponType, Promise<THREE.Group | null>>();

// Gun model file paths mapping
const gunModelMap: Record<WeaponType, string> = {
  [WeaponType.Pistol]: '/models/Meshy_AI_Rustic_Handgun_1221221621_texture.glb',
  [WeaponType.Shotgun]: '/models/Meshy_AI_Bladed_Boomstick_1221221709_texture.glb',
  [WeaponType.SMG]: '/models/Meshy_AI_Steampunk_Blaster_1221221640_texture.glb',
  [WeaponType.AK47]: '/models/Meshy_AI_Steampunk_Blaster_1221221645_texture.glb',
  [WeaponType.Sniper]: '/models/Meshy_AI_Steampunk_Cannon__1221221652_texture.glb',
  [WeaponType.Rocket]: '/models/Meshy_AI_Steampunk_Cannon__1221221652_texture.glb',
  [WeaponType.Minigun]: '/models/Meshy_AI_Steampunk_Minigun_Rep_1221221632_texture.glb',
  [WeaponType.BurstRifle]: '/models/Meshy_AI_Steampunk_Blaster_1221221645_texture.glb',
  [WeaponType.Laser]: '/models/Meshy_AI_Steampunk_Blaster_1221221640_texture.glb',
  [WeaponType.Knife]: '/models/Meshy_AI_Bladed_Boomstick_1221221709_texture.glb',
};

export function getCachedPlayerModel(): THREE.Group | null {
  return cachedPlayerModel;
}

export function setCachedPlayerModel(model: THREE.Group | null): void {
  cachedPlayerModel = model;
}

export function getCachedPlayerAnimations(): THREE.AnimationClip[] | null {
  return cachedPlayerAnimations;
}

export function setCachedPlayerAnimations(anims: THREE.AnimationClip[] | null): void {
  cachedPlayerAnimations = anims;
}

export function getCachedBotModel(): THREE.Group | null {
  return cachedBotModel;
}

export function setCachedBotModel(model: THREE.Group | null): void {
  cachedBotModel = model;
}

export function getCachedBotAnimations(): THREE.AnimationClip[] | null {
  return cachedBotAnimations;
}

export function setCachedBotAnimations(anims: THREE.AnimationClip[] | null): void {
  cachedBotAnimations = anims;
}

export function getPlayerLoadingPromise(): Promise<THREE.Group | null> | null {
  return playerLoadingPromise;
}

export function setPlayerLoadingPromise(promise: Promise<THREE.Group | null> | null): void {
  playerLoadingPromise = promise;
}

export function getBotLoadingPromise(): Promise<THREE.Group | null> | null {
  return botLoadingPromise;
}

export function setBotLoadingPromise(promise: Promise<THREE.Group | null> | null): void {
  botLoadingPromise = promise;
}

// Gun model cache functions
export function getCachedGunModel(weapon: WeaponType): THREE.Group | null {
  return gunModelCache.get(weapon) ?? null;
}

export function setCachedGunModel(weapon: WeaponType, model: THREE.Group | null): void {
  gunModelCache.set(weapon, model);
}

export function getGunLoadingPromise(weapon: WeaponType): Promise<THREE.Group | null> {
  if (!gunLoadingPromises.has(weapon)) {
    gunLoadingPromises.set(weapon, Promise.resolve(null));
  }
  return gunLoadingPromises.get(weapon)!;
}

export function setGunLoadingPromise(weapon: WeaponType, promise: Promise<THREE.Group | null>): void {
  gunLoadingPromises.set(weapon, promise);
}

export function getGunModelPath(weapon: WeaponType): string {
  return gunModelMap[weapon] ?? '/models/Meshy_AI_Rustic_Handgun_1221221621_texture.glb';
}

export function getAllGunWeaponTypes(): WeaponType[] {
  return Object.keys(gunModelMap) as WeaponType[];
}
