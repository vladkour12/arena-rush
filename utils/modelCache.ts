import * as THREE from 'three';

// Global model cache to share loaded models across components
let cachedPlayerModel: THREE.Group | null = null;
let cachedBotModel: THREE.Group | null = null;
let cachedPlayerAnimations: THREE.AnimationClip[] | null = null;
let cachedBotAnimations: THREE.AnimationClip[] | null = null;
let playerLoadingPromise: Promise<THREE.Group | null> | null = null;
let botLoadingPromise: Promise<THREE.Group | null> | null = null;

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
