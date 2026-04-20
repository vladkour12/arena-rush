import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', 'VITE_');
    const apiUrl = env.VITE_API_URL || 'http://localhost:3001';
    
    return {
      server: {
        port: 5173,
        strictPort: true,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: apiUrl,
            changeOrigin: true,
            secure: false
          }
        },
        headers: {
          // Permissive CSP for local development to allow API + websocket calls
          'Content-Security-Policy': "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src * ws: wss: http: https: data: blob:; script-src * 'unsafe-inline' 'unsafe-eval' data: blob:; style-src * 'unsafe-inline' data: blob:; img-src * data: blob:; font-src * data: blob:; media-src * data: blob:; worker-src * blob: data:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; manifest-src *;",
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Cross-Origin-Resource-Policy': 'cross-origin',
          'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
        },
        cors: true
      },
      plugins: [
        react(),
        {
          name: 'serve-sw',
          configureServer(server) {
            return () => {
              server.middlewares.use('/sw.js', (req, res, next) => {
                const swPath = path.join(__dirname, 'public', 'sw.js');
                res.setHeader('Content-Type', 'application/javascript');
                res.setHeader('Cache-Control', 'no-cache');
                res.end(fs.readFileSync(swPath, 'utf-8'));
              });
            };
          }
        }
      ],
      define: {
        __API_URL__: JSON.stringify(apiUrl),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || '')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        },
        dedupe: ['react', 'react-dom']
      },
      build: {
        outDir: 'dist',
        sourcemap: false,
        rollupOptions: {
          output: {
            entryFileNames: 'js/[name]-[hash].js',
            chunkFileNames: 'js/[name]-[hash].js',
            assetFileNames: '[ext]/[name]-[hash].[ext]'
          }
        }
      }
    };
});
