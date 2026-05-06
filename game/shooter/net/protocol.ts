export const MSG = {
  INPUT: 'INPUT',
  JOIN_MATCH: 'JOIN_MATCH',
  LEAVE_MATCH: 'LEAVE_MATCH',
  REMATCH_REQUEST: 'REMATCH_REQUEST',
  SNAP: 'SNAP',
  KILL: 'KILL',
  PICKUP: 'PICKUP',
  MATCH_START: 'MATCH_START',
  MATCH_END: 'MATCH_END',
  RESPAWN: 'RESPAWN',
} as const;

export type MsgType = typeof MSG[keyof typeof MSG];

export interface InputMsg {
  t: 'INPUT';
  seq: number;
  mv: { x: number; y: number };
  aim: number;
  fire: boolean;
  swap: boolean;
  reload: boolean;
}

export interface SnapPlayer {
  id: string;
  slot: 'A' | 'B';
  x: number;
  y: number;
  hp: number;
  weapon: string;
  ammo: number;
  reloading: boolean;
  dead: boolean;
  aim: number;
}

export interface SnapBullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: string;
  weapon: string;
}

export interface SnapPickup {
  id: number;
  kind: string;
  x: number;
  y: number;
  available: boolean;
}

export interface SnapMsg {
  t: 'SNAP';
  tick: number;
  ackSeq: number;
  serverTime: number;
  players: SnapPlayer[];
  bullets: SnapBullet[];
  pickups: SnapPickup[];
  score: Record<string, number>;
  timeLeftMs: number;
}
