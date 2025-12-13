import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig(({ mode }) => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        mode === 'production' &&
          visualizer({
            filename: 'dist/stats.html',
            gzipSize: true,
            brotliSize: true,
            template: 'treemap',
          }),
      ].filter(Boolean),
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (!id.includes('node_modules')) return;
              if (id.includes('lucide-react')) return 'icons';

              // React 19 splits across many entry points (e.g. react-dom/client, jsx-runtime, scheduler).
              if (
                id.includes('/react/') ||
                id.includes('/react-dom/') ||
                id.includes('/react-dom-client/') ||
                id.includes('/react-refresh/') ||
                id.includes('/scheduler/')
              ) {
                return 'react';
              }
            },
          },
        },
      },
    };
});
