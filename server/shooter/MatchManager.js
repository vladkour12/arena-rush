const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LEN = 4;
const WAITING_TTL_MS = 5 * 60 * 1000;

function genCode() {
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) {
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return s;
}

export class MatchManager {
  constructor({ maxConcurrent = 4 } = {}) {
    this.rooms = new Map();
    this.maxConcurrent = maxConcurrent;
  }

  _uniqueCode() {
    for (let i = 0; i < 50; i++) {
      const c = genCode();
      if (!this.rooms.has(c)) return c;
    }
    throw new Error('Could not allocate unique room code');
  }

  createRoom({ hostId, hostName }) {
    if (this.rooms.size >= this.maxConcurrent) {
      throw new Error('Server busy: too many concurrent matches');
    }
    const code = this._uniqueCode();
    const room = {
      code,
      hostId,
      hostName,
      guestId: null,
      guestName: null,
      isBotGuest: false,
      botDifficulty: null,
      state: 'waiting',           // waiting | playing | ended
      match: null,                // populated when transition to 'playing'
      createdAt: Date.now(),
    };
    this.rooms.set(code, room);
    return room;
  }

  joinRoom(code, { guestId, guestName, isBot = false, botDifficulty = null }) {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, reason: 'not_found' };
    if (room.guestId) return { ok: false, reason: 'full' };
    if (room.state !== 'waiting') return { ok: false, reason: 'not_waiting' };
    room.guestId = guestId;
    room.guestName = guestName;
    room.isBotGuest = isBot;
    room.botDifficulty = botDifficulty;
    return { ok: true, room };
  }

  getRoom(code) { return this.rooms.get(code); }

  setMatch(code, match) {
    const room = this.rooms.get(code);
    if (!room) return;
    room.match = match;
    room.state = 'playing';
  }

  endMatch(code) {
    const room = this.rooms.get(code);
    if (room) room.state = 'ended';
  }

  removeRoom(code) { this.rooms.delete(code); }

  expireWaitingRooms() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (room.state === 'waiting' && now - room.createdAt > WAITING_TTL_MS) {
        this.rooms.delete(code);
      }
    }
  }

  size() { return this.rooms.size; }
}
