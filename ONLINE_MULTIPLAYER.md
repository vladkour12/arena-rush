# Arena Rush - Online Multiplayer System

## Overview

The Arena Rush game now features a complete online multiplayer system with room creation, friends management, and real-time lobbies.

## Features Implemented

### 1. **Login System**
- Players enter a username to join the game
- User IDs generated server-side with UUID
- Online status tracking
- User authentication and profile management

### 2. **Three Game Modes**

#### Local PvP (PLAY WITH FRIEND)
- Classic 1v1 local multiplayer
- Both players on the same device
- Character select screen for both players
- Instant arena battle

#### Play vs Bot (PLAY VS BOT)
- Single-player mode against AI
- Bot automatically selected from 4 characters
- Bot uses intelligent pathfinding and movement
- Fast game start - no waiting for opponent

#### Online Multiplayer (PLAY ONLINE)
- Full online matchmaking system
- Room-based lobbies
- Friends list and invitations
- Public and private rooms
- Real-time player status

### 3. **Lobby System**

#### Room Management
- **Create Room**: Set room name, select character, choose private/public
- **Join Room**: Browse available public rooms, join with one click
- **Room Limits**: Maximum 2 players per room (1v1 format)
- **Real-time Updates**: Room list refreshes every 3 seconds

#### Character Selection
- All 4 characters available in lobby
- Selected character displayed during room browsing
- Character info displayed (stats, abilities, description)

### 4. **Friends System**

#### Search & Add Friends
- **Player Search**: Find players by username
- **Online Status**: See who's online/offline in real-time
- **Add Friend**: Send friend requests
- **Friends List**: View all added friends with status

#### Invite System
- **Send Invites**: Invite online friends to your room
- **Invite Notifications**: Friends receive notifications in real-time
- **Accept/Decline**: Accept or decline room invitations
- **Direct Join**: Accept invite to instantly join room

### 5. **WebSocket Real-time Features**
- **Live Status Updates**: User online/offline status broadcast
- **Room Updates**: New rooms instantly visible to all players
- **Player Notifications**: Real-time friend invitations
- **Game Events**: Start game, match results broadcast

## Architecture

### Frontend (React + TypeScript)
```
App.tsx
├── Login.tsx          - Username entry screen
├── Menu.tsx           - Three game mode selection
├── CharacterSelect.tsx - Character picker (local modes)
├── Lobby.tsx          - Online multiplayer lobby
├── Arena3D.tsx        - 3D battle arena
└── GameOver.tsx       - Results screen
```

### Backend (Node.js + Express + WebSocket)
```
server.js
├── REST API Endpoints
│   ├── POST /api/auth/login              - User authentication
│   ├── GET  /api/players/:userId         - Player profile
│   ├── GET  /api/players/search/:query   - Player search
│   ├── GET  /api/rooms                   - Room listing
│   ├── POST /api/rooms                   - Create room
│   ├── POST /api/rooms/:roomId/join      - Join room
│   ├── POST /api/friends/add             - Add friend
│   └── GET  /api/friends/:userId         - Friends list
│
└── WebSocket Events
    ├── USER_CONNECTED        - User goes online
    ├── USER_STATUS_CHANGED   - Online/offline broadcast
    ├── ROOM_UPDATED          - Room list update
    ├── FRIEND_INVITE         - Send invite to friend
    ├── INVITE_RESPONSE       - Response to invite
    └── GAME_STARTED          - Match started
```

## Running the Game

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Start Backend Server
```bash
node server.js
```
- Runs on: `http://localhost:3001`
- WebSocket: `ws://localhost:3001`

### Step 3: Start Frontend Dev Server (in another terminal)
```bash
npm run dev
```
- Runs on: `http://localhost:3000`

### Combined (Single Command)
```bash
npm run dev:full
```
This runs both frontend and backend simultaneously.

## Game Flow

### Online Multiplayer Flow
1. **Login** → Enter username
2. **Menu** → Choose "PLAY ONLINE"
3. **Lobby** → Three options:
   - **Browse & Join** → Find public rooms, join room with selected character
   - **Create Room** → Create private/public room, invite friends
   - **Friends** → Manage friends list, send invites to online friends
4. **Arena** → Battle starts when room is full (2 players)
5. **Results** → View match results, return to lobby or menu

### Friend Invitation Flow
1. Go to **Friends** tab in lobby
2. Search for player and add as friend
3. Online friend appears in friends list
4. Click **INVITE** button
5. Friend receives real-time notification
6. Friend accepts invite → Joins your room
7. Battle starts when room is full

## Database Structure (In-Memory)

### Players
```typescript
{
  id: string,           // UUID
  username: string,
  friends: string[],    // Array of friend IDs
  status: 'online' | 'offline',
  socket: WebSocket,
  createdAt: number
}
```

### Rooms
```typescript
{
  id: string,              // UUID
  name: string,
  owner: string,           // Owner user ID
  ownerName: string,
  players: { id, username }[],
  isPrivate: boolean,
  maxPlayers: 2,
  status: 'waiting' | 'full' | 'playing',
  createdAt: number
}
```

## Mobile Optimizations

- **Responsive UI**: All screens optimized for mobile
- **Touch-friendly buttons**: 48px minimum targets
- **Simplified navigation**: Tab-based lobby interface
- **Optimized fonts**: Scales for mobile screens
- **Touch feedback**: :active states for all buttons
- **No hover requirements**: All interactions work on touch devices

## Future Enhancements

- [ ] Persistent database (MongoDB/PostgreSQL)
- [ ] User authentication (passwords, JWT tokens)
- [ ] Elo rating system
- [ ] Leaderboards
- [ ] Team matches (2v2, 3v3)
- [ ] Spectator mode
- [ ] Chat system
- [ ] Achievements/Badges
- [ ] Customization (skins, effects)
- [ ] Mobile app deployment

## API Response Examples

### Login
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "username": "Player123",
  "friends": []
}
```

### Room Creation
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "name": "Epic Arena",
  "owner": "550e8400-e29b-41d4-a716-446655440000",
  "players": [
    { "id": "550e8400-e29b-41d4-a716-446655440000", "username": "Player123" }
  ],
  "isPrivate": false,
  "maxPlayers": 2
}
```

### Friend Search
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440002",
    "username": "Warrior99",
    "status": "online"
  }
]
```

## WebSocket Events

### Broadcast Events
```typescript
// User comes online
{
  type: 'USER_STATUS_CHANGED',
  userId: string,
  status: 'online' | 'offline'
}

// Room list updated
{
  type: 'ROOM_UPDATED',
  room: Room
}
```

### Direct Peer Events
```typescript
// Friend invitation
{
  type: 'FRIEND_INVITE',
  fromUserId: string,
  fromUsername: string,
  roomId: string,
  roomName: string
}

// Game start notification
{
  type: 'GAME_STARTED',
  roomId: string,
  player1Character: string,
  player2Character: string
}
```

## Troubleshooting

### Backend won't start
- Check port 3001 is not in use
- Ensure Node.js is installed
- Run: `npm install` if dependencies missing

### Frontend can't connect to backend
- Backend must be running on port 3001
- Check firewall settings
- Verify CORS is enabled in server.js

### Friends not appearing online
- Backend must be running
- WebSocket connection required
- User must be logged in

### Can't join rooms
- Character must be selected first
- Room must have space (max 2 players)
- Must be connected to backend

## Technical Stack

**Frontend:**
- React 19
- TypeScript
- Three.js (3D rendering)
- Vite (build tool)
- CSS3 (styling)

**Backend:**
- Node.js
- Express
- WebSocket (ws library)
- UUID for unique IDs
- CORS for cross-origin requests

**Deployment Ready:**
- Frontend: Vercel, Netlify, GitHub Pages
- Backend: Heroku, AWS, DigitalOcean, Railway

---

**Status**: Full online multiplayer system implemented and ready for use!
