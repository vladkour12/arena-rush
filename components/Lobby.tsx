import React, { useState, useEffect } from 'react';
import { CHARACTERS } from '../constants';

interface LobbyProps {
  userId: string;
  username: string;
  onCharacterSelected: (character: string) => void;
  onBackToMenu: () => void;
  onCreateRoom: (roomName: string, isPrivate: boolean) => void;
  onJoinRoom: (roomId: string) => void;
  onInviteFriend: (friendId: string, roomId: string) => void;
}

interface Room {
  id: string;
  name: string;
  owner: string;
  playerCount: number;
  maxPlayers: number;
  status: string;
  createdAt: number;
}

interface Friend {
  id: string;
  username: string;
  status: 'online' | 'offline';
}

const characterIcons: { [key: string]: string } = {
  knight: '🛡️',
  mage: '🔥',
  ranger: '🏹',
  assassin: '💀'
};

const Lobby: React.FC<LobbyProps> = ({
  userId,
  username,
  onCharacterSelected,
  onBackToMenu,
  onCreateRoom,
  onJoinRoom,
  onInviteFriend
}) => {
  const [currentTab, setCurrentTab] = useState<'rooms' | 'friends' | 'create' | 'invite'>('rooms');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<string>('');
  const [roomName, setRoomName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [inviteTargetId, setInviteTargetId] = useState('');

  // Fetch rooms on mount
  useEffect(() => {
    fetchRooms();
    fetchFriends();
    const interval = setInterval(fetchRooms, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchRooms = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/rooms');
      const data = await response.json();
      setRooms(data);
    } catch (error) {
      console.error('Error fetching rooms:', error);
    }
  };

  const fetchFriends = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/friends/${userId}`);
      const data = await response.json();
      setFriends(data);
    } catch (error) {
      console.error('Error fetching friends:', error);
    }
  };

  const handleCreateRoom = async () => {
    if (!roomName.trim() || !selectedCharacter) {
      alert('Please enter room name and select a character');
      return;
    }

    try {
      const response = await fetch('http://localhost:3001/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          roomName,
          isPrivate,
          maxPlayers: 2
        })
      });

      const room = await response.json();
      onCreateRoom(roomName, isPrivate);
      onCharacterSelected(selectedCharacter);
    } catch (error) {
      console.error('Error creating room:', error);
    }
  };

  const handleJoinRoom = async (roomId: string) => {
    if (!selectedCharacter) {
      alert('Please select a character first');
      return;
    }

    try {
      const response = await fetch(`http://localhost:3001/api/rooms/${roomId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });

      if (response.ok) {
        onJoinRoom(roomId);
        onCharacterSelected(selectedCharacter);
      }
    } catch (error) {
      console.error('Error joining room:', error);
    }
  };

  const handleSearchPlayers = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/players/search/${searchQuery}`);
      const data = await response.json();
      setSearchResults(data);
    } catch (error) {
      console.error('Error searching players:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFriend = async (friendId: string) => {
    try {
      const response = await fetch('http://localhost:3001/api/friends/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, friendId })
      });

      if (response.ok) {
        fetchFriends();
        setSearchResults([]);
        setSearchQuery('');
      }
    } catch (error) {
      console.error('Error adding friend:', error);
    }
  };

  return (
    <div className="lobby-wrapper">
      <div className="lobby-bg"></div>
      
      <div className="lobby-container">
        {/* Header */}
        <div className="lobby-header">
          <h1 className="lobby-title">⚔️ ARENA RUSH LOBBY ⚔️</h1>
          <div className="player-info">
            <span className="player-name">{username}</span>
            <button className="back-to-menu-btn" onClick={onBackToMenu}>
              ← BACK
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="lobby-tabs">
          <button
            className={`tab-btn ${currentTab === 'rooms' ? 'active' : ''}`}
            onClick={() => setCurrentTab('rooms')}
          >
            🎮 JOIN ROOM
          </button>
          <button
            className={`tab-btn ${currentTab === 'friends' ? 'active' : ''}`}
            onClick={() => setCurrentTab('friends')}
          >
            👥 FRIENDS ({friends.length})
          </button>
          <button
            className={`tab-btn ${currentTab === 'invite' ? 'active' : ''}`}
            onClick={() => setCurrentTab('invite')}
          >
            📨 INVITE BY ID
          </button>
          <button
            className={`tab-btn ${currentTab === 'create' ? 'active' : ''}`}
            onClick={() => setCurrentTab('create')}
          >
            ✨ CREATE ROOM
          </button>
        </div>

        {/* Content */}
        <div className="lobby-content">
          {/* Character Selection */}
          <div className="char-select-section">
            <h3>SELECT YOUR CHARACTER</h3>
            <div className="char-grid-lobby">
              {Object.entries(CHARACTERS).map(([charId, char]) => (
                <div
                  key={charId}
                  className={`char-card-lobby ${selectedCharacter === charId ? 'selected' : ''}`}
                  onClick={() => setSelectedCharacter(charId)}
                >
                  <div className="char-icon">{characterIcons[charId]}</div>
                  <div className="char-name">{char.name}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Rooms Tab */}
          {currentTab === 'rooms' && (
            <div className="rooms-tab">
              <h2>📋 Available Rooms</h2>
              <div className="rooms-list">
                {rooms.length === 0 ? (
                  <p className="empty-message">No rooms available. Create one to get started!</p>
                ) : (
                  rooms.map(room => (
                    <div key={room.id} className="room-card">
                      <div className="room-info">
                        <h3>{room.name}</h3>
                        <p className="room-host">Host: {room.owner}</p>
                        <div className="room-stats">
                          <span>👥 {room.playerCount}/{room.maxPlayers}</span>
                          <span>{room.isPrivate ? '🔒 Private' : '🔓 Public'}</span>
                        </div>
                      </div>
                      <button
                        className="join-room-btn"
                        onClick={() => handleJoinRoom(room.id)}
                        disabled={room.playerCount >= room.maxPlayers || !selectedCharacter}
                      >
                        {room.playerCount >= room.maxPlayers ? 'FULL' : 'JOIN'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Friends Tab */}
          {currentTab === 'friends' && (
            <div className="friends-tab">
              <div className="friends-search">
                <input
                  type="text"
                  placeholder="Search players to add..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && handleSearchPlayers()}
                  className="search-input"
                />
                <button className="search-btn" onClick={handleSearchPlayers} disabled={loading}>
                  {loading ? 'SEARCHING...' : 'SEARCH'}
                </button>
              </div>

              {searchResults.length > 0 && (
                <div className="search-results">
                  <h3>Search Results</h3>
                  {searchResults.map(player => (
                    <div key={player.id} className="player-search-card">
                      <div className="player-info-card">
                        <span className="player-name">{player.username}</span>
                        <span className={`player-status ${player.status}`}>
                          {player.status === 'online' ? '🟢 Online' : '⚫ Offline'}
                        </span>
                      </div>
                      <button
                        className="add-friend-btn"
                        onClick={() => handleAddFriend(player.id)}
                      >
                        ADD FRIEND
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="friends-list">
                <h3>📜 Your Friends ({friends.length})</h3>
                {friends.length === 0 ? (
                  <p className="empty-message">No friends yet. Search and add some!</p>
                ) : (
                  friends.map(friend => (
                    <div key={friend.id} className="friend-card">
                      <div className="friend-info">
                        <span className="friend-name">{friend.username}</span>
                        <span className={`friend-status ${friend.status}`}>
                          {friend.status === 'online' ? '🟢 Online' : '⚫ Offline'}
                        </span>
                      </div>
                      <button
                        className="invite-btn"
                        disabled={friend.status === 'offline' || !selectedCharacter}
                      >
                        INVITE
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

        {/* Invite by ID Tab */}
        {currentTab === 'invite' && (
          <div className="invite-tab">
            <div className="invite-card">
              <h2>Your Game ID</h2>
              <p className="game-id">{userId}</p>
              <button
                className="copy-id-btn"
                onClick={() => navigator.clipboard.writeText(userId)}
              >
                COPY ID
              </button>
            </div>

            <div className="invite-card">
              <h2>Invite Player by ID</h2>
              <input
                type="text"
                className="form-input"
                placeholder="Enter player Game ID..."
                value={inviteTargetId}
                onChange={e => setInviteTargetId(e.target.value)}
              />
              <button
                className="invite-by-id-btn"
                disabled={!inviteTargetId.trim() || !selectedCharacter}
                onClick={() => {
                  onInviteFriend(inviteTargetId.trim(), '');
                  setInviteTargetId('');
                }}
              >
                SEND INVITE
              </button>
              <p className="hint-text">Select a character first so you can jump into a room after invite.</p>
            </div>
          </div>
        )}

          {/* Create Room Tab */}
          {currentTab === 'create' && (
            <div className="create-room-tab">
              <h2>✨ Create Your Room</h2>
              <div className="create-form">
                <div className="form-group">
                  <label>Room Name</label>
                  <input
                    type="text"
                    placeholder="Enter room name..."
                    value={roomName}
                    onChange={e => setRoomName(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div className="form-group privacy-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={isPrivate}
                      onChange={e => setIsPrivate(e.target.checked)}
                    />
                    <span>Private Room (need password to join)</span>
                  </label>
                </div>

                <div className="selected-char-display">
                  {selectedCharacter ? (
                    <div className="display-char">
                      <div className="display-icon">{characterIcons[selectedCharacter]}</div>
                      <div className="display-name">{CHARACTERS[selectedCharacter].name}</div>
                    </div>
                  ) : (
                    <p className="no-select">Select a character first</p>
                  )}
                </div>

                <button
                  className="create-room-btn"
                  onClick={handleCreateRoom}
                  disabled={!roomName.trim() || !selectedCharacter}
                >
                  CREATE ROOM
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating friend list shortcut */}
      <button className="friend-fab" onClick={() => setCurrentTab('friends')}>
        👥 FRIENDS
      </button>
    </div>
  );
};

export default Lobby;
