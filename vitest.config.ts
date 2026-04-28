import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(require('./package.json').version),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    css: false,
    exclude: ['**/node_modules/**', '**/.claude/worktrees/**', '**/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/__tests__/**', 'src/**/*.test.*', 'src/**/*.d.ts'],
      thresholds: {
        statements: 39.5,
        branches: 30.5,
        functions: 35.5,
        lines: 41.5,
      },
    },
  },
});
