import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { MatchManager } from './server/shooter/MatchManager.js';
import { Match } from './server/shooter/Match.js';
import { GameLoop } from './server/shooter/GameLoop.js';
import { MSG } from './server/shooter/protocol.js';

const shooterMgr = new MatchManager({ maxConcurrent: 4 });
const matchSockets = new Map();         // matchCode -> { A: ws|null, B: ws|null }
const matchLoops = new Map();           // matchCode -> GameLoop
setInterval(() => shooterMgr.expireWaitingRooms(), 60_000);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// In-memory storage
const players = new Map(); // userId -> { id, username, friends, socket }
const rooms = new Map(); // roomId -> { id, name, owner, players, isPrivate, password, createdAt }
const socketToUser = new Map(); // socket -> userId

// REST API Endpoints

// Register/Login
app.post('/api/auth/login', (req, res) => {
  const { username } = req.body;
  if (!username || username.trim().length === 0) {
    return res.status(400).json({ error: 'Username required' });
  }

  const userId = uuidv4();
  const player = {
    id: userId,
    username: username.trim(),
    friends: [],
    blockedUsers: [],
    status: 'online',
    createdAt: Date.now()
  };

  players.set(userId, player);
  res.json({ userId, username: player.username, friends: [] });
});

// Get player profile
app.get('/api/players/:userId', (req, res) => {
  const player = players.get(req.params.userId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  res.json({
    id: player.id,
    username: player.username,
    status: player.status,
    friends: player.friends
  });
});

// Search players
app.get('/api/players/search/:query', (req, res) => {
  const query = req.params.query.toLowerCase();
  const results = Array.from(players.values())
    .filter(p => p.username.toLowerCase().includes(query))
    .slice(0, 10)
    .map(p => ({ id: p.id, username: p.username, status: p.status }));
  res.json(results);
});

// Get rooms list
app.get('/api/rooms', (req, res) => {
  const publicRooms = Array.from(rooms.values())
    .filter(r => !r.isPrivate)
    .map(r => ({
      id: r.id,
      name: r.name,
      owner: r.owner,
      playerCount: r.players.length,
      maxPlayers: 2,
      status: r.status,
      createdAt: r.createdAt
    }));
  res.json(publicRooms);
});

// Create room
app.post('/api/rooms', (req, res) => {
  const { userId, roomName, isPrivate, maxPlayers = 2 } = req.body;
  const player = players.get(userId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }

  const roomId = uuid.v4();
  const room = {
    id: roomId,
    name: roomName,
    owner: userId,
    ownerName: player.username,
    players: [{ id: userId, username: player.username }],
    isPrivate,
    maxPlayers,
    status: 'waiting',
    createdAt: Date.now()
  };

  rooms.set(roomId, room);
  res.json(room);
});

// Join room
app.post('/api/rooms/:roomId/join', (req, res) => {
  const { userId } = req.body;
  const room = rooms.get(req.params.roomId);
  const player = players.get(userId);

  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  if (room.players.length >= room.maxPlayers) {
    return res.status(400).json({ error: 'Room is full' });
  }
  if (room.players.some(p => p.id === userId)) {
    return res.status(400).json({ error: 'Already in room' });
  }

  room.players.push({ id: userId, username: player.username });
  res.json(room);
});

// Add friend
app.post('/api/friends/add', (req, res) => {
  const { userId, friendId } = req.body;
  const player = players.get(userId);
  const friend = players.get(friendId);

  if (!player || !friend) {
    return res.status(404).json({ error: 'Player not found' });
  }
  if (userId === friendId) {
    return res.status(400).json({ error: 'Cannot add yourself' });
  }
  if (player.friends.includes(friendId)) {
    return res.status(400).json({ error: 'Already friends' });
  }

  player.friends.push(friendId);
  res.json({ success: true, friends: player.friends });
});

// Get friends list
app.get('/api/friends/:userId', (req, res) => {
  const player = players.get(req.params.userId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }

  const friendsList = player.friends.map(friendId => {
    const friend = players.get(friendId);
    return friend ? {
      id: friend.id,
      username: friend.username,
      status: friend.status
    } : null;
  }).filter(f => f !== null);

  res.json(friendsList);
});

// === Shooter REST ===

app.post('/api/shooter/rooms', (req, res) => {
  const { hostId, hostName } = req.body;
  if (!hostId || !hostName) return res.status(400).json({ error: 'hostId and hostName required' });
  try {
    const room = shooterMgr.createRoom({ hostId, hostName });
    // Schedule a normal-bot fill if no one joins within 30s
    const code = room.code;
    setTimeout(() => {
      const r = shooterMgr.getRoom(code);
      if (!r || r.guestId || r.state !== 'waiting') return;
      shooterMgr.joinRoom(code, {
        guestId: 'bot-' + code,
        guestName: 'Bot (normal)',
        isBot: true,
        botDifficulty: 'normal',
      });
      startMatchIfReady(code);
    }, 30_000);
    res.json({ code: room.code, hostId: room.hostId });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

app.post('/api/shooter/rooms/:code/join', (req, res) => {
  const { guestId, guestName } = req.body;
  if (!guestId || !guestName) return res.status(400).json({ error: 'guestId and guestName required' });
  const r = shooterMgr.joinRoom(req.params.code, { guestId, guestName });
  if (!r.ok) return res.status(r.reason === 'not_found' ? 404 : 409).json({ error: r.reason });
  res.json({ ok: true, code: req.params.code });
});

app.post('/api/shooter/rooms/:code/bot', (req, res) => {
  const difficulty = req.body.difficulty || 'normal';
  const r = shooterMgr.joinRoom(req.params.code, {
    guestId: 'bot-' + req.params.code,
    guestName: `Bot (${difficulty})`,
    isBot: true,
    botDifficulty: difficulty,
  });
  if (!r.ok) return res.status(r.reason === 'not_found' ? 404 : 409).json({ error: r.reason });
  startMatchIfReady(req.params.code);
  res.json({ ok: true });
});

app.post('/api/shooter/practice', (req, res) => {
  const { hostId, hostName, difficulty = 'normal' } = req.body;
  if (!hostId || !hostName) return res.status(400).json({ error: 'hostId and hostName required' });
  try {
    const room = shooterMgr.createRoom({ hostId, hostName });
    shooterMgr.joinRoom(room.code, {
      guestId: 'bot-' + room.code,
      guestName: `Bot (${difficulty})`,
      isBot: true,
      botDifficulty: difficulty,
    });
    res.json({ code: room.code });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

// === Shooter helpers ===

function broadcastToMatch(code, msg) {
  const sockets = matchSockets.get(code);
  if (!sockets) return;
  for (const slot of ['A', 'B']) {
    const s = sockets[slot];
    if (!s || s.readyState !== 1) continue; // 1 = OPEN
    let toSend = msg;
    if (msg.t === MSG.SNAP) {
      const room = shooterMgr.getRoom(code);
      const ackSeq = room?.match?.getAckSeq?.(slot) ?? 0;
      toSend = { ...msg, ackSeq };
    }
    s.send(JSON.stringify(toSend));
  }
}

function startMatchIfReady(code) {
  const r = shooterMgr.getRoom(code);
  if (!r || r.match) return;
  const sockets = matchSockets.get(code);
  const hostBound = sockets?.A;
  const guestBound = sockets?.B || r.isBotGuest;
  if (!hostBound || !guestBound) return;
  const match = new Match({
    matchId: code, code,
    p1: { id: r.hostId, name: r.hostName },
    p2: { id: r.guestId, name: r.guestName, isBot: r.isBotGuest, botDifficulty: r.botDifficulty },
  });
  shooterMgr.setMatch(code, match);
  const loop = new GameLoop({
    match,
    onSnapshot: (snap) => broadcastToMatch(code, { t: MSG.SNAP, ackSeq: 0, ...snap }),
    onEvent: (ev) => broadcastToMatch(code, { ...ev }),
  });
  matchLoops.set(code, loop);
  loop.start();
  broadcastToMatch(code, { t: MSG.MATCH_START, code, players: { A: r.hostId, B: r.guestId } });
}

function endShooterMatch(ws, _reason) {
  const sm = ws._shooter;
  if (!sm) return;
  const { code, slot } = sm;
  const sockets = matchSockets.get(code);
  if (!sockets) return;
  sockets[slot] = null;
  ws._shooter = null;
  if (!sockets.A && !sockets.B) {
    const loop = matchLoops.get(code);
    if (loop) { loop.stop(); matchLoops.delete(code); }
    matchSockets.delete(code);
    shooterMgr.removeRoom(code);
    return;
  }
  const remainSlot = slot === 'A' ? 'B' : 'A';
  setTimeout(() => {
    const cur = matchSockets.get(code);
    if (!cur) return;
    if (cur[slot]) return;
    if (cur[remainSlot] && cur[remainSlot].readyState === 1) {
      const room = shooterMgr.getRoom(code);
      cur[remainSlot].send(JSON.stringify({
        t: MSG.MATCH_END,
        winner: room?.[remainSlot === 'A' ? 'hostId' : 'guestId'],
        finalScore: room?.match?.score ?? { A: 0, B: 0 },
        reason: 'opponent_disconnected',
      }));
    }
    const loop = matchLoops.get(code);
    if (loop) { loop.stop(); matchLoops.delete(code); }
    matchSockets.delete(code);
    shooterMgr.removeRoom(code);
  }, 5000);
}

function handleRematchRequest(code, slot) {
  const room = shooterMgr.getRoom(code);
  if (!room) return;
  room.rematch = room.rematch || { A: false, B: false };
  room.rematch[slot] = true;
  if (room.rematch.A && room.rematch.B) {
    const loop = matchLoops.get(code);
    if (loop) loop.stop();
    const match = new Match({
      matchId: code, code,
      p1: { id: room.hostId,  name: room.hostName },
      p2: { id: room.guestId, name: room.guestName, isBot: room.isBotGuest, botDifficulty: room.botDifficulty },
    });
    room.match = match;
    room.state = 'playing';
    room.rematch = { A: false, B: false };
    const newLoop = new GameLoop({
      match,
      onSnapshot: (snap) => broadcastToMatch(code, { t: MSG.SNAP, ackSeq: 0, ...snap }),
      onEvent: (ev) => broadcastToMatch(code, { ...ev }),
    });
    matchLoops.set(code, newLoop);
    newLoop.start();
    broadcastToMatch(code, { t: MSG.MATCH_START, code, players: { A: room.hostId, B: room.guestId } });
  }
}

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('New WebSocket connection');

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);

      // === Shooter messages (use `t` field) ===
      if (message.t) {
        switch (message.t) {
          case MSG.JOIN_MATCH: {
            const { code, playerId } = message;
            const room = shooterMgr.getRoom(code);
            if (!room) {
              ws.send(JSON.stringify({ t: MSG.MATCH_END, reason: 'not_found' }));
              return;
            }
            let slot = null;
            if (room.hostId === playerId) slot = 'A';
            else if (room.guestId === playerId) slot = 'B';
            if (!slot) {
              ws.send(JSON.stringify({ t: MSG.MATCH_END, reason: 'not_in_room' }));
              return;
            }
            if (!matchSockets.has(code)) matchSockets.set(code, { A: null, B: null });
            matchSockets.get(code)[slot] = ws;
            ws._shooter = { code, slot };
            startMatchIfReady(code);
            return;
          }
          case MSG.INPUT: {
            const sm = ws._shooter;
            if (!sm) return;
            const room = shooterMgr.getRoom(sm.code);
            if (!room || !room.match) return;
            room.match.applyInput(sm.slot, message);
            return;
          }
          case MSG.LEAVE_MATCH: {
            endShooterMatch(ws, 'left');
            return;
          }
          case MSG.REMATCH_REQUEST: {
            const sm = ws._shooter;
            if (!sm) return;
            handleRematchRequest(sm.code, sm.slot);
            return;
          }
        }
      }

      switch (message.type) {
        case 'USER_CONNECTED':
          socketToUser.set(ws, message.userId);
          const player = players.get(message.userId);
          if (player) {
            player.status = 'online';
            player.socket = ws;
            // Broadcast user online status
            broadcast({
              type: 'USER_STATUS_CHANGED',
              userId: message.userId,
              status: 'online'
            });
          }
          break;

        case 'ROOM_UPDATED':
          // Broadcast room update to all clients
          broadcast({
            type: 'ROOM_UPDATED',
            room: message.room
          });
          break;

        case 'INVITE_FRIEND':
          const targetSocket = players.get(message.targetUserId)?.socket;
          if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
            targetSocket.send(JSON.stringify({
              type: 'FRIEND_INVITE',
              fromUserId: message.fromUserId,
              fromUsername: message.fromUsername,
              roomId: message.roomId,
              roomName: message.roomName
            }));
          }
          break;

        case 'INVITE_RESPONSE':
          const inviterSocket = players.get(message.inviterId)?.socket;
          if (inviterSocket && inviterSocket.readyState === WebSocket.OPEN) {
            inviterSocket.send(JSON.stringify({
              type: 'INVITE_RESPONSE',
              fromUserId: message.fromUserId,
              accepted: message.accepted,
              roomId: message.roomId
            }));
          }
          break;

        case 'START_GAME':
          broadcast({
            type: 'GAME_STARTED',
            roomId: message.roomId,
            player1Character: message.player1Character,
            player2Character: message.player2Character
          });
          break;
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  ws.on('close', () => {
    if (ws._shooter) endShooterMatch(ws, 'disconnect');
    const userId = socketToUser.get(ws);
    if (userId) {
      const player = players.get(userId);
      if (player) {
        player.status = 'offline';
        player.socket = null;
        broadcast({
          type: 'USER_STATUS_CHANGED',
          userId: userId,
          status: 'offline'
        });
      }
      socketToUser.delete(ws);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Utility function to broadcast to all connected clients
function broadcast(message) {
  const data = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket available on ws://localhost:${PORT}`);
  console.log(`Connect from: http://127.0.0.1:${PORT}`);
});
