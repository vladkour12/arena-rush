import React from 'react';
import { CHARACTERS } from '../constants';

interface CharacterSelectProps {
  onCharacterSelected: (player: 1 | 2, characterId: string) => void;
  selectedCharacters: { player1: string | null; player2: string | null };
  onBackToMenu: () => void;
  gameMode: 'pvp' | 'bot';
  onStart: () => void;
}

const characterIcons: { [key: string]: string } = {
  knight: '🛡️',
  mage: '🔥',
  ranger: '🏹',
  assassin: '💀'
};

const CharacterSelect: React.FC<CharacterSelectProps> = ({
  onCharacterSelected,
  selectedCharacters,
  onBackToMenu,
  gameMode,
  onStart
}) => {
  const characterIds = Object.keys(CHARACTERS);
  const calcBar = (value: number, max: number) => `${Math.min(100, (value / max) * 100)}%`;

  return (
    <div className="character-select-wrapper">
      <div className={`character-select ${gameMode === 'bot' ? 'bot-mode' : 'pvp-mode'}`}>
        <h1 className="select-header">⚔️ {gameMode === 'bot' ? 'CHOOSE YOUR CHARACTER' : 'SELECT YOUR CHARACTERS'} ⚔️</h1>
        
        <div className="players-container">
          {/* Player 1 Select */}
          <div className="player-select">
            <div className="player-header player-1-header">
              <h2 className="player-label">
                🎮 {gameMode === 'bot' ? 'YOU' : 'PLAYER 1'}
                {selectedCharacters.player1 && (
                  <span className="selected-label"> — {CHARACTERS[selectedCharacters.player1].name.toUpperCase()}</span>
                )}
              </h2>
              <div className={`player-status ${selectedCharacters.player1 ? 'ready' : 'waiting'}`}>
                {selectedCharacters.player1 ? '✓ READY' : '○ CHOOSE'}
              </div>
            </div>

            <div className="selected-preview">
              {selectedCharacters.player1 ? (
                <div className="preview-card">
                  <div className="preview-icon">{characterIcons[selectedCharacters.player1]}</div>
                  <div className="preview-info">
                    <div className="preview-title">{CHARACTERS[selectedCharacters.player1].name}</div>
                    <div className="preview-desc">{CHARACTERS[selectedCharacters.player1].description}</div>
                    <div className="stat-bars">
                      <div className="stat-bar">
                        <span>HP</span>
                        <div><div style={{width: calcBar(CHARACTERS[selectedCharacters.player1].maxHealth, 200)}}></div></div>
                        <strong>{CHARACTERS[selectedCharacters.player1].maxHealth}</strong>
                      </div>
                      <div className="stat-bar">
                        <span>DMG</span>
                        <div><div style={{width: calcBar(CHARACTERS[selectedCharacters.player1].stats.damage, 150)}}></div></div>
                        <strong>{CHARACTERS[selectedCharacters.player1].stats.damage}</strong>
                      </div>
                      <div className="stat-bar">
                        <span>SPD</span>
                        <div><div style={{width: calcBar(CHARACTERS[selectedCharacters.player1].stats.movementSpeed, 120)}}></div></div>
                        <strong>{CHARACTERS[selectedCharacters.player1].stats.movementSpeed}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="preview-placeholder">Select a character to preview stats</div>
              )}
            </div>
            <div className="character-grid">
              {characterIds.map(charId => {
                const char = CHARACTERS[charId];
                const isSelected = selectedCharacters.player1 === charId;
                return (
                  <div
                    key={charId}
                    className={`character-card-enhanced ${isSelected ? 'selected' : ''}`}
                    onClick={() => onCharacterSelected(1, charId)}
                  >
                    <div className="card-icon">{characterIcons[charId]}</div>
                    <div className="character-name-enhanced">{char.name}</div>
                    <div className="character-desc">{char.description}</div>
                    
                    <div className="stat-badges">
                      <div className="stat-badge health">
                        <span className="badge-icon">❤️</span>
                        <span className="badge-value">{char.maxHealth}</span>
                      </div>
                      <div className="stat-badge damage">
                        <span className="badge-icon">⚡</span>
                        <span className="badge-value">{char.stats.damage}</span>
                      </div>
                      <div className="stat-badge speed">
                        <span className="badge-icon">💨</span>
                        <span className="badge-value">{char.stats.movementSpeed}</span>
                      </div>
                    </div>
                    
                    {isSelected && <div className="selection-indicator">✓</div>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Player 2 / Bot Select - Only show in PvP mode */}
          {gameMode === 'pvp' && (
          <div className="player-select">
            <div className="player-header player-2-header">
              <h2 className="player-label">
                🎮 PLAYER 2
                {selectedCharacters.player2 && (
                  <span className="selected-label"> — {CHARACTERS[selectedCharacters.player2].name.toUpperCase()}</span>
                )}
              </h2>
              <div className={`player-status ${selectedCharacters.player2 ? 'ready' : 'waiting'}`}>
                {selectedCharacters.player2 ? '✓ READY' : '○ CHOOSE'}
              </div>
            </div>

            <div className="selected-preview">
              {selectedCharacters.player2 ? (
                <div className="preview-card">
                  <div className="preview-icon">{characterIcons[selectedCharacters.player2]}</div>
                  <div className="preview-info">
                    <div className="preview-title">{CHARACTERS[selectedCharacters.player2].name}</div>
                    <div className="preview-desc">{CHARACTERS[selectedCharacters.player2].description}</div>
                    <div className="stat-bars">
                      <div className="stat-bar">
                        <span>HP</span>
                        <div><div style={{width: calcBar(CHARACTERS[selectedCharacters.player2].maxHealth, 200)}}></div></div>
                        <strong>{CHARACTERS[selectedCharacters.player2].maxHealth}</strong>
                      </div>
                      <div className="stat-bar">
                        <span>DMG</span>
                        <div><div style={{width: calcBar(CHARACTERS[selectedCharacters.player2].stats.damage, 150)}}></div></div>
                        <strong>{CHARACTERS[selectedCharacters.player2].stats.damage}</strong>
                      </div>
                      <div className="stat-bar">
                        <span>SPD</span>
                        <div><div style={{width: calcBar(CHARACTERS[selectedCharacters.player2].stats.movementSpeed, 120)}}></div></div>
                        <strong>{CHARACTERS[selectedCharacters.player2].stats.movementSpeed}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="preview-placeholder">Player 2 selects a character</div>
              )}
            </div>
            <div className="character-grid">
              {characterIds.map(charId => {
                const char = CHARACTERS[charId];
                const isSelected = selectedCharacters.player2 === charId;
                return (
                  <div
                    key={charId}
                    className={`character-card-enhanced ${isSelected ? 'selected' : ''}`}
                    onClick={() => onCharacterSelected(2, charId)}
                  >
                    <div className="card-icon">{characterIcons[charId]}</div>
                    <div className="character-name-enhanced">{char.name}</div>
                    <div className="character-desc">{char.description}</div>
                    
                    <div className="stat-badges">
                      <div className="stat-badge health">
                        <span className="badge-icon">❤️</span>
                        <span className="badge-value">{char.maxHealth}</span>
                      </div>
                      <div className="stat-badge damage">
                        <span className="badge-icon">⚡</span>
                        <span className="badge-value">{char.stats.damage}</span>
                      </div>
                      <div className="stat-badge speed">
                        <span className="badge-icon">💨</span>
                        <span className="badge-value">{char.stats.movementSpeed}</span>
                      </div>
                    </div>
                    
                    {isSelected && <div className="selection-indicator">✓</div>}
                  </div>
                );
              })}
            </div>
          </div>
          )}

          {/* Bot Mode - Show selected bot character */}
          {gameMode === 'bot' && (
          <div className="player-select bot-select">
            <div className="player-header player-2-header">
              <h2 className="player-label">
                🤖 BOT OPPONENT
                {selectedCharacters.player2 && (
                  <span className="selected-label"> — {CHARACTERS[selectedCharacters.player2].name.toUpperCase()}</span>
                )}
              </h2>
              <div className={`player-status ready`}>
                {selectedCharacters.player2 ? '✓ READY' : '○ RANDOM'}
              </div>
            </div>

            <div className="bot-note">Bot is auto-assigned after you pick your character. Start when you’re ready.</div>
            {selectedCharacters.player2 && (
              <div className="bot-character-display">
                <div className="bot-char-info">
                  <div className="card-icon">{characterIcons[selectedCharacters.player2]}</div>
                  <div className="character-name-enhanced">{CHARACTERS[selectedCharacters.player2].name}</div>
                  <div className="character-desc">{CHARACTERS[selectedCharacters.player2].description}</div>
                  
                  <div className="stat-badges">
                    <div className="stat-badge health">
                      <span className="badge-icon">❤️</span>
                      <span className="badge-value">{CHARACTERS[selectedCharacters.player2].maxHealth}</span>
                    </div>
                    <div className="stat-badge damage">
                      <span className="badge-icon">⚡</span>
                      <span className="badge-value">{CHARACTERS[selectedCharacters.player2].stats.damage}</span>
                    </div>
                    <div className="stat-badge speed">
                      <span className="badge-icon">💨</span>
                      <span className="badge-value">{CHARACTERS[selectedCharacters.player2].stats.movementSpeed}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          )}
        </div>

        <div className="select-footer">
          {gameMode === 'pvp' && (
          <button 
            className={`start-button ${selectedCharacters.player1 && selectedCharacters.player2 ? 'active' : 'disabled'}`}
            disabled={!selectedCharacters.player1 || !selectedCharacters.player2}
            onClick={onStart}
          >
            ⚔️ FIGHT! ⚔️
          </button>
          )}
          {gameMode === 'bot' && (
          <button 
            className={`start-button ${selectedCharacters.player1 ? 'active' : 'disabled'}`}
            disabled={!selectedCharacters.player1}
            onClick={onStart}
          >
            ⚔️ FIGHT BOT! ⚔️
          </button>
          )}
          <button className="back-button-select" onClick={onBackToMenu}>
            ← BACK
          </button>
        </div>
      </div>
    </div>
  );
};

export default CharacterSelect;
