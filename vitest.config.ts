import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for the v3 TypeScript test suite.
 *
 * Runs via: npm run test:v3
 *
 * - Targets only src/**\/*.test.ts (v3 TypeScript tests).
 * - Uses jsdom environment to match the v2 Jest setup.
 * - Keeps the existing Jest config (jest.config.js) untouched.
 */
export default defineConfig({
  test: {
    name: 'v3',
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    globals: false,
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/tablecrafter.js'],
    },
  },
  resolve: {
    // Allow importing .ts source files directly in tests
    extensions: ['.ts', '.js'],
  },
});
