import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './tests/setup.ts',
    exclude: [...configDefaults.exclude, 'e2e/**', '.worktrees/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.{js,ts,mjs}',
        '**/components/ui/**', // Exclude shadcn/ui components (third-party)
        '.next/',
        'coverage/',
        // Data, templates, thin wrappers, re-exports — no logic to test
        'i18n/messages/**',
        'lib/db/index.ts',
        'lib/constants.ts',
        '**/ndi-exercise-catalog.json',
        'emails/**',
        'app/**/layout.tsx',
        'app/**/loading.tsx',
        'app/**/error.tsx',
        'e2e/**',
      ],
      thresholds: {
        // Recommended thresholds for new code
        lines: 50,
        functions: 50,
        branches: 50,
        statements: 50,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
