import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['game/**/*.test.ts', 'server/**/*.test.js'],
    globals: false,
  },
});
