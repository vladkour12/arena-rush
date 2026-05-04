import * as Phaser from 'phaser';
import { TILE_SIZE, MAP_COLS, MAP_ROWS } from '../config/map';
import { computeEdgeBitmask, edgeBitmaskToFrame } from './cliffBitmask';

export interface TerrainCell {
  level: number;
  walkable: boolean;
  buildable: boolean;
  stair: boolean;
  water: boolean;
  bridge: boolean;
  tileKind: 'water' | 'flat' | 'sand' | 'elevated' | 'summit' | 'stair' | 'cave' | 'beach' | 'bridge';
}

export interface TilemapLayers {
  map: Phaser.Tilemaps.Tilemap;
  groundLayer: Phaser.Tilemaps.TilemapLayer;
  cliffLayer:  Phaser.Tilemaps.TilemapLayer;
  pathLayer:   Phaser.Tilemaps.TilemapLayer;
}

const GROUND_TILE_KIND_TO_FRAME: Record<TerrainCell['tileKind'], number> = {
  water:    0,
  beach:    1,
  sand:     1,
  flat:     2,
  elevated: 2,
  summit:   2,
  stair:    2,
  cave:     2,
  bridge:   3,
};

const STAIR_FRAME_BASE = 32;

export function buildTilemap(
  scene: Phaser.Scene,
  terrainGrid: TerrainCell[][],
): TilemapLayers {
  const map = scene.make.tilemap({
    width: MAP_COLS,
    height: MAP_ROWS,
    tileWidth: TILE_SIZE,
    tileHeight: TILE_SIZE,
  });

  const flatSet = map.addTilesetImage('flat', 'tilemap_flat', TILE_SIZE, TILE_SIZE);
  const elevSet = map.addTilesetImage('elev', 'tilemap_elev', TILE_SIZE, TILE_SIZE);
  if (!flatSet || !elevSet) throw new Error('Tileset missing — run preload first');

  const groundLayer = map.createBlankLayer('ground', flatSet)!;
  const cliffLayer  = map.createBlankLayer('cliff', elevSet)!;
  const pathLayer   = map.createBlankLayer('path',  flatSet)!;

  groundLayer.setDepth(0);
  cliffLayer.setDepth(5);
  pathLayer.setDepth(10);

  const levelAt = (tx: number, ty: number): number => {
    if (tx < 0 || ty < 0 || tx >= MAP_COLS || ty >= MAP_ROWS) return 0;
    return terrainGrid[ty][tx].level;
  };

  for (let ty = 0; ty < MAP_ROWS; ty++) {
    for (let tx = 0; tx < MAP_COLS; tx++) {
      const cell = terrainGrid[ty][tx];

      groundLayer.putTileAt(GROUND_TILE_KIND_TO_FRAME[cell.tileKind], tx, ty);

      if (cell.level >= 1 && !cell.stair) {
        const mask = computeEdgeBitmask(tx, ty, cell.level, levelAt);
        if (mask !== 0) {
          cliffLayer.putTileAt(edgeBitmaskToFrame[mask], tx, ty);
        }
      }

      if (cell.stair) {
        const dir = stairFacing(tx, ty, terrainGrid);
        cliffLayer.putTileAt(STAIR_FRAME_BASE + dir, tx, ty);
      }
    }
  }

  return { map, groundLayer, cliffLayer, pathLayer };
}

function stairFacing(tx: number, ty: number, grid: TerrainCell[][]): number {
  const here = grid[ty][tx].level;
  const sample = (dx: number, dy: number): number => {
    const nx = tx + dx, ny = ty + dy;
    if (ny < 0 || ny >= MAP_ROWS || nx < 0 || nx >= MAP_COLS) return 0;
    return grid[ny][nx].level;
  };
  if (sample(0, -1) < here) return 0;
  if (sample(1,  0) < here) return 1;
  if (sample(0,  1) < here) return 2;
  return 3;
}

export function clearTilemap(layers: TilemapLayers): void {
  layers.groundLayer.destroy();
  layers.cliffLayer.destroy();
  layers.pathLayer.destroy();
  layers.map.destroy();
}
