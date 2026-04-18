import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './tests/setup.ts',
    exclude: [
      ...configDefaults.exclude,
      'e2e/**',
      '.worktrees/**',
      '.claude/**',
    ],
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
        '.claude/**',
        'coverage/',
        // Data, templates, thin wrappers, re-exports — no logic to test
        'i18n/messages/**',
        'lib/**/index.ts', // barrel re-exports
        'lib/constants.ts',
        '**/ndi-exercise-catalog.json',
        'emails/**',
        'app/**/layout.tsx',
        'app/**/loading.tsx',
        'app/**/error.tsx',
        'e2e/**',
      ],
      thresholds: {
        // Locked in by the coverage improvement effort (docs/superpowers/
        // specs/2026-04-12-coverage-improvement-design.md). These reflect
        // actual coverage with a small regression cushion. Raise over time
        // as further tests land — do not lower without a documented reason.
        //
        // Current baseline (post-PR 427): 90.33 stmts / 83.36 branches /
        // 89.75 functions / 91.83 lines.
        lines: 90,
        statements: 89,
        functions: 88,
        branches: 82,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
