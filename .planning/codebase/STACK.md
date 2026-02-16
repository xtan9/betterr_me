# Technology Stack

**Analysis Date:** 2026-02-15

## Languages

**Primary:**
- TypeScript 5.x - All application code (strict mode enabled)
- JavaScript - Config files only (ESM modules)

**Secondary:**
- SQL - Database migrations and schema (`supabase/migrations/`)

## Runtime

**Environment:**
- Node.js v24.13.0

**Package Manager:**
- pnpm 10.11.0
- Lockfile: `pnpm-lock.yaml` (present)

## Frameworks

**Core:**
- Next.js 16.1.6 - React framework with App Router
  - Turbopack dev server (`pnpm dev --turbopack`)
  - Experimental package optimizations for lucide-react, radix-ui, date-fns
- React 19.0.0 - UI library
- React DOM 19.0.0 - DOM renderer

**Testing:**
- Vitest 4.0.18 - Unit/integration testing (jsdom environment)
  - `@vitest/coverage-v8` 4.0.18 - Coverage reporting (50% threshold)
  - `@vitest/ui` 4.0.18 - Test UI
  - `@testing-library/react` 16.3.2 - React testing utilities
  - `@testing-library/jest-dom` 6.9.1 - DOM matchers
  - `vitest-axe` 0.1.0 - Accessibility testing
- Playwright 1.58.1 - E2E testing
  - Cross-browser: Chromium, Firefox, WebKit
  - Mobile: Pixel 5, iPhone 12, iPad, 375px minimum width
  - Visual regression testing

**Build/Dev:**
- TypeScript 5.x compiler (target: ES2017, strict mode)
- ESLint 9 - Linting
  - `eslint-config-next` 16.1.6 - Next.js rules
- PostCSS 8 - CSS processing
- Autoprefixer 10.4.20 - CSS vendor prefixing
- tsx 4.21.0 - TypeScript script execution
- `@next/bundle-analyzer` 16.1.6 - Bundle size analysis

## Key Dependencies

**Critical:**
- `@supabase/ssr` 0.8.0 - Supabase SSR client (auth, database)
- `@supabase/supabase-js` 2.95.2 - Supabase JavaScript client
- `next-intl` 4.8.2 - i18n (en, zh, zh-TW locales)
- `swr` 2.4.0 - Client-side data fetching with caching
- `zod` 3.25.46 - Schema validation

**Infrastructure:**
- `react-hook-form` 7.57.0 - Form management
- `@hookform/resolvers` 5.0.1 - Zod integration for react-hook-form

**UI/Styling:**
- Tailwind CSS 3.4.1 - Utility-first CSS framework
  - `tailwindcss-animate` 1.0.7 - Animation utilities
  - `tailwind-merge` 3.3.0 - Class name merging
- `radix-ui` 1.4.3 - Unified Radix UI primitives package
- `class-variance-authority` 0.7.1 - Variant utilities
- `clsx` 2.1.1 - Class name utilities
- `next-themes` 0.4.6 - Dark mode support (class-based)
- `lucide-react` 0.511.0 - Icon library
- `sonner` 2.0.4 - Toast notifications
- `react-day-picker` 8.10.1 - Date picker component

**Utilities:**
- `date-fns` 4.1.0 - Date manipulation (browser-local timezone handling)
- `jszip` 3.10.1 - ZIP file generation for exports
- `dotenv` 17.2.4 - Environment variable loading (dev dependency)

## Configuration

**Environment:**
- Configuration: Environment variables in `.env.local` (not committed)
- Required env vars:
  - `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
  - `PLAYWRIGHT_BASE_URL` - E2E test base URL (optional, defaults to localhost:3000)
- Validation: `hasEnvVars` helper in `lib/utils.ts` checks presence

**Build:**
- `next.config.ts` - Next.js configuration with next-intl plugin
- `tsconfig.json` - TypeScript compiler options (strict, path alias `@/*`)
- `tailwind.config.ts` - Tailwind CSS theme (dark mode via class, HSL color system)
- `postcss.config.mjs` - PostCSS with Tailwind
- `vitest.config.ts` - Vitest setup (jsdom, globals, coverage thresholds)
- `playwright.config.ts` - Playwright multi-browser/device configuration
- `eslint.config.mjs` - ESLint flat config (Next.js core-web-vitals + TypeScript)

**Path Alias:**
- `@/*` resolves to project root (configured in tsconfig.json and vitest.config.ts)

## Platform Requirements

**Development:**
- Node.js v24.13.0 or compatible
- pnpm 10.11.0 or compatible
- Supabase local development (optional, via `supabase/config.toml` - PostgreSQL 15)
  - Local API port: 54321
  - Local DB port: 54322
  - Supabase Studio: 54323

**Production:**
- Next.js deployment (Vercel recommended, supports App Router and middleware)
- Supabase cloud project
- Environment variables configured in hosting platform

**CI/CD:**
- Playwright web server uses `pnpm start` (production build) in CI
- Retries: 2 in CI, 0 locally
- Workers: 2 in CI, unlimited locally

---

*Stack analysis: 2026-02-15*
