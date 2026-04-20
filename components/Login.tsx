import React, { useState } from 'react';
import { getApiUrl } from '../utils/api';

interface LoginProps {
  onLogin: (userId: string, username: string) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(getApiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });

      if (!response.ok) {
        throw new Error('Login failed');
      }

      const data = await response.json();
      onLogin(data.userId, data.username);
    } catch (err) {
      setError('Connection error. Make sure the server is running on port 3001');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-bg"></div>
      
      <div className="login-container">
        <div className="login-glow"></div>

        <div className="login-content">
          <h1 className="login-title">⚔️ ARENA RUSH ⚔️</h1>
          <p className="login-subtitle">Enter the Arena</p>

          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label htmlFor="username">USERNAME</label>
              <input
                id="username"
                type="text"
                placeholder="Enter your username..."
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="login-input"
                disabled={loading}
                maxLength={20}
                autoFocus
              />
            </div>

            {error && <div className="login-error">{error}</div>}

            <button
              type="submit"
              className="login-button"
              disabled={loading || !username.trim()}
            >
              {loading ? 'CONNECTING...' : 'PLAY NOW'}
            </button>
          </form>

          <div className="login-info">
            <p>🌐 Online Multiplayer</p>
            <p>👥 Add Friends</p>
            <p>🎮 Create Rooms</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
