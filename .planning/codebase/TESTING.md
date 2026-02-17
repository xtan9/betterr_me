# Testing Patterns

**Analysis Date:** 2026-02-15

## Test Framework

**Runner:**
- Vitest 4.0.18
- Config: `vitest.config.ts`

**Assertion Library:**
- Vitest built-in (Jest-compatible)
- `@testing-library/jest-dom` for DOM matchers

**Run Commands:**
```bash
pnpm test              # Watch mode
pnpm test:run          # Single run
pnpm test:coverage     # With v8 coverage
pnpm test:ui           # Vitest UI
```

**Configuration:**
- Environment: `jsdom` (DOM simulation)
- Globals: `true` (no need to import `describe`, `it`, `expect`)
- Setup: `tests/setup.ts` (global mocks and polyfills)

## Test File Organization

**Location:**
- **Unit/integration tests**: Co-located pattern - `tests/` directory mirrors source structure
  - Components: `tests/components/habits/habit-form.test.tsx`
  - DB layer: `tests/lib/db/habits.test.ts`
  - API routes: `tests/app/api/habits/route.test.ts`
  - Utilities: `tests/lib/utils.test.ts`

**Naming:**
- **Pattern**: `{filename}.test.{ts,tsx}`
- **E2E tests**: `e2e/{feature}.spec.ts`

**Structure:**
```
tests/
├── components/           # Component tests
├── app/                  # Page and API route tests
├── lib/                  # Utility and business logic tests
├── hooks/                # Custom hook tests
├── accessibility/        # Accessibility tests
└── setup.ts              # Global test setup
```

## Test Structure

**Suite Organization:**
```typescript
describe('HabitsDB', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserHabits', () => {
    it('should fetch all habits for a user', async () => {
      mockSupabaseClient.setMockResponse([mockHabit]);

      const habits = await habitsDB.getUserHabits(mockUserId);

      expect(habits).toEqual([mockHabit]);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('habits');
    });
  });
});
```

**Patterns:**
- **Outer `describe`**: Class or component name
- **Nested `describe`**: Method or feature area
- **`it`**: Specific behavior - use "should" phrasing
- **Setup**: `beforeEach` for mock clearing
- **AAA pattern**: Arrange, Act, Assert (clear separation)

## Mocking

**Framework:** Vitest (`vi.mock`, `vi.fn`, `vi.spyOn`)

### Mocking Patterns

**Supabase (DB layer):**
Global mock in `tests/setup.ts` using `MockQueryBuilder`:
```typescript
import { mockSupabaseClient } from '../../setup';

mockSupabaseClient.setMockResponse([mockData]);
const result = await habitsDB.getUserHabits(userId);
```

**Supabase (API routes):**
Use `vi.hoisted` to hoist mock functions, then mock DB classes:
```typescript
const { mockGetUserHabits } = vi.hoisted(() => ({
  mockGetUserHabits: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  HabitsDB: class {
    getUserHabits = mockGetUserHabits;
  },
}));

// Later in test:
mockGetUserHabits.mockResolvedValue([mockHabit]);
```

**SWR:**
```typescript
vi.mock('swr', () => ({
  default: (key: any, fetcher: any) => mockSWR(key, fetcher),
}));
```

**next-intl:**
Return translation keys or provide mock translations:
```typescript
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
```

For real translations in tests:
```typescript
import { NextIntlClientProvider } from 'next-intl';

render(
  <NextIntlClientProvider locale="en" messages={messages}>
    <Component />
  </NextIntlClientProvider>
);
```

**next/navigation:**
```typescript
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/habits',
}));
```

**Supabase Client Factory (API routes):**
```typescript
function mockSupabaseClient(overrides?: { user?: { id: string } | null }) {
  const user = overrides?.user !== undefined ? overrides.user : { id: 'user-123' };
  return {
    auth: { getUser: vi.fn(() => ({ data: { user } })) },
    from: vi.fn(() => ({ /* chainable query mock */ })),
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => mockSupabaseClient()),
}));
```

### What to Mock

**Always mock:**
- External APIs (Supabase, fetch)
- Browser APIs (ResizeObserver, scrollIntoView, pointer capture)
- Next.js framework (router, navigation, Link)
- i18n (next-intl)

**Never mock:**
- Business logic under test
- Pure utility functions (e.g., `getLocalDateString` - test it directly)
- Types

## Fixtures and Factories

**Test Data:**
Inline mock data close to tests:
```typescript
const mockHabit: Habit = {
  id: 'habit-123',
  user_id: 'user-123',
  name: 'Morning Run',
  category: 'health',
  frequency: { type: 'daily' },
  status: 'active',
  current_streak: 5,
  best_streak: 12,
  paused_at: null,
  created_at: '2026-01-30T10:00:00Z',
  updated_at: '2026-01-30T10:00:00Z',
};
```

**Location:**
- Defined at top of test file or in `describe` block
- No shared fixture files (keeps tests independent)

**E2E Test Data:**
- Prefix with `E2E Test -` for cleanup in global teardown
- Example: `'E2E Test - Morning Run'`

## Coverage

**Provider:** v8

**Thresholds:**
```typescript
thresholds: {
  lines: 50,
  functions: 50,
  branches: 50,
  statements: 50,
}
```

**Exclusions:**
- `node_modules/`
- `tests/`
- `**/*.d.ts`
- `**/*.config.{js,ts,mjs}`
- `components/ui/**` (shadcn/ui third-party)
- `.next/`, `coverage/`

**View Coverage:**
```bash
pnpm test:coverage
open coverage/index.html
```

**Current Status:**
- Target: 50% for all metrics
- Known failures: 2 tests in `habit-logs.test.ts` (`times_per_week getDetailedHabitStats`) - tracked in issue #98

## Test Types

**Unit Tests:**
- **Scope**: Single function, method, or component in isolation
- **Location**: `tests/lib/`, `tests/components/`
- **Pattern**: Mock all dependencies, test one unit
- **Example**: `tests/lib/utils.test.ts`, `tests/lib/db/habits.test.ts`

**Integration Tests:**
- **Scope**: Multiple units working together (component + hooks, API route + DB)
- **Location**: `tests/app/api/`, `tests/components/`
- **Pattern**: Mock external services (Supabase), test integration points
- **Example**: `tests/app/api/habits/route.test.ts` (API route + DB class)

**Component Tests:**
- **Scope**: React component rendering and user interactions
- **Location**: `tests/components/`
- **Tools**: `@testing-library/react`, `@testing-library/user-event`
- **Pattern**: Render, interact via user events, assert DOM state
- **Example**: `tests/components/habits/habit-form.test.tsx`

**Accessibility Tests:**
- **Scope**: WCAG 2.1 AA compliance
- **Location**: `tests/accessibility/a11y.test.tsx` (unit), `e2e/accessibility.spec.ts` (E2E)
- **Tools**: `vitest-axe` (unit), manual checks (E2E)
- **Pattern**:
  ```typescript
  const { container } = render(<Component />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
  ```

**E2E Tests:**
- **Framework**: Playwright 1.58.1
- **Location**: `e2e/`
- **Config**: `playwright.config.ts`
- **Projects**: chromium, firefox, webkit, mobile-chrome, mobile-safari, mobile-small, tablet, visual-regression
- **Run**:
  ```bash
  pnpm test:e2e:chromium     # Fastest (Chromium + visual regression only)
  pnpm test:e2e              # All browsers
  ```

## Common Patterns

**Async Testing:**
```typescript
it('should create a new habit', async () => {
  mockCreateHabit.mockResolvedValue(mockHabit);

  const habit = await habitsDB.createHabit(newHabit);

  expect(habit).toEqual(mockHabit);
});
```

**Error Testing:**
```typescript
it('should handle database errors', async () => {
  mockSupabaseClient.setMockResponse(null, { message: 'DB error' });

  await expect(habitsDB.getUserHabits(userId)).rejects.toEqual({ message: 'DB error' });
});
```

**User Event Testing:**
```typescript
import userEvent from '@testing-library/user-event';

it('submits form with valid data', async () => {
  const user = userEvent.setup();
  render(<HabitForm onSubmit={mockOnSubmit} />);

  await user.type(screen.getByLabelText('Habit Name'), 'Read Books');
  await user.click(screen.getByRole('button', { name: 'Create Habit' }));

  await waitFor(() => {
    expect(mockOnSubmit).toHaveBeenCalledWith(/* ... */);
  });
});
```

**API Route Testing:**
```typescript
import { NextRequest } from 'next/server';

it('should return habits for authenticated user', async () => {
  mockGetUserHabits.mockResolvedValue([mockHabit]);

  const request = new NextRequest('http://localhost:3000/api/habits');
  const response = await GET(request);
  const data = await response.json();

  expect(response.status).toBe(200);
  expect(data.habits).toEqual([mockHabit]);
});
```

**Accessibility (axe):**
```typescript
import { axe } from 'vitest-axe';
import * as matchers from 'vitest-axe/matchers';

expect.extend(matchers);

it('should have no axe violations', async () => {
  const { container } = render(<LoginForm />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

**E2E Page Object Pattern:**
```typescript
// e2e/pages/create-habit.page.ts
export class CreateHabitPage {
  constructor(private page: Page) {}

  async goto() { await this.page.goto('/habits/new'); }
  async fillName(name: string) { await this.nameInput.fill(name); }
  async submit() { await this.submitButton.click(); }

  get nameInput() { return this.page.getByLabel('Habit Name'); }
  get submitButton() { return this.page.getByRole('button', { name: /create/i }); }
}

// In test:
const createPage = new CreateHabitPage(page);
await createPage.goto();
await createPage.fillName('E2E Test - Morning Run');
await createPage.submit();
```

## E2E Testing (Playwright)

**Configuration:**
- Auth setup: `e2e/global-setup.ts` saves session to `e2e/storage-state.json`
- Teardown: `e2e/global-teardown.ts` cleans up test data (prefixed with `E2E Test -`)
- Base URL: `http://localhost:3000` (configurable via `PLAYWRIGHT_BASE_URL`)
- Timeout: 30s per test
- Retries: 2 in CI, 0 locally
- Workers: 2 in CI, unlimited locally

**Project Dependencies:**
- `visual-regression` runs first (avoid data pollution from habit-creation tests)
- Other projects depend on `setup` for auth

**Browser Coverage:**
- Desktop: Chrome, Firefox, Safari
- Mobile: Pixel 5, iPhone 12, small viewport (375px)
- Tablet: iPad (gen 7)

**Visual Regression:**
- Project: `visual-regression`
- Snapshots: `e2e/{test}-snapshots/{name}-chromium-{platform}.png`
- Tool: Playwright's built-in `toHaveScreenshot()`

**Helper Functions:**
- `e2e/helpers/auth.ts` - `login()`, `ensureAuthenticated()`
- `e2e/constants.ts` - `STORAGE_STATE` path

**Example:**
```typescript
test('should create a daily habit successfully', async ({ page }) => {
  const createPage = new CreateHabitPage(page);
  await createPage.goto();

  await createPage.fillName('E2E Test - Morning Run');
  await createPage.selectCategory('health');
  await createPage.submit();

  await expect(page.getByText('E2E Test - Morning Run').first()).toBeVisible();
});
```

## Test Utilities

**Setup File (`tests/setup.ts`):**
- Silences console noise (`console.error`, `console.warn`)
- Mocks `ResizeObserver`, `scrollIntoView`, pointer capture APIs
- Provides `MockQueryBuilder` for Supabase client mocking
- Global mocks for `@/lib/supabase/client`

**Custom Matchers:**
- `toHaveNoViolations()` from `vitest-axe/matchers`
- `toBeInTheDocument()`, `toHaveAttribute()` from `@testing-library/jest-dom`

---

*Testing analysis: 2026-02-15*
