import React, { useEffect, useRef, useState } from 'react';
import { CHARACTERS, ARENA_WIDTH, ARENA_HEIGHT, ARENA_CENTER } from '../constants';
import { GameState, Player, Ability } from '../types';

interface ArenaProps {
  player1Character: string;
  player2Character: string;
  onGameEnd: (winner: 1 | 2, scores: { player1: number; player2: number }, duration: number) => void;
}

const Arena: React.FC<ArenaProps> = ({ player1Character, player2Character, onGameEnd }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameStateRef = useRef<GameState>('arena');
  const gameStartTimeRef = useRef<number>(Date.now());
  
  // Game state
  const [gameTime, setGameTime] = useState(0);
  const [player1Health, setPlayer1Health] = useState(CHARACTERS[player1Character].maxHealth);
  const [player2Health, setPlayer2Health] = useState(CHARACTERS[player2Character].maxHealth);
  const [player1Mana, setPlayer1Mana] = useState(CHARACTERS[player1Character].maxMana);
  const [player2Mana, setPlayer2Mana] = useState(CHARACTERS[player2Character].maxMana);

  // Players and game objects
  const playersRef = useRef<{ [key: number]: Player }>({
    1: {
      playerNumber: 1,
      position: { x: ARENA_CENTER.x - 200, y: ARENA_CENTER.y },
      velocity: { x: 0, y: 0 },
      angle: 0,
      health: CHARACTERS[player1Character].maxHealth,
      mana: CHARACTERS[player1Character].maxMana,
      dodging: false,
      dodgeEndTime: 0
    },
    2: {
      playerNumber: 2,
      position: { x: ARENA_CENTER.x + 200, y: ARENA_CENTER.y },
      velocity: { x: 0, y: 0 },
      angle: Math.PI,
      health: CHARACTERS[player2Character].maxHealth,
      mana: CHARACTERS[player2Character].maxMana,
      dodging: false,
      dodgeEndTime: 0
    }
  });

  const keysRef = useRef<{ [key: string]: boolean }>({});
  const projectilesRef = useRef<any[]>([]);

  // Input handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const gameLoop = () => {
      const players = playersRef.current;
      
      // Update time
      setGameTime((Date.now() - gameStartTimeRef.current) / 1000);

      // Player 1 controls (WASD or Arrow Keys)
      const p1Move = { x: 0, y: 0 };
      if (keysRef.current['w'] || keysRef.current['arrowup']) p1Move.y -= 1;
      if (keysRef.current['s'] || keysRef.current['arrowdown']) p1Move.y += 1;
      if (keysRef.current['a'] || keysRef.current['arrowleft']) p1Move.x -= 1;
      if (keysRef.current['d'] || keysRef.current['arrowright']) p1Move.x += 1;

      // Player 2 controls (IJKL)
      const p2Move = { x: 0, y: 0 };
      if (keysRef.current['i']) p2Move.y -= 1;
      if (keysRef.current['k']) p2Move.y += 1;
      if (keysRef.current['j']) p2Move.x -= 1;
      if (keysRef.current['l']) p2Move.x += 1;

      const movePlayer = (player: Player, moveVec: any, charId: string) => {
        const speed = CHARACTERS[charId].stats.movementSpeed;
        const magnitude = Math.sqrt(moveVec.x ** 2 + moveVec.y ** 2);
        
        if (magnitude > 0) {
          player.velocity.x = (moveVec.x / magnitude) * speed;
          player.velocity.y = (moveVec.y / magnitude) * speed;
          player.angle = Math.atan2(moveVec.y, moveVec.x);
        } else {
          player.velocity.x = 0;
          player.velocity.y = 0;
        }

        // Update position
        player.position.x += player.velocity.x / 60;
        player.position.y += player.velocity.y / 60;

        // Clamp to arena
        player.position.x = Math.max(25, Math.min(ARENA_WIDTH - 25, player.position.x));
        player.position.y = Math.max(25, Math.min(ARENA_HEIGHT - 25, player.position.y));

        // Update dodge
        if (player.dodging && Date.now() > player.dodgeEndTime) {
          player.dodging = false;
        }
      };

      movePlayer(players[1], p1Move, player1Character);
      movePlayer(players[2], p2Move, player2Character);

      // Regenerate mana
      const manaRegenRate = 10;
      players[1].mana = Math.min(CHARACTERS[player1Character].maxMana, players[1].mana + manaRegenRate / 60);
      players[2].mana = Math.min(CHARACTERS[player2Character].maxMana, players[2].mana + manaRegenRate / 60);

      // Update health state
      setPlayer1Health(players[1].health);
      setPlayer2Health(players[2].health);
      setPlayer1Mana(players[1].mana);
      setPlayer2Mana(players[2].mana);

      // Check win condition
      if (players[1].health <= 0) {
        onGameEnd(2, { player1: 0, player2: 100 }, gameTime);
        return;
      }
      if (players[2].health <= 0) {
        onGameEnd(1, { player1: 100, player2: 0 }, gameTime);
        return;
      }

      // Draw game
      ctx.fillStyle = '#0a0e27';
      ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

      // Draw arena border
      ctx.strokeStyle = '#4169E1';
      ctx.lineWidth = 3;
      ctx.strokeRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

      // Draw players
      const drawPlayer = (player: Player, charId: string) => {
        const char = CHARACTERS[charId];
        ctx.fillStyle = char.color;
        ctx.beginPath();
        ctx.arc(player.position.x, player.position.y, 25, 0, Math.PI * 2);
        ctx.fill();

        // Direction indicator
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(player.position.x, player.position.y);
        ctx.lineTo(
          player.position.x + Math.cos(player.angle) * 35,
          player.position.y + Math.sin(player.angle) * 35
        );
        ctx.stroke();

        // Dodging effect
        if (player.dodging) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(player.position.x, player.position.y, 30, 0, Math.PI * 2);
          ctx.stroke();
        }
      };

      drawPlayer(players[1], player1Character);
      drawPlayer(players[2], player2Character);

      // Draw HUD
      drawHUD(ctx);

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    const drawHUD = (ctx: CanvasRenderingContext2D) => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, ARENA_WIDTH, 60);

      // Player 1 HUD
      ctx.fillStyle = '#4169E1';
      ctx.font = 'bold 14px Arial';
      ctx.fillText(CHARACTERS[player1Character].name, 10, 20);
      
      // Health bar
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(10, 25, (player1Health / CHARACTERS[player1Character].maxHealth) * 150, 12);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(10, 25, 150, 12);
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px Arial';
      ctx.fillText(`${Math.floor(player1Health)}/${CHARACTERS[player1Character].maxHealth}`, 20, 37);

      // Mana bar
      ctx.fillStyle = '#0099ff';
      ctx.fillRect(10, 42, (player1Mana / CHARACTERS[player1Character].maxMana) * 150, 8);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(10, 42, 150, 8);

      // Player 2 HUD
      ctx.fillStyle = '#FF69B4';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'right';
      ctx.fillText(CHARACTERS[player2Character].name, ARENA_WIDTH - 10, 20);
      
      // Health bar
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ff0000';
      const p2HealthWidth = (player2Health / CHARACTERS[player2Character].maxHealth) * 150;
      ctx.fillRect(ARENA_WIDTH - 160, 25, p2HealthWidth, 12);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(ARENA_WIDTH - 160, 25, 150, 12);
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px Arial';
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.floor(player2Health)}/${CHARACTERS[player2Character].maxHealth}`, ARENA_WIDTH - 20, 37);

      // Mana bar
      ctx.fillStyle = '#0099ff';
      const p2ManaWidth = (player2Mana / CHARACTERS[player2Character].maxMana) * 150;
      ctx.fillRect(ARENA_WIDTH - 160, 42, p2ManaWidth, 8);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(ARENA_WIDTH - 160, 42, 150, 8);

      // Game time
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${gameTime.toFixed(1)}s`, ARENA_WIDTH / 2, 25);
    };

    gameLoop();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [player1Character, player2Character, gameTime, onGameEnd, player1Health, player2Health, player1Mana, player2Mana]);

  return (
    <div className="arena-container">
      <canvas
        ref={canvasRef}
        width={ARENA_WIDTH}
        height={ARENA_HEIGHT}
        className="arena-canvas"
      />
      <div className="arena-controls">
        <div className="control-group">
          <h4>Player 1 (WASD/Arrows)</h4>
          <p>Q: Ability 1 | W: Ability 2 | E: Ability 3 | R: Ultimate</p>
          <p>SPACE: Dodge</p>
        </div>
        <div className="control-group">
          <h4>Player 2 (IJKL)</h4>
          <p>U: Ability 1 | I: Ability 2 | O: Ability 3 | P: Ultimate</p>
          <p>SHIFT: Dodge</p>
        </div>
      </div>
    </div>
  );
};

export default Arena;
