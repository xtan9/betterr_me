/**
 * Lighthouse CI configuration
 * QA-005: Performance audit
 *
 * Uses default mobile throttling (simulated 4G + CPU slowdown)
 * to reflect real-world mobile usage for a habit tracker app.
 *
 * Targets:
 * - Lighthouse Performance > 90
 * - FCP < 1.8s
 * - LCP < 2.5s
 * - TTI < 3.8s
 * - CLS < 0.1
 */
module.exports = {
  ci: {
    collect: {
      url: [
        'http://localhost:3000/',
        'http://localhost:3000/auth/login',
        'http://localhost:3000/dashboard',
        'http://localhost:3000/habits',
      ],
      puppeteerScript: './scripts/lighthouse-auth.js',
      startServerCommand: 'pnpm start',
      startServerReadyPattern: 'Ready in',
      numberOfRuns: 3,
      settings: {
        // No preset = default mobile throttling (simulated slow 4G + 4x CPU)
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['warn', { minScore: 0.9 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
        'first-contentful-paint': ['error', { maxNumericValue: 1800 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'interactive': ['error', { maxNumericValue: 3800 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['warn', { maxNumericValue: 200 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
