# BetterR.Me

A personal productivity and finance web app — track habits, tasks, workouts, finances, journal entries, and chat with an AI assistant. Built with Next.js 16 and Supabase.

## Features

- **Habits** — daily/weekly habit tracking with milestones and streaks
- **Tasks** — task management with recurring tasks and project grouping
- **Journal** — journaling with cross-entry linking
- **Workouts** — exercise tracking with routines and custom exercises
- **Money** — transactions, budgets, recurring bills, savings goals, net worth tracking, bank integration (Plaid)
- **Calendar** — unified calendar view with reminders and push notifications
- **AI Chat** — conversational AI assistant powered by Claude, with conversation persistence and auto-generated titles
- **Dashboard** — overview with insights across all domains
- **Admin** — admin dashboard for system management (role-based access)
- **i18n** — English, Simplified Chinese, Traditional Chinese
- **Dark mode** — system-aware with manual toggle

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 16](https://nextjs.org) (App Router, Turbopack) |
| Auth & DB | [Supabase](https://supabase.com) SSR (`@supabase/ssr`) |
| UI | [shadcn/ui](https://ui.shadcn.com) + [Radix UI](https://www.radix-ui.com) + [Tailwind CSS 3](https://tailwindcss.com) |
| Forms | react-hook-form + zod |
| Data fetching | SWR (client), fetch (server) |
| AI | [Vercel AI SDK](https://sdk.vercel.ai) + Claude via [llm-gateway](https://github.com/xtan9/llm-gateway) proxy |
| i18n | next-intl (en, zh, zh-TW) |
| Theming | next-themes (class-based dark mode) |
| Email | Resend |
| Banking | Plaid |
| Push | Web Push (VAPID) |
| Testing | Vitest + Testing Library + vitest-axe + Playwright |
| Package manager | pnpm |

## Getting Started

1. Clone the repository

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   ```
   Required variables:
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase project
   - `SUPABASE_SERVICE_ROLE_KEY` — service-role key for admin operations
   - `LLM_API_KEY` — API key for the LLM proxy (AI chat feature)

4. Run the development server:
   ```bash
   pnpm dev
   ```

## Scripts

```bash
pnpm dev                # Start dev server (Turbopack)
pnpm build              # Production build
pnpm lint               # ESLint
pnpm test:run           # Vitest single run
pnpm test:coverage      # Vitest with v8 coverage
pnpm test:e2e:chromium  # Playwright (Chromium only)
```

## License

MIT
