export interface WeaponConfig {
  id: string;
  damage: number;
  fireRate: number;
  magSize: number;
  reloadMs: number;
  rangePx: number;
  bulletSpeed: number;
  spreadRad: number;
  pellets: number;
  infiniteReserve: boolean;
  droppable: boolean;
}

export const WEAPONS: Record<string, WeaponConfig> = {
  pistol:  { id: 'pistol',  damage: 18,  fireRate: 3,    magSize: 12, reloadMs: 1200, rangePx: 700,  bulletSpeed: 900,  spreadRad: 0.05, pellets: 1, infiniteReserve: true,  droppable: false },
  smg:     { id: 'smg',     damage: 10,  fireRate: 12,   magSize: 30, reloadMs: 1800, rangePx: 500,  bulletSpeed: 1000, spreadRad: 0.10, pellets: 1, infiniteReserve: false, droppable: true  },
  shotgun: { id: 'shotgun', damage: 8,   fireRate: 1.2,  magSize: 6,  reloadMs: 2000, rangePx: 280,  bulletSpeed: 850,  spreadRad: 0.30, pellets: 5, infiniteReserve: false, droppable: true  },
  sniper:  { id: 'sniper',  damage: 80,  fireRate: 0.8,  magSize: 4,  reloadMs: 2500, rangePx: 1500, bulletSpeed: 1600, spreadRad: 0.0,  pellets: 1, infiniteReserve: false, droppable: true  },
};

export function getWeapon(id: string): WeaponConfig {
  const w = WEAPONS[id];
  if (!w) throw new Error(`Unknown weapon: ${id}`);
  return w;
}
