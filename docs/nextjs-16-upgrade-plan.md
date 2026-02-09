# Next.js 16 Upgrade Plan

**Author:** Engineering
**Status:** Draft
**Target:** Next.js 15.5.8 → 16.1.6
**Risk Level:** Low-Medium
**Estimated Effort:** 1–2 hours (implementation) + 1 hour (validation)

---

## 1. Executive Summary

This plan covers upgrading BetterR.Me from Next.js 15.5.8 to 16.1.6. The upgrade is low-risk because the codebase already adopts all Next.js 15 async patterns (async `params`, `cookies()`, `headers()`), uses no experimental features, and has no custom webpack configuration. The primary changes are mechanical renames (`middleware` → `proxy`) and an ESLint migration (`next lint` → ESLint CLI).

---

## 2. Current State Audit

### 2.1 Versions

| Package | Current | Target | Peer-dep Compatible? |
|---------|---------|--------|---------------------|
| `next` | 15.5.8 | 16.1.6 | N/A |
| `react` / `react-dom` | ^19.0.0 | ^19.0.0 (unchanged) | Yes |
| `next-intl` | ^4.1.0 | ^4.8.2 | Yes (`^16.0.0` in peers) |
| `next-themes` | ^0.4.6 | ^0.4.6 (unchanged) | Yes (no `next` peer dep) |
| `@supabase/ssr` | ^0.8.0 | ^0.8.0 (unchanged) | Yes (no `next` peer dep) |
| `eslint-config-next` | 15.3.1 | 16.1.6 | Yes |
| `swr` | ^2.4.0 | ^2.4.0 (unchanged) | Yes (no `next` peer dep) |

### 2.2 Codebase Surface Area

| Area | Count | Already Next.js 15 Compliant? |
|------|-------|-------------------------------|
| `page.tsx` files | 14 | Yes |
| `layout.tsx` files | 3 | Yes |
| API `route.ts` files | 14 | Yes (async `params`) |
| Files using `next/server` | 28 | Yes |
| Files using `next/navigation` | 24 | Yes |
| Files using `next/headers` | 2 | Yes (async `cookies()`/`headers()`) |
| Middleware files | 2 | Rename required |
| Experimental/unstable APIs | 0 | N/A |
| Custom webpack config | None | N/A |

---

## 3. Breaking Changes Analysis

### 3.1 Affects Us (Action Required)

#### 3.1.1 Middleware → Proxy Rename

**What changed:** `middleware.ts` is deprecated. The file must be renamed to `proxy.ts` and the exported function renamed from `middleware` to `proxy`. The proxy runtime uses Node.js and does not support the edge runtime.

**Files to modify:**

| File | Change |
|------|--------|
| `middleware.ts` | Rename to `proxy.ts`, rename export `middleware` → `proxy` |
| `lib/supabase/middleware.ts` | Rename to `lib/supabase/proxy.ts` (no export rename needed — exports `updateSession`) |
| `proxy.ts` (new) | Update import path from `@/lib/supabase/middleware` → `@/lib/supabase/proxy` |
| `CLAUDE.md` | Update references to "Middleware" section |

**Risk:** Low. The `updateSession` function signature and `NextRequest`/`NextResponse` APIs are unchanged. This is a mechanical rename.

#### 3.1.2 `next lint` Removed — ESLint CLI Migration

**What changed:** The `next lint` command is removed in Next.js 16. Projects must use the ESLint CLI directly.

**Files to modify:**

| File | Current | Target |
|------|---------|--------|
| `package.json` script | `"lint": "next lint"` | `"lint": "eslint ."` |
| `.github/workflows/ci.yml` | `pnpm lint` (unchanged command, but underlying tool changes) | No change needed — `pnpm lint` still works |
| `eslint.config.mjs` | Uses `next/core-web-vitals`, `next/typescript` via FlatCompat | May need adjustment if `eslint-config-next@16` changes exports |

**Risk:** Low-Medium. The ESLint flat config already exists. The main risk is if `eslint-config-next@16` changes its export structure. The FlatCompat adapter should handle this, but needs verification.

#### 3.1.3 `eslint-config-next` Version Bump

**What changed:** Must upgrade from `15.3.1` to `16.x` to match the new Next.js version.

**Note:** There is already a version skew — `eslint-config-next@15.3.1` with `next@15.5.8`. This upgrade resolves it.

### 3.2 Does NOT Affect Us (No Action Required)

| Breaking Change | Why It Doesn't Apply |
|----------------|---------------------|
| Async `params` in dynamic routes | Already using `Promise<{ id: string }>` + `await params` |
| Async `cookies()` / `headers()` | Already using `await cookies()` / `await headers()` |
| `experimental.dynamicIO` removed | Not using any experimental features |
| Sitemap async `id` parameter | Not using sitemap generation |
| `unstable_` prefix removal | No `unstable_` APIs in use |
| `experimental_ppr` removal | Not using PPR |
| `next/image` changes | Not using `next/image` |
| Server Actions changes | Not using Server Actions |
| `cacheComponents` config | Not using component caching |

---

## 4. Dependency Compatibility

### 4.1 next-intl (^4.1.0 → ^4.8.2)

**Status: Compatible.** `next-intl@4.8.2` declares `next: ^16.0.0` in its `peerDependencies`.

**Integration points:**
- `next.config.ts`: `createNextIntlPlugin('./i18n/request.ts')` — plugin wrapping, verify it works with Next.js 16 config format
- `i18n/request.ts`: Uses `cookies()` and `headers()` from `next/headers` — already async
- No middleware chaining — uses plugin-based integration (no proxy file interaction)

**Action:** Bump to `^4.8.2`. Run lint + tests.

### 4.2 @supabase/ssr (^0.8.0)

**Status: Compatible.** No `next` peer dependency. Uses standard `NextRequest`/`NextResponse` APIs which are unchanged in Next.js 16. Supabase docs already show the `proxy` pattern.

**Action:** No version change needed. Rename `lib/supabase/middleware.ts` → `lib/supabase/proxy.ts`.

### 4.3 next-themes (^0.4.6)

**Status: Compatible.** No `next` peer dependency. Uses React context only.

**Action:** None.

### 4.4 swr (^2.4.0)

**Status: Compatible.** No `next` peer dependency. Uses vanilla `fetch`.

**Action:** None.

### 4.5 radix-ui (^1.4.3)

**Status: Compatible.** Framework-agnostic React components.

**Action:** None.

---

## 5. Implementation Plan

### Phase 1: Upgrade Dependencies (5 min)

```bash
# Use the Next.js codemod (handles next.config, proxy rename, ESLint migration)
npx @next/codemod@latest upgrade

# Or manually:
pnpm add next@16.1.6 next-intl@^4.8.2
pnpm add -D eslint-config-next@16.1.6
```

### Phase 2: Middleware → Proxy Rename (10 min)

If the codemod doesn't handle this automatically:

1. Rename `middleware.ts` → `proxy.ts`
2. Rename `lib/supabase/middleware.ts` → `lib/supabase/proxy.ts`
3. In `proxy.ts`, change:
   ```typescript
   // Before
   import { updateSession } from "@/lib/supabase/middleware";
   export async function middleware(request: NextRequest) {

   // After
   import { updateSession } from "@/lib/supabase/proxy";
   export async function proxy(request: NextRequest) {
   ```
4. Verify `export const config` matcher is unchanged

### Phase 3: ESLint Migration (15 min)

1. Update `package.json`:
   ```json
   "lint": "eslint ."
   ```
2. Verify `eslint.config.mjs` works with `eslint-config-next@16`:
   ```bash
   pnpm lint
   ```
3. If FlatCompat breaks, update to use direct flat config exports from `eslint-config-next@16`

### Phase 4: Documentation Updates (10 min)

Update references in:
- `CLAUDE.md`: "Middleware Auth Flow" section → "Proxy Auth Flow", file references
- `README.md`: No changes needed (just references `pnpm lint`)

### Phase 5: Validation (30–60 min)

```bash
# 1. Lint
pnpm lint

# 2. Type check
npx tsc --noEmit

# 3. Unit tests
pnpm test:run

# 4. Build
pnpm build

# 5. E2E tests (validates auth redirects work with proxy)
pnpm test:e2e:chromium

# 6. Manual smoke test
pnpm dev
# - Visit / → should redirect to /dashboard (authenticated) or stay (unauthenticated)
# - Visit /dashboard unauthenticated → should redirect to /auth/login
# - Verify locale switching works
# - Verify dark mode works
```

---

## 6. Test Coverage for Migration

### 6.1 Unit Tests (Vitest)

| Test Area | What It Validates | Risk |
|-----------|------------------|------|
| API route tests (`tests/app/api/`) | `NextRequest`/`NextResponse` work correctly | Low — APIs unchanged |
| Component tests | `useRouter`, `usePathname` mocks | Low — mocked, no real Next.js |
| Hook tests (SWR) | Data fetching | None — no Next.js dependency |

### 6.2 E2E Tests (Playwright)

| Test | What It Validates | Critical for Migration? |
|------|------------------|------------------------|
| `e2e/auth.setup.ts` | Login → redirect to `/dashboard` | **Yes** — validates proxy redirect |
| `e2e/dashboard.spec.ts` | Unauthenticated → redirect to `/auth/login` | **Yes** — validates proxy auth guard |
| `e2e/accessibility.spec.ts` | Pages render correctly | Yes — validates no layout regressions |
| Other E2E tests | Feature functionality | Medium — validates nothing broke |

### 6.3 CI Pipeline

The CI workflow (`.github/workflows/ci.yml`) runs:
1. `pnpm lint` — will use new `eslint .` command
2. `pnpm test:run` — Vitest unit tests

The E2E workflow (`.github/workflows/e2e.yml`) runs:
1. `pnpm build` — validates production build
2. `playwright test` — validates auth flow and features

Both pipelines will automatically validate the upgrade on the PR.

---

## 7. Rollback Plan

**If the upgrade fails:**

1. `git revert` the upgrade commit
2. Run `pnpm install` to restore `node_modules`
3. Verify with `pnpm build && pnpm test:run`

**If a subtle regression is found post-merge:**

1. Create a revert PR
2. Next.js 15.5.x will continue to receive backport patches (`backport` dist-tag is at `15.5.12`)

**Risk mitigation:** The upgrade PR will be validated by both CI and E2E pipelines before merge.

---

## 8. Files Changed (Complete List)

| File | Action | Description |
|------|--------|-------------|
| `package.json` | Modify | Bump `next`, `next-intl`, `eslint-config-next`; change lint script |
| `middleware.ts` | Rename → `proxy.ts` | Rename file + function export |
| `lib/supabase/middleware.ts` | Rename → `lib/supabase/proxy.ts` | Rename file |
| `proxy.ts` | Modify | Update import path |
| `eslint.config.mjs` | Possibly modify | Adjust if `eslint-config-next@16` changes flat config exports |
| `CLAUDE.md` | Modify | Update middleware → proxy references |
| `pnpm-lock.yaml` | Auto-generated | Lock file update |

---

## 9. Open Questions

1. **Node.js version:** Next.js 16 may require Node.js >=18.18.0. CI currently uses Node.js 20 — should be fine, but verify minimum version in release notes.
2. **Turbopack config:** Next.js 16 may move Turbopack config from CLI flag to `next.config.ts`. Currently using `--turbopack` in dev script — verify this still works.
3. **`next-intl` plugin API:** Confirm `createNextIntlPlugin` works identically with Next.js 16 config format (TypeScript config).
4. **`@supabase/ssr` RC:** There is a `0.9.0-rc.2` available. Consider whether to upgrade simultaneously or keep at `0.8.0`.

---

## 10. Decision Log

| Decision | Rationale |
|----------|-----------|
| Upgrade to `16.1.6` (latest stable) | Avoid canary/RC instability |
| Keep `@supabase/ssr@0.8.0` | No breaking changes, no need to take RC risk |
| Bump `next-intl` to `^4.8.2` | Required for Next.js 16 peer dep compatibility |
| Use ESLint CLI directly | Required — `next lint` removed |
| Run codemod first | Automates renames and catches additional migration steps |
