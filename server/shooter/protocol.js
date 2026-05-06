export const MSG = Object.freeze({
  // client → server
  INPUT: 'INPUT',
  JOIN_MATCH: 'JOIN_MATCH',
  LEAVE_MATCH: 'LEAVE_MATCH',
  REMATCH_REQUEST: 'REMATCH_REQUEST',
  // server → client
  SNAP: 'SNAP',
  KILL: 'KILL',
  PICKUP: 'PICKUP',
  MATCH_START: 'MATCH_START',
  MATCH_END: 'MATCH_END',
  RESPAWN: 'RESPAWN',
});
