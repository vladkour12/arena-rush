import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

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

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('New WebSocket connection');

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);

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
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket available on ws://localhost:${PORT}`);
});
