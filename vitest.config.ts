import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'client/**/*.test.tsx'],
    environment: 'node',
  },
});
