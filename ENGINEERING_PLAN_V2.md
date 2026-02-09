# BetterR.Me - Engineering Implementation Plan V2

**Author:** Senior Staff Software Engineer
**Date:** February 9, 2026
**Status:** Proposed
**Companion Document:** UI_DESIGN_V2.md
**Tech Stack:** Next.js 15.5 (App Router), Supabase, TypeScript, Tailwind CSS 3, shadcn/ui

---

## 1. EXECUTIVE SUMMARY

This plan implements UI/UX improvements across 5 phases:

1. **Phase 1:** Mobile bottom navigation (P0 — fixes broken mobile UX)
2. **Phase 2:** Visual identity — typography + color system (P1 — brand cohesion)
3. **Phase 3:** Component polish — stat cards, celebration state, progress bars, micro-interactions (P2)
4. **Phase 4:** Bug fixes — broken dropdown links, duplicate title, landing page colors (P2)
5. **Phase 5:** Celebration animations (P3 — deferred, requires framer-motion)

**Estimated scope:** ~15 files modified, 2 files created, 1 new component, 1 backend enhancement.

---

## 2. PHASE 1 — MOBILE BOTTOM NAVIGATION

### 2.1 Problem

`components/main-nav.tsx:31` uses `hidden md:flex`, making navigation invisible on mobile. Users can only reach the profile dropdown (which itself has broken links — see Phase 4).

### 2.2 Create `components/mobile-bottom-nav.tsx`

**New file.** Client component with `"use client"` directive.

```tsx
// components/mobile-bottom-nav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Home, ClipboardList, Settings, User } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", icon: Home, labelKey: "dashboard", match: (p: string) => p === "/dashboard" },
  { href: "/habits", icon: ClipboardList, labelKey: "habits", match: (p: string) => p.startsWith("/habits") },
  { href: "/dashboard/settings", icon: Settings, labelKey: "settings", match: (p: string) => p.startsWith("/dashboard/settings") },
  { href: "/dashboard/settings", icon: User, labelKey: "profile", match: () => false }, // profile shares settings route
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const t = useTranslations("common.nav");

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      aria-label="Main navigation"
    >
      <div className="flex items-center justify-around h-16 pb-[env(safe-area-inset-bottom)]">
        {navItems.map((item) => {
          const isActive = item.match(pathname);
          return (
            <Link
              key={item.labelKey}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-2 text-xs transition-colors",
                isActive
                  ? "text-emerald-600 dark:text-emerald-400 font-medium"
                  : "text-muted-foreground"
              )}
            >
              <item.icon className="size-5" aria-hidden="true" />
              <span>{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

**Key decisions:**
- Uses `Link` (not `button`) for proper navigation semantics and prefetching
- `aria-current="page"` for screen reader announcement of active tab
- `pb-[env(safe-area-inset-bottom)]` for iOS home indicator
- Emerald-600/400 active states to match the app's completion color
- Profile tab navigates to `/dashboard/settings` (no separate profile page)

### 2.3 Modify `components/layouts/app-layout.tsx`

**Changes:**
1. Import and render `<MobileBottomNav />` after the content div
2. Add `pb-20 md:pb-0` to the content wrapper for bottom clearance

```diff
 import { MainNav } from "@/components/main-nav";
+import { MobileBottomNav } from "@/components/mobile-bottom-nav";
 import Link from "next/link";

 export function AppLayout({ children }: { children: React.ReactNode }) {
   return (
     <main className="min-h-screen flex flex-col">
       {/* Header */}
       <header className="sticky top-0 z-50 ...">
         ...
       </header>

       {/* Main content */}
-      <div className="flex-1 overflow-x-hidden">
+      <div className="flex-1 overflow-x-hidden pb-20 md:pb-0">
         <div className="container max-w-screen-2xl mx-auto px-4 py-6">
           {children}
         </div>
       </div>
+
+      {/* Mobile bottom navigation */}
+      <MobileBottomNav />
     </main>
   );
 }
```

### 2.4 i18n Changes

Add `"profile"` key to `common.nav` in all 3 locale files:

| File | Key | Value |
|------|-----|-------|
| `i18n/messages/en.json` | `common.nav.profile` | `"Profile"` |
| `i18n/messages/zh.json` | `common.nav.profile` | `"个人资料"` |
| `i18n/messages/zh-TW.json` | `common.nav.profile` | `"個人資料"` |

### 2.5 Test Plan

**Create `tests/components/mobile-bottom-nav.test.tsx`:**

| Test Case | Assertion |
|-----------|-----------|
| Renders all 4 nav items | 4 links present with correct hrefs |
| Highlights active tab based on pathname | Dashboard link gets active class when pathname is `/dashboard` |
| Habits tab active for nested routes | Active when pathname is `/habits/abc-123` |
| Correct icon rendering | Each tab renders its lucide icon |
| Correct labels via i18n | Labels match translation keys |
| `aria-current="page"` on active tab | Accessibility attribute present |
| Hidden on desktop (md+) | Has `md:hidden` class |

**Mock requirements:**
- `next/navigation`: mock `usePathname()` return value
- `next-intl`: mock `useTranslations()` to return key identity function

### 2.6 Files Changed

| File | Action | Lines Changed (est.) |
|------|--------|---------------------|
| `components/mobile-bottom-nav.tsx` | **Create** | ~45 |
| `components/layouts/app-layout.tsx` | Modify | ~5 |
| `i18n/messages/en.json` | Add key | 1 |
| `i18n/messages/zh.json` | Add key | 1 |
| `i18n/messages/zh-TW.json` | Add key | 1 |
| `tests/components/mobile-bottom-nav.test.tsx` | **Create** | ~80 |

---

## 3. PHASE 2A — TYPOGRAPHY (Lexend Display Font)

### 3.1 Modify `app/layout.tsx`

Add Lexend as a display font via `next/font/google`:

```diff
-import { Inter } from "next/font/google";
+import { Inter, Lexend } from "next/font/google";

 const inter = Inter({
   variable: "--font-sans",
   display: "swap",
   subsets: ["latin"],
 });

+const lexend = Lexend({
+  variable: "--font-display",
+  display: "swap",
+  subsets: ["latin"],
+});

 // In the return:
-<body className={`${inter.className} antialiased`}>
+<body className={`${inter.className} ${lexend.variable} antialiased`}>
```

**Why `inter.className` + `lexend.variable`:**
- `inter.className` applies Inter as the default body font (sets `font-family` directly)
- `lexend.variable` injects `--font-display` CSS variable without applying it as default
- Elements opt-in to Lexend via `font-display` utility class

### 3.2 Modify `tailwind.config.ts`

Register the `font-display` family:

```diff
 theme: {
   extend: {
+    fontFamily: {
+      display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
+    },
     colors: {
       ...
```

### 3.3 Apply `font-display` to Heading Elements

| File | Line (approx.) | Element | Change |
|------|----------------|---------|--------|
| `components/layouts/app-layout.tsx` | 15 | Logo "BetterR.me" | Add `font-display` to existing `font-bold text-xl` |
| `components/dashboard/dashboard-content.tsx` | 121, 175 | Greeting `<h1>` | Add `font-display` to `text-3xl font-bold tracking-tight` |
| `components/dashboard/daily-snapshot.tsx` | 90 | Section title | Add `font-display` to `text-lg font-semibold` |
| `components/dashboard/daily-snapshot.tsx` | 26 | Stat value | Add `font-display` to `text-3xl font-bold` |
| `components/dashboard/habit-checklist.tsx` | 39 | Section title | Add `font-display` to `text-lg font-semibold` |
| `components/habits/habit-card.tsx` | 47 | Habit name `<h3>` | Add `font-display` to `font-medium truncate` |
| `components/habits/habits-page-content.tsx` | 77 | Page title `<h1>` | Add `font-display` to `text-3xl font-bold tracking-tight` |
| `components/hero.tsx` | 26 | Hero heading | Add `font-display` to `text-5xl sm:text-6xl font-bold` |

### 3.4 Test Plan

No new tests needed. Verify visually that:
- Lexend loads (check Network tab for font request)
- Headings use Lexend, body text uses Inter
- `pnpm build` succeeds (font optimization works)

### 3.5 Files Changed

| File | Action | Lines Changed (est.) |
|------|--------|---------------------|
| `app/layout.tsx` | Modify | ~6 |
| `tailwind.config.ts` | Modify | ~3 |
| `components/layouts/app-layout.tsx` | Modify | 1 |
| `components/dashboard/dashboard-content.tsx` | Modify | 2 |
| `components/dashboard/daily-snapshot.tsx` | Modify | 2 |
| `components/dashboard/habit-checklist.tsx` | Modify | 1 |
| `components/habits/habit-card.tsx` | Modify | 1 |
| `components/habits/habits-page-content.tsx` | Modify | 1 |
| `components/hero.tsx` | Modify | 1 |

---

## 4. PHASE 2B — COLOR SYSTEM (Emerald Primary)

### 4.1 Modify `app/globals.css`

Update CSS variables in both `:root` and `.dark`:

```diff
 :root {
-  --primary: 0 0% 9%;
+  --primary: 160 84% 39%;
-  --primary-foreground: 0 0% 98%;
+  --primary-foreground: 0 0% 100%;
   ...
-  --ring: 0 0% 3.9%;
+  --ring: 160 84% 39%;
 }

 .dark {
-  --primary: 0 0% 98%;
+  --primary: 142 71% 45%;
   --primary-foreground: 0 0% 9%;
   ...
-  --ring: 0 0% 83.1%;
+  --ring: 142 71% 45%;
 }
```

### 4.2 Cascade Impact Analysis

Components that use `bg-primary`, `text-primary`, `ring-primary`, or shadcn buttons will automatically reflect the new emerald color:

| Component | Usage | Auto-updates? |
|-----------|-------|---------------|
| `Button` (default variant) | `bg-primary text-primary-foreground` | Yes |
| `Checkbox` (checked) | `data-[state=checked]:bg-primary` | Yes |
| Empty state icon | `bg-primary/10 text-primary` | Yes |
| Focus rings | `ring-ring` | Yes |
| `Badge` | `bg-primary` | Yes |

**No manual changes needed** for these components — the CSS variable swap handles everything.

### 4.3 Potential Issues

| Issue | Mitigation |
|-------|-----------|
| Habit checkbox already uses `data-[state=checked]:bg-emerald-500` | No conflict — emerald-500 and emerald-600 primary are visually consistent |
| Contrast: emerald-600 on white = 4.58:1 | Meets WCAG AA (4.5:1 threshold). For small text, consider emerald-700 if needed |
| Existing `text-primary` uses (e.g., hover states) | All will shift from black/white to emerald — verify no unexpected text color changes |

### 4.4 Test Plan

- Run existing Vitest suite (`pnpm test:run`) — no tests should break (tests don't assert CSS values)
- Visual smoke test: verify buttons, checkboxes, focus rings are emerald
- Dark mode: verify emerald-500 primary is visible on dark backgrounds
- `pnpm lint` passes

### 4.5 Files Changed

| File | Action | Lines Changed (est.) |
|------|--------|---------------------|
| `app/globals.css` | Modify | 6 |

---

## 5. PHASE 3A — ENHANCED STAT CARDS

### 5.1 Modify `components/dashboard/daily-snapshot.tsx`

Redesign the `StatCard` component:

**Current structure (vertical):**
```tsx
<div className="rounded-xl border p-4">
  <div className="flex items-center gap-2 mb-2 text-slate-500">
    <span>{icon}</span>
    <span className="text-sm">{title}</span>
  </div>
  <div className="text-3xl font-bold">{value}</div>
</div>
```

**New structure (horizontal with icon circle):**
```tsx
interface StatCardProps {
  icon: React.ReactNode;
  iconBgClass: string;      // NEW: e.g., "bg-blue-100 dark:bg-blue-900/30"
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: number; isPositive: boolean; label: string };
}

function StatCard({ icon, iconBgClass, title, value, subtitle, trend }: StatCardProps) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={cn("rounded-full p-2.5 shrink-0", iconBgClass)}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm text-slate-500 dark:text-slate-400">{title}</p>
          <p className="font-display text-3xl font-bold mt-0.5">{value}</p>
          {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
          {trend && (
            <div className={cn("flex items-center gap-1 text-sm mt-1", ...)}>
              ...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Usage update in `DailySnapshot`:**
```tsx
<StatCard
  icon={<Target className="size-4 text-blue-600 dark:text-blue-400" />}
  iconBgClass="bg-blue-100 dark:bg-blue-900/30"
  title={t("activeHabits")}
  value={stats.total_habits}
/>
<StatCard
  icon={<Target className="size-4 text-emerald-600 dark:text-emerald-400" />}
  iconBgClass="bg-emerald-100 dark:bg-emerald-900/30"
  title={t("todaysProgress")}
  value={`${stats.completed_today}/${stats.total_habits}`}
  subtitle={t("completionRate", { percent: completionRate })}
  trend={trend}
/>
<StatCard
  icon={<Flame className="size-4 text-orange-600 dark:text-orange-400" />}
  iconBgClass="bg-orange-100 dark:bg-orange-900/30"
  title={t("currentStreak")}
  value={t("days", { count: stats.current_best_streak })}
/>
```

### 5.2 Files Changed

| File | Action | Lines Changed (est.) |
|------|--------|---------------------|
| `components/dashboard/daily-snapshot.tsx` | Modify | ~30 |

---

## 6. PHASE 3B — CELEBRATION STATE

### 6.1 Modify `components/dashboard/habit-checklist.tsx`

Replace the "all complete" text line (lines 69-73) with a gradient celebration card:

**Current (line 69-73):**
```tsx
<div className="mt-4 pt-4 border-t text-sm text-center text-muted-foreground">
  {allComplete ? (
    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
      {t("allComplete")} 🎉
    </span>
  ) : ( ... )}
</div>
```

**New:**
```tsx
import { PartyPopper } from "lucide-react";

// In the render:
<div className="mt-4 pt-4 border-t">
  {allComplete ? (
    <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border border-emerald-200 dark:border-emerald-800/30 p-6 text-center">
      <div className="inline-flex items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50 p-3 mb-3">
        <PartyPopper className="size-6 text-emerald-600 dark:text-emerald-400" />
      </div>
      <p className="font-display text-lg font-bold text-emerald-900 dark:text-emerald-100">
        {t("perfectDay")}
      </p>
      <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">
        {t("allCompletedDesc", { count: totalCount })}
      </p>
    </div>
  ) : (
    <p className="text-sm text-center text-muted-foreground">
      {t("completed", { completed: completedCount, total: totalCount })}
      {" • "}
      {t("moreToGo", { count: remaining })}
    </p>
  )}
</div>
```

### 6.2 i18n Keys Required

Add to `dashboard.habits` namespace in all 3 locales:

| Key | EN | ZH | ZH-TW |
|-----|----|----|-------|
| `perfectDay` | `"Perfect day!"` | `"完美的一天！"` | `"完美的一天！"` |
| `allCompletedDesc` | `"You completed all {count} habits today."` | `"你今天完成了所有 {count} 个习惯。"` | `"你今天完成了所有 {count} 個習慣。"` |

### 6.3 Files Changed

| File | Action | Lines Changed (est.) |
|------|--------|---------------------|
| `components/dashboard/habit-checklist.tsx` | Modify | ~20 |
| `i18n/messages/en.json` | Add keys | 2 |
| `i18n/messages/zh.json` | Add keys | 2 |
| `i18n/messages/zh-TW.json` | Add keys | 2 |

---

## 7. PHASE 3C — HABIT CARD MONTHLY PROGRESS BAR

### 7.1 Backend: Add `monthly_completion_rate` to Types

**Modify `lib/db/types.ts`:**

```diff
 export interface HabitWithTodayStatus extends Habit {
   completed_today: boolean;
+  monthly_completion_rate: number; // 0-100, percentage of days completed this month
 }
```

### 7.2 Backend: Calculate Monthly Rate in `lib/db/habits.ts`

**Modify `HabitsDB.getHabitsWithTodayStatus()`:**

After fetching active habits and today's logs, also fetch this month's logs:

```tsx
async getHabitsWithTodayStatus(userId: string, date?: string): Promise<HabitWithTodayStatus[]> {
  const today = date || new Date().toISOString().split('T')[0];

  // Get active habits
  const habits = await this.getActiveHabits(userId);

  // Get today's logs for all habits
  const { data: logs, error: logsError } = await this.supabase
    .from('habit_logs')
    .select('habit_id, completed')
    .eq('user_id', userId)
    .eq('logged_date', today)
    .eq('completed', true);

  if (logsError) throw logsError;

  // --- NEW: Get this month's logs for progress bars ---
  const monthStart = today.substring(0, 7) + '-01'; // YYYY-MM-01
  const { data: monthLogs, error: monthLogsError } = await this.supabase
    .from('habit_logs')
    .select('habit_id, logged_date, completed')
    .eq('user_id', userId)
    .gte('logged_date', monthStart)
    .lte('logged_date', today)
    .eq('completed', true);

  if (monthLogsError) throw monthLogsError;

  // Count completed days per habit this month
  const monthlyCompletions = new Map<string, number>();
  (monthLogs || []).forEach(log => {
    monthlyCompletions.set(log.habit_id, (monthlyCompletions.get(log.habit_id) || 0) + 1);
  });

  // Calculate days elapsed in month (1-based, up to today)
  const dayOfMonth = parseInt(today.split('-')[2], 10);
  // --- END NEW ---

  const completedHabitIds = new Set((logs || []).map(log => log.habit_id));

  return habits.map(habit => ({
    ...habit,
    completed_today: completedHabitIds.has(habit.id),
    monthly_completion_rate: dayOfMonth > 0
      ? Math.round(((monthlyCompletions.get(habit.id) || 0) / dayOfMonth) * 100)
      : 0,
  }));
}
```

**Note:** The `getUserHabits()` method (used by `GET /api/habits` without `with_today`) returns `Habit[]` not `HabitWithTodayStatus[]`, so it doesn't need changes. The habits list page (`habits-page-content.tsx`) uses `with_today=true`, which calls `getHabitsWithTodayStatus()` — so the monthly rate will be available there too.

### 7.3 Frontend: Add Progress Bar to `components/habits/habit-card.tsx`

Add after the streaks section (after line 78):

```tsx
{/* Monthly progress bar */}
<div className="space-y-1">
  <div className="flex justify-between text-xs text-muted-foreground">
    <span>{t("card.thisMonth")}</span>
    <span>{habit.monthly_completion_rate}%</span>
  </div>
  <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true">
    <div
      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"
      style={{ width: `${habit.monthly_completion_rate}%` }}
    />
  </div>
</div>
```

### 7.4 i18n Key

| Key | EN | ZH | ZH-TW |
|-----|----|----|-------|
| `habits.card.thisMonth` | `"This month"` | `"本月"` | `"本月"` |

### 7.5 API Route Impact

**`app/api/habits/route.ts`:** No changes needed. The route already calls `habitsDB.getHabitsWithTodayStatus()` and returns the full object — the new `monthly_completion_rate` field will be included automatically.

### 7.6 Test Plan

**Unit tests to update/add:**

| Test | File | Assertion |
|------|------|-----------|
| `getHabitsWithTodayStatus` returns `monthly_completion_rate` | `tests/lib/db/habits.test.ts` (if exists) | New field is a number 0-100 |
| Habit card renders progress bar | `tests/components/habits/habit-card.test.tsx` (if exists) | Progress bar element present, width matches rate |
| API response includes new field | `tests/api/habits.test.ts` (if exists) | JSON response has `monthly_completion_rate` |

### 7.7 Files Changed

| File | Action | Lines Changed (est.) |
|------|--------|---------------------|
| `lib/db/types.ts` | Modify | 1 |
| `lib/db/habits.ts` | Modify | ~25 |
| `components/habits/habit-card.tsx` | Modify | ~15 |
| `i18n/messages/en.json` | Add key | 1 |
| `i18n/messages/zh.json` | Add key | 1 |
| `i18n/messages/zh-TW.json` | Add key | 1 |

---

## 8. PHASE 3D — MICRO-INTERACTION REFINEMENTS

### 8.1 Habit Card Hover Enhancement

**Modify `components/habits/habit-card.tsx:35`:**

```diff
-<Card data-testid={`habit-card-${habit.id}`} className="transition-all hover:shadow-md hover:scale-[1.02] p-5">
+<Card data-testid={`habit-card-${habit.id}`} className="transition-all hover:shadow-lg hover:scale-[1.03] hover:-translate-y-0.5 duration-200 p-5">
```

### 8.2 Focus Visible on Interactive Cards

Ensure the clickable button inside the card uses `focus-visible:ring-primary` (already present as `focus-visible:ring-ring` at line 40, which will be emerald after Phase 2B).

### 8.3 Files Changed

| File | Action | Lines Changed (est.) |
|------|--------|---------------------|
| `components/habits/habit-card.tsx` | Modify | 1 |

---

## 9. PHASE 4 — BUG FIXES & QUICK WINS

### 9.1 Fix Broken Profile Dropdown Links

**File:** `components/profile-avatar.tsx`

**Problem:** Lines 64-71 have `<DropdownMenuItem>` elements that are not wrapped in `<Link>` — clicking "Profile" or "Settings" does nothing. Additionally, the "Settings" item **duplicates** the Settings link already present in the top navbar (`main-nav.tsx:24-27`) and the new mobile bottom nav (Phase 1). Having Settings in the dropdown creates redundancy.

**Fix:** This is a **server component** (it calls `await createClient()`). Remove the "Settings" dropdown item entirely (it's redundant with the navbar) and make "Profile" functional using Next.js `<Link>` with `asChild`:

```diff
+import Link from "next/link";

 <DropdownMenuSeparator />
-<DropdownMenuItem>
-  <UserIcon className="mr-2 h-4 w-4" />
-  <span>Profile</span>
-</DropdownMenuItem>
-<DropdownMenuItem>
-  <Settings className="mr-2 h-4 w-4" />
-  <span>Settings</span>
-</DropdownMenuItem>
+<DropdownMenuItem asChild>
+  <Link href="/dashboard/settings">
+    <UserIcon className="mr-2 h-4 w-4" />
+    <span>Profile</span>
+  </Link>
+</DropdownMenuItem>
```

**Rationale:** Settings is accessible via the top navbar (desktop) and bottom nav (mobile). The dropdown should contain only user-specific items: Profile and Log out. The unused `Settings` import from lucide-react can also be removed.

### 9.2 Remove Duplicate "My Habits" Title

**File:** `components/habits/habit-list.tsx`

**Problem:** Lines 91-93 render `<h1>{t("title")}</h1>`, but `habits-page-content.tsx:77` already renders the same page title.

**Fix:** Remove the duplicate heading:

```diff
 return (
   <div className="space-y-6">
-    <div className="flex items-center justify-between">
-      <h1 className="text-2xl font-bold">{t("title")}</h1>
-    </div>
-
     <Tabs value={activeTab} onValueChange={handleTabChange}>
```

**Impact on loading skeleton:** The skeleton in `HabitList` (lines 74-87) also has a matching skeleton for this heading — remove it too:

```diff
 if (isLoading) {
   return (
     <div className="space-y-6">
-      <div className="flex items-center justify-between">
-        <Skeleton className="h-8 w-32" />
-        <Skeleton className="h-10 w-48" />
-      </div>
       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
```

### 9.3 Landing Page Color Alignment

**File: `components/hero.tsx`**

Replace all blue references with emerald:

| Line | Current | New |
|------|---------|-----|
| 21 | `from-blue-50 via-background to-purple-50` | `from-emerald-50 via-background to-teal-50` |
| 21 | `dark:from-blue-950/20 dark:to-purple-950/20` | `dark:from-emerald-950/20 dark:to-teal-950/20` |
| 28 | `from-blue-600 to-purple-600` | `from-emerald-600 to-teal-500` |
| 32 | `from-purple-600 to-pink-600` | `from-teal-500 to-cyan-500` |
| 46 | `bg-blue-600 hover:bg-blue-700` | `bg-emerald-600 hover:bg-emerald-700` |

**File: `app/page.tsx`**

| Line | Current | New |
|------|---------|-----|
| 60 | `text-blue-600` (feature icons) | `text-emerald-600` |
| 70 | `bg-blue-600 text-white` (stats section) | `bg-emerald-600 text-white` |
| 76 | `text-blue-100` (stats subtitle) | `text-emerald-100` |
| 83 | `text-blue-100` (stats labels) | `text-emerald-100` |
| 106 | `bg-blue-600 hover:bg-blue-700` (CTA button) | `bg-emerald-600 hover:bg-emerald-700` |

**File: `components/layouts/app-layout.tsx`**

| Line | Current | New |
|------|---------|-----|
| 15 | `from-blue-600 to-purple-600` (logo gradient) | `from-emerald-600 to-teal-500` |

### 9.4 Files Changed

| File | Action | Lines Changed (est.) |
|------|--------|---------------------|
| `components/profile-avatar.tsx` | Modify | ~10 |
| `components/habits/habit-list.tsx` | Modify | ~10 |
| `components/hero.tsx` | Modify | ~5 |
| `app/page.tsx` | Modify | ~6 |
| `components/layouts/app-layout.tsx` | Modify | 1 |

---

## 10. PHASE 5 — CELEBRATION ANIMATIONS (DEFERRED)

### 10.1 Decision: Skip for Now

Adding meaningful completion animations requires `framer-motion` (~50KB gzipped). The current Radix checkbox transitions are adequate for V2.

### 10.2 Future Implementation Notes

If revisited:
- Install: `pnpm add framer-motion`
- Wrap habit checkbox with `<AnimatePresence>` + `<motion.div>`
- Confetti on streak milestones (7, 30, 100, 365) using `canvas-confetti` (~6KB)
- Celebrate screen on 100% daily completion

---

## 11. EXECUTION ORDER & DEPENDENCIES

```
Phase 1 (Mobile Nav)
  │
  ├── Phase 2A (Typography) ← no dependency on Phase 1
  │     │
  │     └── Phase 2B (Color System) ← builds on typography for font-display on buttons
  │           │
  │           ├── Phase 3A (Stat Cards) ← uses font-display + emerald colors
  │           │
  │           ├── Phase 3B (Celebration) ← uses emerald gradients
  │           │
  │           ├── Phase 3C (Progress Bars) ← backend change, uses emerald
  │           │
  │           └── Phase 3D (Micro-interactions) ← uses ring-primary (emerald)
  │
  └── Phase 4 (Bug Fixes) ← independent, can be done anytime
```

**Recommended order for implementation:**
1. Phase 4 (Bug fixes — quick wins, high confidence)
2. Phase 1 (Mobile nav — critical UX fix)
3. Phase 2A (Typography)
4. Phase 2B (Color system)
5. Phase 3A (Stat cards)
6. Phase 3B (Celebration state)
7. Phase 3C (Progress bars — requires backend)
8. Phase 3D (Micro-interactions)

---

## 12. TESTING STRATEGY

### 12.1 Unit Tests

| Area | Approach |
|------|----------|
| `MobileBottomNav` | New test file; mock pathname, verify active states |
| `StatCard` redesign | Update existing `daily-snapshot.test.tsx` if it exists; verify new `iconBgClass` prop |
| Celebration state | Update existing `habit-checklist.test.tsx` if it exists; verify gradient card renders when all complete |
| Monthly progress bar | Update `habit-card.test.tsx` if it exists; verify bar renders with correct width |
| `getHabitsWithTodayStatus` | Update DB tests; mock Supabase responses for monthly logs |

### 12.2 Integration Tests

- `pnpm test:run` — all existing tests pass
- `pnpm test:coverage` — maintain 50% threshold

### 12.3 Visual / Manual Tests

| Check | How |
|-------|-----|
| Mobile bottom nav visible < 768px | Chrome DevTools responsive mode |
| Desktop nav still works >= 768px | Regular browser window |
| Emerald buttons/checkboxes | Visual inspection, light + dark mode |
| Lexend headings | Inspect computed `font-family` in DevTools |
| Progress bars | Create habits, log some completions, verify bar width |
| Safe area on iOS | Test on Safari iOS (or simulator) |

### 12.4 Accessibility Tests

- Run `vitest-axe` on new `MobileBottomNav` component
- Verify `aria-current="page"` in bottom nav
- Verify `aria-hidden="true"` on progress bar decorative elements
- Verify emerald-600 contrast ratio meets WCAG AA (4.58:1 on white)

### 12.5 E2E Tests

Existing Playwright tests in `e2e/` should continue to pass. The mobile bottom nav is `md:hidden` so it won't interfere with desktop E2E tests. Consider adding a mobile-viewport E2E test for bottom nav navigation in a follow-up.

---

## 13. MIGRATION NOTES

### 13.1 Breaking Changes

**None.** All changes are additive or modify presentation only:
- CSS variable changes affect visual appearance, not behavior
- New `monthly_completion_rate` field is added to existing type (non-breaking for consumers)
- Bottom nav is additive (hidden on desktop)

### 13.2 Database Changes

**None.** The `monthly_completion_rate` is calculated on-the-fly from existing `habit_logs` table data. No schema migration needed.

### 13.3 Performance Considerations

| Change | Impact | Mitigation |
|--------|--------|-----------|
| Lexend font load | +~15KB (variable font, WOFF2) | `display: "swap"` + `next/font` optimization (self-hosted, no CLS) |
| Monthly logs query | +1 Supabase query per `getHabitsWithTodayStatus` call | Query is indexed on `(user_id, logged_date)` via existing index; max ~31 rows per habit |
| Bottom nav render | +1 client component on all pages | Tiny component, no state management overhead |

### 13.4 Rollback Plan

All changes can be reverted by reverting the Git commits. The CSS variable changes are the highest-impact — to partially rollback just the color:
```css
--primary: 0 0% 9%;  /* revert to black */
```

---

## 14. COMPLETE FILE MANIFEST

| File | Phase | Action |
|------|-------|--------|
| `components/mobile-bottom-nav.tsx` | 1 | **Create** |
| `tests/components/mobile-bottom-nav.test.tsx` | 1 | **Create** |
| `components/layouts/app-layout.tsx` | 1, 2A, 4 | Modify |
| `i18n/messages/en.json` | 1, 3B, 3C | Add keys |
| `i18n/messages/zh.json` | 1, 3B, 3C | Add keys |
| `i18n/messages/zh-TW.json` | 1, 3B, 3C | Add keys |
| `app/layout.tsx` | 2A | Modify |
| `tailwind.config.ts` | 2A | Modify |
| `app/globals.css` | 2B | Modify |
| `components/dashboard/daily-snapshot.tsx` | 2A, 3A | Modify |
| `components/dashboard/dashboard-content.tsx` | 2A | Modify |
| `components/dashboard/habit-checklist.tsx` | 2A, 3B | Modify |
| `components/habits/habit-card.tsx` | 2A, 3C, 3D | Modify |
| `components/habits/habits-page-content.tsx` | 2A | Modify |
| `components/habits/habit-list.tsx` | 4 | Modify |
| `components/hero.tsx` | 2A, 4 | Modify |
| `app/page.tsx` | 4 | Modify |
| `components/profile-avatar.tsx` | 4 | Modify |
| `lib/db/types.ts` | 3C | Modify |
| `lib/db/habits.ts` | 3C | Modify |

**Total: 20 files (2 new, 18 modified)**

---

## 15. VERIFICATION CHECKLIST

Before merging:

- [ ] `pnpm lint` — no errors
- [ ] `pnpm test:run` — all tests pass
- [ ] `pnpm build` — production build succeeds
- [ ] `pnpm test:coverage` — meets 50% threshold
- [ ] Visual check: mobile bottom nav (Chrome DevTools @ 375px)
- [ ] Visual check: desktop nav (1024px+)
- [ ] Visual check: dark mode all pages
- [ ] Visual check: emerald primary on buttons, checkboxes, focus rings
- [ ] Visual check: Lexend on headings
- [ ] Visual check: stat cards with icon circles
- [ ] Visual check: celebration card when all habits complete
- [ ] Visual check: progress bars on habit cards

---

**Document Version:** 1.0
**Last Updated:** February 9, 2026
**Status:** Proposed — Pending Review
