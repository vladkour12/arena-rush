import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingScreenProps {
  progress: number;
  message?: string;
}

export function LoadingScreen({ progress, message }: LoadingScreenProps) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 z-50">
      <div className="text-center space-y-6 p-8">
        {/* Logo/Title */}
        <h1 className="text-5xl font-bold text-white mb-8">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600">
            Arena Rush
          </span>
        </h1>
        
        {/* Animated Spinner */}
        <div className="flex justify-center">
          <Loader2 className="w-16 h-16 text-blue-500 animate-spin" />
        </div>
        
        {/* Progress Bar */}
        <div className="w-80 mx-auto">
          <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-slate-400 mt-3 text-sm">
            {message || 'Loading assets...'}
          </p>
          <p className="text-slate-500 mt-1 text-xs">
            {Math.round(progress)}%
          </p>
        </div>
        
        {/* Loading tips */}
        <div className="mt-8 text-slate-400 text-sm max-w-md mx-auto">
          <p className="italic">
            {progress < 30 && "Tip: Use dash to dodge enemy fire!"}
            {progress >= 30 && progress < 60 && "Tip: Collect weapon crates to upgrade your arsenal!"}
            {progress >= 60 && "Tip: Health crates restore 50 HP!"}
          </p>
        </div>
      </div>
    </div>
  );
}
