# Coding Conventions

**Analysis Date:** 2026-02-15

## Naming Patterns

**Files:**
- **Components**: kebab-case - `habit-form.tsx`, `daily-snapshot.tsx`
- **Pages**: kebab-case - `page.tsx`, `layout.tsx`, `loading.tsx`
- **API routes**: kebab-case with route params - `route.ts`, `[id]/route.ts`
- **Tests**: kebab-case with `.test` suffix - `habit-form.test.tsx`, `habits.test.ts`
- **E2E specs**: kebab-case with `.spec` suffix - `create-habit.spec.ts`
- **DB classes**: PascalCase with `DB` suffix - `HabitsDB`, `TasksDB`, `ProfilesDB`
- **Types**: kebab-case - `types.ts`, `database.ts`
- **Utils**: kebab-case - `utils.ts`, `cache.ts`, `fetcher.ts`

**Functions:**
- **Standard functions**: camelCase - `getLocalDateString()`, `getUserHabits()`, `createHabit()`
- **React components**: PascalCase - `HabitForm`, `DailySnapshot`, `LoginForm`
- **React hooks**: camelCase with `use` prefix - `useHabits()`, `useDebounce()`, `useDashboard()`
- **Async functions**: always use `async` prefix, return `Promise<T>`

**Variables:**
- **Constants**: UPPER_SNAKE_CASE - `VALID_CATEGORIES`, `STORAGE_STATE`, `CATEGORY_OPTIONS`
- **Local variables**: camelCase - `userId`, `habitData`, `completedHabitIds`
- **React state**: camelCase - `isLoading`, `habits`, `mockHabit`

**Types:**
- **Interfaces/Types**: PascalCase - `Habit`, `HabitInsert`, `HabitFormValues`
- **Type parameters**: Single uppercase letter or PascalCase - `T`, `Props`
- **Enums**: PascalCase with PascalCase values (not used - project uses union types instead)

## Code Style

**Formatting:**
- **Tool**: None configured (no Prettier, Biome, or similar)
- **Indentation**: 2 spaces (observed in all files)
- **Quotes**: Double quotes for strings in TypeScript, single quotes acceptable
- **Semicolons**: Required at statement end
- **Line length**: No enforced limit
- **Trailing commas**: Used in arrays/objects

**Linting:**
- **Tool**: ESLint 9 with Next.js config
- **Config**: `eslint.config.mjs`
- **Rules**:
  - Extends `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`
  - `components/ui/**` ignored (shadcn/ui managed)
  - Test files (`tests/**`, `e2e/**`): relax `@typescript-eslint/no-explicit-any` and `no-unused-vars`
  - Config files: disable `@typescript-eslint/no-require-imports`
- **Run**: `pnpm lint`

**TypeScript:**
- **Strict mode**: Enabled (`strict: true` in `tsconfig.json`)
- **Target**: ES2017
- **Module**: ESNext with bundler resolution
- **JSX**: `react-jsx` (new transform)

## Import Organization

**Order:**
1. External libraries (React, Next.js, third-party)
2. Internal modules by layer:
   - Components (`@/components`)
   - Library/utilities (`@/lib`)
   - Types (`@/lib/db/types`, `@/lib/types`)
3. Relative imports (`./ `, `../`)
4. Type-only imports at end (when separated)

**Path Aliases:**
- `@/*` maps to project root
- Used universally - `@/lib/db/habits`, `@/components/habits/habit-form`
- Never use relative paths crossing directory boundaries

**Example:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { HabitsDB } from '@/lib/db';
import type { HabitInsert, HabitFilters } from '@/lib/db/types';
```

## Error Handling

**API Routes:**
- **Pattern**: `try/catch` → `console.error` → `NextResponse.json({ error }, { status })`
- **Status codes**: `401` Unauthorized, `400` Bad Request, `500` Server Error, `201` Created
- **Error messages**: User-friendly strings, not stack traces
- **Example**:
```typescript
try {
  // ... operation
} catch (error) {
  console.error('GET /api/habits error:', error);
  return NextResponse.json({ error: 'Failed to fetch habits' }, { status: 500 });
}
```

**DB Layer:**
- **Throw errors**: DB classes throw errors, API routes catch them
- **Supabase errors**: Check `error.code` for specific cases (e.g., `PGRST116` = not found)
- **Example**:
```typescript
if (error) {
  if (error.code === 'PGRST116') return null;
  throw error;
}
```

**Client Components:**
- **Use toast notifications**: `sonner` for user-facing errors
- **Log to console**: For debugging, not for production visibility

## Logging

**Framework:** `console` methods (no structured logging library)

**Patterns:**
- **Server**: `console.error()` for API errors with context - `console.error('GET /api/habits error:', error)`
- **Client**: Minimal - errors logged in dev mode via test setup mocks
- **Production**: Suppress console noise in tests via `vi.spyOn(console, 'error').mockImplementation()`

**When to Log:**
- API route errors (always)
- Database operation failures (always)
- Auth failures (always)
- Client-side errors (sparingly - rely on error boundaries)

## Comments

**When to Comment:**
- **Public API functions**: JSDoc with `@param` and description
- **Complex logic**: Inline comments explaining "why", not "what"
- **Non-obvious patterns**: E.g., timezone handling, Supabase client selection
- **Type constraints**: When TypeScript can't express intent fully

**JSDoc/TSDoc:**
- Used for DB class methods and utility functions
- Format:
```typescript
/**
 * Get habits with today's completion status
 * Used for dashboard view
 */
async getHabitsWithTodayStatus(userId: string, date?: string): Promise<HabitWithTodayStatus[]>
```

**Avoid:**
- Obvious comments (`// Set user ID`)
- Commented-out code (use git history instead)
- TODO comments (use GitHub issues - this is enforced)

## Function Design

**Size:** No hard limit, but tests show functions under 100 lines. Complex operations split into helpers.

**Parameters:**
- **Order**: Required first, optional last
- **Types**: Always typed, use `?` for optional
- **Defaults**: Use default parameters - `date?: string` or `isLoading = false`
- **Destructuring**: For objects with many params

**Return Values:**
- **Explicit types**: Always declare return type - `Promise<Habit[]>`, `void`, `NextResponse`
- **Null vs undefined**: Use `null` for "no value" in DB context, `undefined` for optional/missing
- **Errors**: Throw or return `NextResponse` with error, never return error objects from DB layer

**Async Functions:**
- Always return `Promise<T>`
- Use `async/await`, not `.then()` chains
- Handle errors with `try/catch` at appropriate boundary

## Module Design

**Exports:**
- **Named exports** for components, functions, classes - `export function HabitForm()`, `export class HabitsDB`
- **Default exports** for Next.js pages/layouts only - `export default function Page()`
- **Type exports** with `export type` - `export type Habit = { ... }`

**Barrel Files:**
- Used: `lib/db/index.ts` exports all DB classes
- Pattern: Re-export specific symbols, not `export *`
```typescript
export { HabitsDB } from './habits';
export { TasksDB } from './tasks';
```

**File Organization:**
- One primary component/class per file
- Helper components in same file if tightly coupled and not reused
- Shared types in dedicated `types.ts` files

## React Conventions

**Client Components:**
- Add `"use client"` directive only when needed (hooks, events, browser APIs)
- Server components by default (Next.js 16 App Router)

**Props:**
- Interface for component props - `interface HabitFormProps { ... }`
- Use destructuring with types - `function HabitForm({ mode, onSubmit }: HabitFormProps)`

**State Management:**
- **Server state**: SWR for data fetching
- **Local state**: `useState`
- **Form state**: `react-hook-form` with Zod validation

**Hooks:**
- Custom hooks in `lib/hooks/` - `use-habits.ts`, `use-debounce.ts`
- Follow React hooks rules (only call at top level)

## Validation

**Schema Location:** `lib/validations/` - `habit.ts`, `task.ts`, `profile.ts`

**Tool:** Zod

**Pattern:**
```typescript
export const habitFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  frequency: z.discriminatedUnion("type", [ ... ]),
});

export type HabitFormValues = z.infer<typeof habitFormSchema>;
```

**Usage:**
- **Client**: `zodResolver` with `react-hook-form`
- **API**: Manual validation or inline checks (see `app/api/habits/route.ts`)

## Data Conventions

**Categories:** `"health" | "wellness" | "learning" | "productivity" | "other"`

**Frequency Types:** `"daily" | "weekdays" | "weekly" | "times_per_week" | "custom"`

**Status:** `"active" | "paused" | "archived"`

**Dates:**
- **Format**: `YYYY-MM-DD` strings
- **Timezone**: Browser-local, never UTC
- **Function**: `getLocalDateString()` from `lib/utils.ts`
- **Never use**: `new Date().toISOString().split("T")[0]` (returns UTC)

## UI Component Guidelines

**shadcn/ui:**
- Location: `components/ui/`
- **Do not edit** these files directly (managed by shadcn CLI)
- Excluded from ESLint and coverage

**Custom Components:**
- Location: `components/` organized by feature - `habits/`, `dashboard/`, `tasks/`
- Use shadcn/ui primitives as building blocks
- Apply Tailwind CSS for styling

**Styling:**
- **Framework**: Tailwind CSS 3
- **Utility**: `cn()` from `lib/utils.ts` for conditional classes
- **Theme**: `next-themes` with class-based dark mode
- **Colors**: Use semantic color names - `emerald-500`, `rose-500`

---

*Convention analysis: 2026-02-15*
