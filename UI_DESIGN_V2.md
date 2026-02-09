# BetterR.Me - UI Design Document V2

**Author:** Staff UI Designer
**Date:** February 9, 2026
**Status:** Proposed
**Supersedes:** UI_DESIGN_V1.md
**Design System:** shadcn/ui + Radix UI + Tailwind CSS 3

---

## 1. DESIGN AUDIT — CURRENT STATE

Before proposing changes, we performed a comprehensive visual audit of the live app. Here are the findings that inform this redesign:

| Area | Current State | Problem |
|------|--------------|---------|
| **Mobile navigation** | `hidden md:flex` on `<nav>` in `main-nav.tsx` | Mobile users have **zero** page navigation — only the profile dropdown is reachable |
| **Typography** | Inter only (system-level) | No distinction between headings and body; app feels generic |
| **Color system** | `--primary: 0 0% 9%` (black) in light, `0 0% 98%` (white) in dark | Flat, no brand identity; clashes with emerald completion theme used in components |
| **Stat cards** | Flat bordered boxes, tiny grey icons | No visual weight — users glance past them |
| **"All complete" state** | Single line: `"All complete! 🎉"` in muted text | Doesn't celebrate the achievement adequately |
| **Habit cards** | Minimal: text + streaks + checkbox, `hover:shadow-md hover:scale-[1.02]` | No monthly progress indicator, subtle hover |
| **Landing page** | Bold blue-600 gradients, feature cards, stats section | Best-looking page — but authenticated app doesn't carry this quality |
| **Profile dropdown** | "Profile" and "Settings" items are dead `<DropdownMenuItem>` with no links | Broken navigation — clicking does nothing |
| **Habits page** | `<h1>` in both `habits-page-content.tsx` and `habit-list.tsx` | Duplicate "My Habits" title |
| **App header logo** | `bg-gradient-to-r from-blue-600 to-purple-600` | Blue/purple gradient disconnected from emerald app theme |

---

## 2. DESIGN PRINCIPLES (Updated)

### 2.1 Core Philosophy — Unchanged from V1

| Principle | Implementation |
|-----------|----------------|
| **Zero Friction** | 1-tap habit completion, no modals for quick actions |
| **Progress Visible** | Streaks prominent, completion % always shown |
| **Compassionate** | Encouraging copy, no shame for missed days |
| **Glanceable** | Dashboard scannable in <5 seconds |

### 2.2 New Principles for V2

| Principle | Implementation |
|-----------|----------------|
| **Cohesive Identity** | Emerald as primary across landing + app; Lexend display font for warmth |
| **Mobile-First Navigation** | Fixed bottom nav on mobile; all pages reachable in 1 tap |
| **Celebration Matters** | Completing all habits triggers a gradient celebration card, not just text |
| **Visual Weight** | Stat cards, headings, and interactive elements should feel substantial |

### 2.3 Visual Hierarchy — Updated

1. **Primary:** Today's habits (toggle area) + mobile navigation
2. **Secondary:** Progress stats (streaks, completion %, monthly progress bars)
3. **Tertiary:** Tasks, motivation message, settings

---

## 3. VISUAL IDENTITY

### 3.1 Color System

The current color system uses default shadcn grayscale for primary (`--primary: 0 0% 9%`). This creates a disconnect — components already use `emerald-500` for completions, `orange-500` for streaks, and `blue-600` on the landing page. V2 unifies around **emerald**.

#### Primary Palette

```
                    Light Mode              Dark Mode
─────────────────────────────────────────────────────────
Primary:            emerald-600             emerald-500
                    HSL(160 84% 39%)        HSL(142 71% 45%)

Primary Foreground: white                   slate-950
                    HSL(0 0% 100%)          HSL(0 0% 9%)

Focus Ring:         emerald-600             emerald-500
                    HSL(160 84% 39%)        HSL(142 71% 45%)
```

#### Semantic Colors — Unchanged

```
Success/Complete:   emerald-500 (#10b981)
Streaks/Fire:       orange-500 (#f97316)
Missed/Gentle:      slate-300 (#cbd5e1)
Destructive:        red-500 (existing)
```

#### Category Colors — Unchanged from V1

```
Health:       rose-500        (bg-rose-100 dark:bg-rose-900/30)
Wellness:     purple-500      (bg-purple-100 dark:bg-purple-900/30)
Learning:     blue-500        (bg-blue-100 dark:bg-blue-900/30)
Productivity: amber-500       (bg-amber-100 dark:bg-amber-900/30)
Other:        slate-500       (bg-slate-100 dark:bg-slate-900/30)
```

#### CSS Variable Changes

```css
/* globals.css — :root (light mode) */
--primary: 160 84% 39%;            /* was: 0 0% 9% (black) */
--primary-foreground: 0 0% 100%;   /* was: 0 0% 98% */
--ring: 160 84% 39%;               /* was: 0 0% 3.9% */

/* globals.css — .dark */
--primary: 142 71% 45%;            /* was: 0 0% 98% (white) */
--primary-foreground: 0 0% 9%;     /* unchanged */
--ring: 142 71% 45%;               /* was: 0 0% 83.1% */
```

**Impact:** All `bg-primary`, `text-primary`, `ring-primary`, and shadcn Button/Badge components automatically become emerald-themed. No individual component edits needed for the base color shift.

### 3.2 Typography

#### Current State
- **Single font:** Inter (sans-serif) for everything
- **No visual distinction** between headings and body text
- The app looks identical to any default shadcn project

#### V2 Dual-Font System

| Role | Font | Weight | Usage |
|------|------|--------|-------|
| **Display** | Lexend | 600-700 | Page titles, section headings, brand text, stat values |
| **Body** | Inter | 400-500 | Body text, labels, descriptions, form inputs |

**Why Lexend?**
- Geometric sans-serif designed for readability
- Pairs naturally with Inter (both geometric, different personality)
- Variable font — efficient loading via `next/font/google`
- Adds warmth and modernity without being decorative

#### Font Registration

```
CSS Variable: --font-display
Tailwind Class: font-display
Fallback Chain: var(--font-display), var(--font-sans), system-ui
```

#### Where `font-display` Applies

| Component | Element | Current | V2 |
|-----------|---------|---------|-----|
| `app-layout.tsx` | Logo "BetterR.me" | `font-bold text-xl` | `font-display font-bold text-xl` |
| `dashboard-content.tsx` | Greeting "Good morning, Alex!" | `text-3xl font-bold` | `font-display text-3xl font-bold` |
| `daily-snapshot.tsx` | Section title "Today's Snapshot" | `text-lg font-semibold` | `font-display text-lg font-semibold` |
| `daily-snapshot.tsx` | Stat value (e.g., "3/7") | `text-3xl font-bold` | `font-display text-3xl font-bold` |
| `habit-checklist.tsx` | Section title "Today's Habits" | `text-lg font-semibold` | `font-display text-lg font-semibold` |
| `habit-card.tsx` | Habit name | `font-medium` | `font-display font-medium` |
| `habits-page-content.tsx` | Page title "My Habits" | `text-3xl font-bold` | `font-display text-3xl font-bold` |
| `hero.tsx` | Hero heading | `text-5xl font-bold` | `font-display text-5xl font-bold` |

---

## 4. MOBILE BOTTOM NAVIGATION (P0 — Critical)

### 4.1 Problem Statement

The current `main-nav.tsx` uses `hidden md:flex` — on screens below 768px, the navigation links (Dashboard, Habits, Settings) are completely hidden. Mobile users can only navigate via the profile dropdown avatar, which only has non-functional "Profile" and "Settings" items.

**This is a usability-breaking gap.**

### 4.2 Design Specification

```
┌─────────────────────────────────────────────┐
│                                             │
│                (page content)               │
│                                             │
│                                             │
├─────────────────────────────────────────────┤  ← top border (border-t)
│                                             │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐
│  │  🏠    │  │  📋    │  │  ⚙️    │  │  👤    │
│  │  Home  │  │ Habits │  │Settings│  │Profile │
│  └────────┘  └────────┘  └────────┘  └────────┘
│                                             │
│            (safe area inset)                │
└─────────────────────────────────────────────┘
```

### 4.3 Layout Specifications

| Property | Value | Reason |
|----------|-------|--------|
| Position | `fixed bottom-0 left-0 right-0` | Always visible |
| z-index | `z-50` | Above content, matches header |
| Visibility | `md:hidden` | Desktop uses top nav |
| Height | 64px + safe area | Standard mobile tab bar |
| Bottom padding | `pb-[env(safe-area-inset-bottom)]` | iPhone notch/home indicator |
| Background | `bg-background/95 backdrop-blur` | Matches header style |
| Border | `border-t` | Visual separation from content |

### 4.4 Tab Items

| Tab | Icon | Label | Route | Active Match |
|-----|------|-------|-------|-------------|
| Home | `Home` (lucide) | Dashboard* | `/dashboard` | `pathname === "/dashboard"` |
| Habits | `ClipboardList` (lucide) | Habits | `/habits` | `pathname.startsWith("/habits")` |
| Settings | `Settings` (lucide) | Settings | `/dashboard/settings` | `pathname.startsWith("/dashboard/settings")` |
| Profile | `User` (lucide) | Profile** | `/dashboard/settings` | — (shares route with settings) |

*Uses existing `common.nav.dashboard` translation key
**Requires new `common.nav.profile` translation key in all 3 locales

### 4.5 Active/Inactive States

```
Active Tab:
  Icon:  text-emerald-600 dark:text-emerald-400
  Label: text-emerald-600 dark:text-emerald-400, font-medium, text-xs

Inactive Tab:
  Icon:  text-muted-foreground
  Label: text-muted-foreground, text-xs
```

### 4.6 Content Clearance

The main content area needs bottom padding to prevent the bottom nav from obscuring content:

```
Content wrapper: pb-20 md:pb-0
```

This adds 80px of padding on mobile (enough for 64px nav + 16px breathing room) and removes it on desktop.

### 4.7 Wireframe — Mobile Dashboard with Bottom Nav

```
┌─────────────────────────────────┐
│ BetterR.me        [🌍] [🌙] [👤]│
├─────────────────────────────────┤
│                                 │
│ Good morning, Alex! 👋          │
│ Let's build consistency.        │
│                                 │
│ ┌─────────┐ ┌─────────┐        │
│ │   3/7   │ │  🔥 23  │        │
│ │ Today's │ │ Best    │        │
│ │Progress │ │ Streak  │        │
│ └─────────┘ └─────────┘        │
│                                 │
│ TODAY'S HABITS            [+]  │
│ ┌─────────────────────────────┐ │
│ │ [✓] Meditate 10 min         │ │
│ │ [✓] Read 20 pages           │ │
│ │ [ ] Exercise 30 min         │ │
│ └─────────────────────────────┘ │
│                                 │
│ TODAY'S TASKS             [+]  │
│ ┌─────────────────────────────┐ │
│ │ 🔴 Finish proposal          │ │
│ │ 🟡 Team standup  ✓          │ │
│ └─────────────────────────────┘ │
│                                 │
│ (scrollable)                    │
│                                 │
├─────────────────────────────────┤
│  [🏠]    [📋]    [⚙️]    [👤]  │
│  Home   Habits  Settings Profile│
└─────────────────────────────────┘
```

---

## 5. COMPONENT REDESIGNS

### 5.1 Enhanced Stat Cards

#### Current Design (`daily-snapshot.tsx`)

```
┌────────────────────────────┐
│ [🎯] Active Habits         │  ← tiny grey icon + text in a row
│                            │
│ 7                          │  ← text-3xl font-bold
│                            │
└────────────────────────────┘

- Flat bordered box
- Icon and title on same line, both grey
- No visual weight
```

#### V2 Design

```
┌────────────────────────────────┐
│                                │
│  ┌──────┐                      │
│  │ [🎯] │  Active Habits       │  ← icon in colored circle
│  │      │                      │
│  └──────┘  7                   │  ← font-display text-3xl font-bold
│            ────────────        │
│            +15% vs yesterday   │  ← trend indicator
│                                │
└────────────────────────────────┘
```

#### Specifications

| Property | Current | V2 |
|----------|---------|-----|
| Layout | Vertical (icon+title top, value below) | Horizontal (icon circle left, content right) |
| Icon container | None | `rounded-full p-2.5` with category-colored background |
| Icon background (light) | None | `bg-emerald-100` (or semantic per card) |
| Icon background (dark) | None | `bg-emerald-900/30` |
| Shadow | None | `shadow-sm` |
| Value font | `text-3xl font-bold` | `font-display text-3xl font-bold` |
| Card border | `border border-slate-200` | `border border-slate-200` (keep) |

#### Icon Color Mapping per Card

| Card | Icon | Circle Background (Light) | Circle Background (Dark) |
|------|------|--------------------------|--------------------------|
| Active Habits | `Target` | `bg-blue-100` | `bg-blue-900/30` |
| Today's Progress | `Target` | `bg-emerald-100` | `bg-emerald-900/30` |
| Current Streak | `Flame` | `bg-orange-100` | `bg-orange-900/30` |

### 5.2 Celebration State — "All Habits Complete"

#### Current Design (`habit-checklist.tsx:69-73`)

```
──────────────────────────────────
All habits complete! 🎉            ← single line, text-emerald-600, text-sm
──────────────────────────────────
```

#### V2 Design

```
┌────────────────────────────────────────────┐
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │  ← gradient background
│                                            │
│       ┌──────┐                             │
│       │  🎉  │                             │  ← PartyPopper icon in circle
│       └──────┘                             │
│                                            │
│       Perfect day!                         │  ← font-display font-bold text-lg
│       You completed all 7 habits today.    │  ← text-sm text-muted-foreground
│                                            │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
└────────────────────────────────────────────┘
```

#### Specifications

| Property | Value |
|----------|-------|
| Background (light) | `bg-gradient-to-br from-emerald-50 to-teal-50` |
| Background (dark) | `bg-gradient-to-br from-emerald-950/30 to-teal-950/30` |
| Border | `border border-emerald-200 dark:border-emerald-800/30` |
| Border radius | `rounded-xl` |
| Padding | `p-6` |
| Icon | `PartyPopper` from lucide-react |
| Icon container | `rounded-full bg-emerald-100 dark:bg-emerald-900/50 p-3` |
| Heading | `font-display text-lg font-bold text-emerald-900 dark:text-emerald-100` |
| Subtitle | `text-sm text-emerald-700 dark:text-emerald-300` |
| Layout | Centered, icon above text |

### 5.3 Habit Card — Monthly Progress Bar

#### Current Design (`habit-card.tsx`)

```
┌────────────────────────────────┐
│ [Icon] Habit Name    [✓]      │
│        Category · Frequency    │
│                                │
│ ┌────────────┐ ┌────────────┐ │
│ │ 🔥 23 days │ │ Best: 30   │ │  ← streaks section, no monthly data
│ └────────────┘ └────────────┘ │
│                                │
└────────────────────────────────┘
```

#### V2 Design — Add Progress Bar After Streaks

```
┌────────────────────────────────┐
│ [Icon] Habit Name    [✓]      │
│        Category · Frequency    │
│                                │
│ ┌────────────┐ ┌────────────┐ │
│ │ 🔥 23 days │ │ Best: 30   │ │
│ └────────────┘ └────────────┘ │
│                                │
│ This month                 77% │  ← text-xs text-muted-foreground
│ [████████████████░░░░░░░░░░░] │  ← h-1.5 rounded-full progress bar
│                                │
└────────────────────────────────┘
```

#### Progress Bar Specifications

| Property | Value |
|----------|-------|
| Container | `h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700` |
| Fill | `bg-gradient-to-r from-emerald-500 to-emerald-400` |
| Width | Dynamic based on `monthly_completion_rate` (0-100%) |
| Label row | `flex justify-between text-xs text-muted-foreground` |
| Label left | "This month" (i18n: `habits.card.thisMonth`) |
| Label right | `"{percentage}%"` |

**Note:** This requires a backend change — adding `monthly_completion_rate` to the `HabitWithTodayStatus` type and calculating it in the habits DB layer.

### 5.4 Micro-Interactions

#### Habit Card Hover Enhancement

| Property | Current | V2 |
|----------|---------|-----|
| Shadow | `hover:shadow-md` | `hover:shadow-lg` |
| Scale | `hover:scale-[1.02]` | `hover:scale-[1.03]` |
| Translate | None | `hover:-translate-y-0.5` |
| Duration | Default | `duration-200` |
| Focus ring | `focus-visible:ring-2 focus-visible:ring-ring` | `focus-visible:ring-2 focus-visible:ring-primary` |

Combined class string:
```
transition-all hover:shadow-lg hover:scale-[1.03] hover:-translate-y-0.5 duration-200
```

---

## 6. BUG FIXES & QUICK WINS

### 6.1 Fix Broken Profile Dropdown Links

**File:** `components/profile-avatar.tsx:64-71`

**Current:** "Profile" and "Settings" menu items are bare `<DropdownMenuItem>` elements with no navigation. Only "Log out" works (handled by `ProfileAvatarClient`).

**Fix:** Wrap items with Next.js `<Link>` using `asChild` pattern:

```
<DropdownMenuItem asChild>
  <Link href="/dashboard/settings">
    <Settings className="mr-2 h-4 w-4" />
    <span>Settings</span>
  </Link>
</DropdownMenuItem>
```

Both "Profile" and "Settings" should navigate to `/dashboard/settings` (no separate profile page exists).

### 6.2 Remove Duplicate "My Habits" Title

**Current state:**
- `habits-page-content.tsx:77` renders `<h1>` with `t("page.title")` → "My Habits"
- `habit-list.tsx:92` renders another `<h1>` with `t("list.title")` → "My Habits"

**Fix:** Remove the `<h1>` from `habit-list.tsx:91-93`. The page-level title in `habits-page-content.tsx` is the correct one.

### 6.3 Landing Page Color Alignment

**Current:** Landing page uses `blue-600` for:
- Hero CTA button: `bg-blue-600 hover:bg-blue-700`
- Hero gradient text: `from-blue-600 to-purple-600`
- Hero background: `from-blue-50 ... to-purple-50`
- Feature icons: `text-blue-600`
- Stats section: `bg-blue-600 text-white`
- CTA button: `bg-blue-600 hover:bg-blue-700`

**V2:** Shift to emerald to match the new app-wide primary:

| Element | Current | V2 |
|---------|---------|-----|
| Hero CTA button | `bg-blue-600 hover:bg-blue-700` | `bg-emerald-600 hover:bg-emerald-700` |
| Hero gradient text | `from-blue-600 to-purple-600` | `from-emerald-600 to-teal-500` |
| Hero background | `from-blue-50 ... to-purple-50` | `from-emerald-50 ... to-teal-50` |
| Feature icons | `text-blue-600` | `text-emerald-600` |
| Stats section | `bg-blue-600` | `bg-emerald-600` |
| Stats subtitle | `text-blue-100` | `text-emerald-100` |
| CTA button | `bg-blue-600 hover:bg-blue-700` | `bg-emerald-600 hover:bg-emerald-700` |

### 6.4 App Header Logo Color

**Current:** `app-layout.tsx:15`
```
bg-gradient-to-r from-blue-600 to-purple-600
```

**V2:** Align with emerald identity:
```
bg-gradient-to-r from-emerald-600 to-teal-500
```

---

## 7. RESPONSIVE BEHAVIOR

### 7.1 Breakpoint Strategy

| Breakpoint | Navigation | Layout |
|------------|-----------|--------|
| < 768px (mobile) | Bottom nav visible, top nav hidden | Single column, stacked |
| >= 768px (tablet/desktop) | Top nav visible, bottom nav hidden | Multi-column grid |

### 7.2 Content Clearance

| Viewport | Bottom padding | Reason |
|----------|---------------|--------|
| Mobile | `pb-20` (80px) | Clears 64px bottom nav + 16px breathing |
| Desktop | `pb-0` | No bottom nav |

### 7.3 Safe Area Handling (iOS)

The bottom nav uses `pb-[env(safe-area-inset-bottom)]` to account for the iPhone home indicator bar. The `<html>` element should have `viewport-fit=cover` in the meta viewport tag for this to work.

---

## 8. ACCESSIBILITY

### 8.1 Navigation Accessibility

| Requirement | Implementation |
|------------|----------------|
| Bottom nav role | `<nav aria-label="Main navigation">` |
| Active state announcement | `aria-current="page"` on active tab |
| Focus visible | `focus-visible:ring-2 focus-visible:ring-primary` on all tabs |
| Reduced motion | `motion-reduce:transition-none motion-reduce:hover:scale-100` |

### 8.2 Color Contrast

The emerald-600 (`#059669`) on white background has a contrast ratio of 4.58:1 (meets WCAG AA for normal text, AAA for large text). The emerald-500 (`#10b981`) on dark backgrounds (slate-950) has a ratio of 8.2:1 (meets AAA).

### 8.3 Progress Bar

The monthly progress bar in habit cards is purely decorative (the percentage is displayed as text). It should have `aria-hidden="true"` on the bar element and rely on the text label for screen readers.

---

## 9. DARK MODE

All V2 changes maintain dark mode parity:

| Element | Light | Dark |
|---------|-------|------|
| Primary color | emerald-600 | emerald-500 |
| Stat card icon bg | `bg-{color}-100` | `bg-{color}-900/30` |
| Celebration bg | `from-emerald-50 to-teal-50` | `from-emerald-950/30 to-teal-950/30` |
| Progress bar track | `bg-slate-200` | `bg-slate-700` |
| Bottom nav bg | `bg-background/95 backdrop-blur` | Same (uses CSS variable) |
| Active tab text | `text-emerald-600` | `text-emerald-400` |

---

## 10. i18n IMPACT

### New Translation Keys Required

| Key | EN | ZH (Simplified) | ZH-TW (Traditional) |
|-----|----|----|------|
| `common.nav.profile` | Profile | 个人资料 | 個人資料 |
| `habits.card.thisMonth` | This month | 本月 | 本月 |
| `dashboard.habits.perfectDay` | Perfect day! | 完美的一天！ | 完美的一天！ |
| `dashboard.habits.allCompletedDesc` | You completed all {count} habits today. | 你今天完成了所有 {count} 个习惯。 | 你今天完成了所有 {count} 個習慣。 |

### Existing Keys Reused

- `common.nav.dashboard`, `common.nav.habits`, `common.nav.settings` — all exist
- `dashboard.habits.allComplete` — exists, used for celebration heading

---

## 11. PHASING & PRIORITY

| Phase | Scope | Priority | Impact |
|-------|-------|----------|--------|
| **Phase 1** | Mobile bottom navigation | P0 — Critical | Unblocks mobile usability |
| **Phase 2A** | Typography (Lexend + font-display) | P1 — High | Big visual differentiation |
| **Phase 2B** | Color system (emerald primary) | P1 — High | Brand cohesion |
| **Phase 3A** | Enhanced stat cards | P2 — Medium | Dashboard polish |
| **Phase 3B** | Celebration state | P2 — Medium | User delight |
| **Phase 3C** | Habit card progress bars | P2 — Medium | Requires backend change |
| **Phase 3D** | Micro-interaction refinements | P2 — Medium | Final polish |
| **Phase 4** | Bug fixes + landing page alignment | P2 — Medium | Quick wins |
| **Phase 5** | Celebration animations (framer-motion) | P3 — Stretch | Deferred |

---

## 12. WHAT'S NOT CHANGING

The following elements from V1 remain as-is:

- **Habit detail page** — heatmap, statistics, action buttons
- **Create/Edit habit form** — category selector, frequency picker
- **Empty states** — first-time user experience
- **Skeleton loading states** — dashboard and habits page skeletons
- **Task components** — task cards, task form, task list
- **Settings page** — preferences, profile settings

---

## 13. FUTURE CONSIDERATIONS (V3+)

| Feature | Notes |
|---------|-------|
| **Celebration animations** | Requires `framer-motion` (~50KB). Confetti on streak milestones (7, 30, 100, 365). Deferred to V3 to keep bundle size in check. |
| **Custom theme colors** | Let users pick their own accent color (emerald, blue, purple, etc.) |
| **Swipe gestures on mobile** | Swipe left on habit row for quick actions (pause, archive) |
| **Widget-style dashboard** | Draggable/reorderable dashboard sections |
| **Weekly summary view** | Aggregate view showing week-over-week progress |

---

**Document Version:** 2.0
**Last Updated:** February 9, 2026
**Status:** Proposed — Pending Review
