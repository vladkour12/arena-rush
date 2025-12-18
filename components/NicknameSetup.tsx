import React, { useState } from 'react';
import { User } from 'lucide-react';
import { NICKNAME_REGEX, NICKNAME_MIN_LENGTH, NICKNAME_MAX_LENGTH } from '../constants';

interface NicknameSetupProps {
  onComplete: (nickname: string) => void;
}

export const NicknameSetup: React.FC<NicknameSetupProps> = ({ onComplete }) => {
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmed = nickname.trim();
    
    if (trimmed.length < NICKNAME_MIN_LENGTH) {
      setError(`Nickname must be at least ${NICKNAME_MIN_LENGTH} characters`);
      return;
    }
    
    if (trimmed.length > NICKNAME_MAX_LENGTH) {
      setError(`Nickname must be less than ${NICKNAME_MAX_LENGTH} characters`);
      return;
    }
    
    if (!NICKNAME_REGEX.test(trimmed)) {
      setError('Only letters, numbers, and underscores allowed');
      return;
    }
    
    onComplete(trimmed);
  };

  return (
    <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-[100] p-4">
      <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl max-w-md w-full border border-slate-700">
        <div className="flex items-center justify-center mb-6">
          <div className="p-4 bg-emerald-600 rounded-full">
            <User className="w-8 h-8 text-white" />
          </div>
        </div>
        
        <h2 className="text-3xl font-bold text-white text-center mb-2">Welcome Warrior!</h2>
        <p className="text-slate-400 text-center mb-6">Enter your battle name</p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value);
                setError('');
              }}
              placeholder="Your Nickname"
              className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white text-center text-lg focus:outline-none focus:border-emerald-500 transition-colors"
              autoFocus
              maxLength={NICKNAME_MAX_LENGTH}
            />
            {error && (
              <p className="text-red-400 text-sm mt-2 text-center">{error}</p>
            )}
          </div>
          
          <button
            type="submit"
            disabled={nickname.trim().length < NICKNAME_MIN_LENGTH}
            className="w-full bg-gradient-to-r from-emerald-500 to-green-600 text-white font-bold py-4 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:from-emerald-600 hover:to-green-700 transition-all duration-200 hover:shadow-lg hover:shadow-emerald-600/50 hover:scale-[1.02] active:scale-95"
          >
            Enter Arena
          </button>
        </form>
        
        <p className="text-slate-500 text-xs text-center mt-4">
          {NICKNAME_MIN_LENGTH}-{NICKNAME_MAX_LENGTH} characters • Letters, numbers, and underscores only
        </p>
      </div>
    </div>
  );
};
