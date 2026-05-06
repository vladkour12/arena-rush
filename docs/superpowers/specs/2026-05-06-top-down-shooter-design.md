# Top-Down Shooter — Design Spec

**Date:** 2026-05-06
**Mode name:** Top-Down Shooter (replaces the "Arena Battle: Coming Soon" menu card)
**Status:** Approved by user, ready for implementation plan

---

## 1. Goal

Add a 1v1 online top-down shooter game mode to Arena Rush, alongside the existing Island Wars RTS mode. The shooter is fully separate from Island Wars — they share only the existing `server.js` Express+WS entry point. The mode must be playable on mobile phones (primary target) and PC.

A single match is a fast (~3-5 min) deathmatch between two players. Players can play against a friend over the internet by exchanging a 4-letter room code, or against a bot in Practice mode.

## 2. Decisions Locked During Brainstorming

| # | Question | Decision |
|---|----------|----------|
| 1 | How does multiplayer work? | Online via existing Express+WS server. Not local couch co-op. |
| 2 | Netcode model | **Authoritative server.** Server runs game simulation; clients send inputs and render snapshots. |
| 3 | Match format | **Deathmatch, first to 10 kills**, 5-min hard cap, 2s respawn. |
| 4 | Weapons | Players carry pistol always + one pickup weapon. Pickups spawn on the map. |
| 5 | Bots | Practice mode (Easy / Normal / Hard) **and** bots fill empty online rooms after 30s. |
| 6 | Controls | **Mobile-first.** Twin virtual sticks (left = move, right = aim + auto-fire while held). PC = WASD + mouse aim + left-click fire. |
| 7 | Lobby | **4-letter room code only.** No login required. Existing friend-list code in `server.js` left unused for v1. |

## 3. Architecture

### 3.1 Approach (chosen from 3 alternatives during brainstorming)

**Server-as-simulator + client-as-renderer.** Server runs a plain JS tick loop at 30Hz. It owns all gameplay state: player positions, velocities, HP, projectiles, pickup spawn timers, walls, score. Clients run Phaser purely for rendering and input — no physics, no hit detection. Clients perform local-player movement prediction for responsiveness, and interpolate remote entities ~100ms behind realtime.

Rejected alternatives:
- *Phaser headless on server* — Phaser 4 isn't designed for headless Node use; canvas-stubbing is fragile and a server doesn't need 60fps physics.
- *Host-authoritative peer relay* — explicitly ruled out by user (Q2). Cheatable, host-disconnect ends the game.

### 3.2 File layout

New / modified files:

```
server.js                              # extended with shooter REST routes + WS message handlers
server/
  shooter/
    GameLoop.js                        # 30Hz tick: movement, hit detection, snapshot broadcast
    Match.js                           # one match instance: state, players, bullets, pickups
    MatchManager.js                    # room registry by 4-letter code; lifecycle
    Map.js                             # walls (AABBs), spawn points, pickup spawn coordinates
    Bot.js                             # server-side bot AI (easy/normal/hard)
    Weapons.js                         # weapon stats (kept in sync with client weapons.ts)
    protocol.js                        # shared message-type constants

components/
  Menu.tsx                             # MODIFIED: replace "Arena Battle: Coming Soon" with active shooter card
  ShooterLobby.tsx                     # NEW: name input, Create / Join / Practice buttons, room-code screen
  Shooter.tsx                          # NEW: mounts Phaser scene + HUD overlay (HP/weapon/ammo/score/timer)

App.tsx                                # MODIFIED: add 'shooter' route alongside 'menu' and 'islandwars'

game/
  shooter/
    config/
      weapons.ts                       # 4 weapons, stats kept in sync with server/shooter/Weapons.js
      map.ts                           # tile layout, pickup positions (mirrors server/shooter/Map.js)
    scenes/
      ShooterPreloadScene.ts           # loads Top-down shooter asset pack from public/
      ShooterScene.ts                  # render-only: players, bullets, pickups, walls, camera follow
    net/
      ShooterClient.ts                 # WS connection; sends INPUT @ 30Hz; applies SNAP / KILL / etc.
      Prediction.ts                    # local-player movement prediction + reconciliation on ackSeq
      Interpolation.ts                 # render remote entities at "now - 100ms" between snapshots
    input/
      DesktopInput.ts                  # WASD + mouse aim + click + Q swap
      MobileInput.ts                   # twin virtual sticks, auto-fire while right stick held
```

### 3.3 Source of truth

The `server/shooter/` code is the only authority. The `game/shooter/` client code never decides hits, kills, pickups, or scoring — it only *displays* what the server says, with prediction smoothing for the local player's own movement.

Weapon stats live in two places that must stay in sync (`server/shooter/Weapons.js` and `game/shooter/config/weapons.ts`). The client copy is used purely for UI (showing ammo / icons / reload bars). All damage and fire-rate logic runs server-side.

## 4. Netcode Protocol

### 4.1 Tick rates

- Server simulation tick: **30 Hz** (33.3ms)
- Snapshot broadcast: **20 Hz** (50ms)
- Client input send: **30 Hz**
- Interpolation buffer: **100 ms** (renders remote entities behind realtime by 100ms)

### 4.2 Client → Server: INPUT

```js
{
  t: "INPUT",
  seq: 142,           // monotonic; server echoes most recent processed seq in SNAP.ackSeq
  mv: { x: 1, y: 0 }, // normalized 2D move vector from joystick or WASD
  aim: 1.57,          // radians; gun direction
  fire: true,         // is fire button held this frame
  swap: false,        // true exactly once when player taps weapon swap
  reload: false       // true exactly once when player taps reload
}
```

Sent at 30Hz. Server processes input frames in `seq` order, drops anything older than the last processed seq.

### 4.3 Server → Client: SNAP (snapshot)

```js
{
  t: "SNAP",
  tick: 5021,
  ackSeq: 142,        // last input seq this client has had processed
  players: [
    { id: "A", x: 320, y: 480, hp: 75, weapon: "shotgun", ammo: 4, reloading: false, dead: false },
    { id: "B", x: 412, y: 510, hp: 100, weapon: "pistol",  ammo: 12, reloading: false, dead: false }
  ],
  bullets: [
    { id: 17, x: 350, y: 482, vx: 600, vy: 0, owner: "A", weapon: "pistol" }
  ],
  pickups: [
    { id: 3, kind: "shotgun", x: 256, y: 256, available: true }
  ],
  score: { A: 4, B: 3 },
  timeLeftMs: 218400
}
```

Sent at 20Hz. If a snapshot is identical to the previous one (rare), it's still sent every 5 ticks as a heartbeat.

### 4.4 Server → Client: One-shot events

Sent immediately when they happen, not piggybacked on snapshots, so they're never lost between snapshots:

```js
{ t: "KILL",      killer: "A", victim: "B", weapon: "shotgun", at: { x, y } }
{ t: "PICKUP",    player: "A", pickupId: 3, kind: "shotgun" }
{ t: "MATCH_END", winner: "A", finalScore: { A: 10, B: 7 }, reason: "score" | "timeout" | "opponent_disconnected" }
{ t: "RESPAWN",   player: "A", x, y }
```

### 4.5 Client → Server: Lifecycle

```js
{ t: "JOIN_MATCH", code: "XJ4P", playerId, name }     // sent right after WS open in match screen
{ t: "REMATCH_REQUEST", code: "XJ4P" }                // from end screen
{ t: "LEAVE_MATCH", code: "XJ4P" }                    // back-to-menu
```

### 4.6 Latency hiding

- **Local player prediction.** Client immediately applies its own input to the local player's position. When a SNAP arrives with `ackSeq = N`, the client snaps the local player to the server-confirmed position at that point and re-applies inputs `N+1...current` on top.
- **Remote interpolation.** Remote players and bullets are rendered at `now - 100ms`, interpolated linearly between the two most recent snapshots straddling that timestamp. No rollback, no extrapolation.
- **No client-side hit detection.** Bullets that look like they hit on the client may be told they missed by the server. The client believes the server.

### 4.7 Disconnect handling

- WS close mid-match: opponent receives `MATCH_END` with `reason: "opponent_disconnected"` and is awarded the win. Match is torn down.
- 5-second reconnection grace window: if the same `playerId` reopens a WS within 5s with `JOIN_MATCH` for the same code, the match resumes. (Implementation: server holds the match for 5s after a disconnect before declaring forfeit.)

## 5. Gameplay Specifics

### 5.1 Match rules

- **Win condition:** First to 10 kills, OR if the 5-minute timer expires, the higher score wins. Tie at timeout → sudden death, first kill wins.
- **Respawn delay:** 2 seconds.
- **Respawn position:** The farther of two fixed spawn points from the opponent at the moment of respawn.
- **On death:** Killed player drops their currently-held pickup weapon (not the pistol) as a temporary pickup. The dropped pickup persists for 8 seconds, then despawns. The map's regular pickup spawn timer is independent of dropped pickups.

### 5.2 Player stats

- HP: 100, no regen
- Move speed: 200 px/s
- Body radius: 16 px (used for circle-circle bullet collision and circle-AABB wall collision)
- Always carries: **pistol** with infinite reserve ammo + **one pickup weapon** (none initially)
- Swap: tap weapon icon (mobile) or press Q (PC). Swap is instant.

### 5.3 Weapons

| Weapon | Damage | Fire rate (per s) | Mag | Reload (s) | Range (px) | Spread | Notes |
|---|---|---|---|---|---|---|---|
| Pistol | 18 | 3 | 12 | 1.2 | 700 | low | infinite reserve; default; never dropped |
| SMG | 10 | 12 | 30 | 1.8 | 500 | medium | high DPS, drains fast |
| Shotgun | 8 × 5 pellets | 1.2 | 6 | 2.0 | 280 | wide cone | one-shot at point blank |
| Sniper | 80 | 0.8 | 4 | 2.5 | 1500 | none | two-shot kill at any range |

Bullets are simple linear projectiles (no gravity, no drop). Server steps them each tick and checks collision against player circles and wall AABBs in that order. First hit wins; bullet is destroyed.

### 5.4 Map (v1 — single map)

- **Tile size:** 64 px (matches Island Wars convention).
- **Dimensions:** 30 × 20 tiles = 1920 × 1280 px.
- **Camera:** follows local player, no zoom. On mobile, slightly tighter follow.
- **Layout:** symmetric, two spawn points in opposite corners, mid-map cover from the asset pack tileset (crates, low walls), no diagonal walls (AABB-only for collision simplicity).
- **Pickup spawn points:** three fixed positions, one per non-pistol weapon (SMG, Shotgun, Sniper). Each pickup always respawns as the same weapon — no rotation in v1.
- **Pickup respawn:** 15 seconds after pickup.
- **Walls:** array of `{x, y, w, h}` AABBs in `Map.js`. Bullets stop on wall hit; players collide with walls (slide along edge).

### 5.5 Bots

Server-side AI in `Bot.js`. Behavior tree:

```
if hp < 30 and known pickup nearby → flee toward pickup
elif enemy in line-of-sight        → engage (face + fire if in weapon range)
else                                → roam (random waypoints, prefer pickup spawns)
```

Difficulty parameters:

| | Reaction lag | Aim accuracy | Pickup priority |
|---|---|---|---|
| Easy | 500 ms | 60% | ignores pickups |
| Normal | 250 ms | 80% | grabs shotgun & sniper |
| Hard | 100 ms | 92% | contests pickups, kites with sniper |

Bot fills an empty online room **30 seconds after creation** if no human joined, using `normal` difficulty. The room owner can also press an "Add Bot Now" button to skip the wait.

## 6. Lobby Flow

### 6.1 UI screens

```
Menu
  └── [Top-Down Shooter card]
         │
         ▼
ShooterLobby
   ┌─ Name input (stored in localStorage, prefilled next time)
   │
   ├─ [ Create Room ]    → POST /api/shooter/rooms → returns { code, hostId }
   │                        → "Waiting for opponent…" screen with copyable code
   │                        → "Add Bot Now" button (force-adds normal bot)
   │                        → 30s timer auto-adds normal bot
   │                        → on opponent join: both clients transition to Shooter scene
   │
   ├─ [ Join Room ]      → 4-letter code input
   │                        → POST /api/shooter/rooms/:code/join
   │                        → on success, transition to Shooter scene
   │
   └─ [ Practice vs Bot ] → difficulty selector (Easy / Normal / Hard)
                              → server creates room + immediately adds bot
                              → transitions straight into Shooter scene
```

### 6.2 Server room API

```
POST /api/shooter/rooms                       → { code, hostId }
POST /api/shooter/rooms/:code/join            → { ok, matchId } | 404 | 409 (full)
POST /api/shooter/rooms/:code/bot             → { ok }    (force-add bot of given difficulty)
POST /api/shooter/practice                    → { code, hostId }   (creates room w/ bot pre-added)
```

Codes are 4 uppercase letters, regenerated on collision. Letters chosen from a confusable-free alphabet (no I, O, 0, 1).

### 6.3 Room lifecycle

- Room created → exists in `MatchManager` registry, `state = "waiting"`.
- Second player joins (or bot added) → `state = "playing"`, `Match` instance created, tick loop begins.
- Match ends → `state = "ended"`. End screen shown to both clients.
- Rematch requested by both → reset state, new tick loop, same code.
- Either player presses "Back to Menu" → leaves match. If both leave, room is deleted.
- 5 minutes after creation with `state = "waiting"` → room auto-deleted.

## 7. HUD

Drawn as a React overlay in `Shooter.tsx`, positioned over the Phaser canvas.

- **Top-left:** HP bar + current weapon icon + ammo counter (X / mag size) + reload progress bar.
- **Top-center:** "PlayerA  4 — 3  PlayerB" + countdown timer (mm:ss).
- **Top-right:** Kill feed, last 3 kills, fade out after 4s. Format: `Killer ▶ [weapon icon] ▶ Victim`.
- **Bottom-left (mobile only):** invisible touch zone for left virtual stick (move).
- **Bottom-right (mobile only):** invisible touch zone for right virtual stick (aim + auto-fire).
- **Center on death:** "You died — respawning in 2…1" overlay.
- **Center on match end:** "Victory!" / "Defeat" + final score + [ Rematch ] [ Back to Menu ] buttons.

## 8. Out of Scope (explicitly NOT in v1)

- Multiple maps; map voting
- Cosmetics, character selection beyond the asset pack default skin
- Persistent accounts; ranked / MMR; stats history
- Spectators, replays, observers
- Voice / text chat
- Anti-cheat beyond "server is authoritative"
- Custom keybindings, mouse-sensitivity sliders
- Friend-list integration in lobby (server has the API; v1 uses room codes only)

## 9. Risks & Open Items

1. **Render free tier cold start.** First connection after idle takes 30-60s to wake. ShooterLobby must show a "waking server…" loader if the first request takes >2s.
2. **Server CPU on free tier.** 30Hz across many concurrent matches may strain CPU quota. v1 caps concurrent matches at 4; further attempts get a "server busy, try again later" response.
3. **Mobile WS over flaky cellular.** 5-second reconnect grace window before forfeit (see §4.7).
4. **Audio.** The Top-down shooter asset pack contains visuals only. v1 ships silent or with placeholders; sound design deferred.
5. **Single map symmetry.** Walls and pickup positions must be hand-tuned for fairness. The `Map.js` file is the single source; ship a debug overlay early to verify.
