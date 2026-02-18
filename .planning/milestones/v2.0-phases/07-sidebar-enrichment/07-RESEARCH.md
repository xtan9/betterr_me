# Phase 7: Sidebar Enrichment - Research

**Researched:** 2026-02-17
**Confidence:** HIGH
**Mode:** Phase-specific implementation research

---

## Executive Summary

Phase 7 enriches the existing sidebar (built in Phases 2-3) with four distinct features: user profile footer with account dropdown, collapsible section groups, live notification badges, and relocated theme/language switchers. The codebase is well-prepared for all four -- the required shadcn/ui primitives (`SidebarFooter`, `SidebarGroupLabel`, `SidebarMenuBadge`, `Avatar`, `DropdownMenu`, `Collapsible`) are already installed, the user profile API (`/api/profile`) and dashboard stats API (`/api/dashboard`) already exist with the exact data needed, and the `SidebarFooter` placeholder was explicitly left empty for this phase.

The main technical challenge is making these features work correctly in both expanded and collapsed (icon) sidebar modes, and ensuring the notification badge data does not introduce N+1 API calls or excessive re-renders across all sidebar-containing pages.

---

## 1. Current State Analysis

### 1.1 Sidebar Architecture (from Phases 2-3)

**File structure:**
- `components/ui/sidebar.tsx` -- shadcn/ui primitive (DO NOT EDIT)
- `components/layouts/app-sidebar.tsx` -- main sidebar component (client, `"use client"`)
- `components/layouts/sidebar-layout.tsx` -- state hub: pin/hover/open logic
- `components/layouts/sidebar-shell.tsx` -- async server component, reads cookies

**Current AppSidebar structure:**
```
Sidebar (collapsible="icon")
  SidebarHeader -- brand logo + pin button
  SidebarContent
    SidebarGroup
      SidebarGroupContent
        SidebarMenu
          3x SidebarMenuItem (Dashboard, Habits, Tasks)
  SidebarFooter -- EMPTY (placeholder for Phase 7)
```

**Key constraints from prior phases:**
- `SidebarLayout` is the state hub: `pin` (cookie) + `hoverOpen` (transient) -> `open = pinned || hoverOpen`
- `collapsible="icon"` mode collapses to 3rem (48px) icon rail
- `SidebarShell` is an async server component; `AppSidebar` is a client component
- Active state matching includes `/dashboard/settings` path under Dashboard

### 1.2 Available shadcn/ui Primitives (Already Installed)

| Component | File | Status |
|-----------|------|--------|
| `SidebarFooter` | `components/ui/sidebar.tsx` | Installed, exported, used (empty) |
| `SidebarGroupLabel` | `components/ui/sidebar.tsx` | Installed, exported, NOT used yet |
| `SidebarMenuBadge` | `components/ui/sidebar.tsx` | Installed, exported, NOT used yet |
| `Avatar`, `AvatarImage`, `AvatarFallback` | `components/ui/avatar.tsx` | Installed |
| `DropdownMenu` + all sub-components | `components/ui/dropdown-menu.tsx` | Installed, used by ThemeSwitcher + LanguageSwitcher |
| `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` | `components/ui/collapsible.tsx` | Installed |
| `Badge` | `components/ui/badge.tsx` | Installed |

**No new shadcn/ui components need to be installed.**

### 1.3 Existing Data Sources

**User profile data:** `GET /api/profile` returns `{ profile: { id, email, full_name, avatar_url, preferences } }`. Already used by settings page via SWR at key `/api/profile`.

**Dashboard stats (for badges):** `GET /api/dashboard?date=YYYY-MM-DD` returns `stats: { total_habits, completed_today, tasks_due_today, tasks_completed_today, ... }`. Already used by dashboard page via SWR.

**Tasks due today:** `GET /api/tasks?view=today` returns incomplete tasks due today. Could derive count from this.

**Overdue tasks:** `GET /api/tasks?view=overdue` returns overdue incomplete tasks.

### 1.4 Existing Theme/Language Switchers

- `components/theme-switcher.tsx` -- uses `next-themes` (`useTheme`), renders a `DropdownMenu` with radio items (Light/Dark/System). Currently imported only by `components/navbar.tsx` (public landing page).
- `components/language-switcher.tsx` -- uses `next-intl` (`useLocale`), renders a `DropdownMenu` with locale options. Also only imported by `components/navbar.tsx`.
- `components/navbar.tsx` -- only used on the public landing page (`app/page.tsx`). NOT used in authenticated routes. The authenticated routes use SidebarShell which has no theme/language controls currently.

**Critical finding:** Theme and language switchers are NOT currently accessible in the authenticated app at all. They only exist on the landing page navbar. This means Phase 7 is adding them to the authenticated experience, not "moving" them from a header.

---

## 2. Requirement Analysis

### SIDE-05: User Profile in Sidebar Footer

**What:** Avatar, name, account dropdown with logout/settings links.

**Data source:** `GET /api/profile` -- profile has `full_name`, `avatar_url`, `email`.

**Pattern:** The shadcn/ui sidebar docs show the canonical pattern:
```tsx
<SidebarFooter>
  <SidebarMenu>
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton size="lg">
            <Avatar className="h-8 w-8">
              <AvatarImage src={profile.avatar_url} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">{profile.full_name}</span>
              <span className="truncate text-xs text-muted-foreground">{profile.email}</span>
            </div>
            <ChevronsUpDown className="ml-auto size-4" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-[--radix-dropdown-menu-trigger-width]">
          <DropdownMenuLabel>My Account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/dashboard/settings">Settings</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut}>Log out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  </SidebarMenu>
</SidebarFooter>
```

**Chameleon reference:** Bottom-left of sidebar shows avatar image, "Steven Tan", "Flexport Inc." and a settings gear icon. Our design will show avatar, name, email (or truncated email), and use a dropdown for settings/logout instead of a gear icon.

**Icon mode behavior:** In collapsed mode, `SidebarMenuButton` with `size="lg"` renders at `!p-0` with `!size-8`. The text and chevron are hidden via `group-data-[collapsible=icon]` selectors. The avatar remains visible as the trigger. The dropdown still works from the icon.

**Existing logout logic:** `components/logout-button.tsx` and `components/profile-avatar-client.tsx` both call `supabase.auth.signOut()` then redirect. We should extract and reuse this pattern.

**Confidence:** HIGH -- all primitives exist, pattern is well-documented.

### SIDE-08: Collapsible Section Groups

**What:** Organize nav items into collapsible groups -- Main (Dashboard, Habits, Tasks) and Account (Settings).

**Pattern:** shadcn/ui supports this via `Collapsible` wrapping `SidebarGroup`:
```tsx
<Collapsible defaultOpen className="group/collapsible">
  <SidebarGroup>
    <SidebarGroupLabel asChild>
      <CollapsibleTrigger>
        Main
        <ChevronDown className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-180" />
      </CollapsibleTrigger>
    </SidebarGroupLabel>
    <CollapsibleContent>
      <SidebarGroupContent>
        <SidebarMenu>
          {/* nav items */}
        </SidebarMenu>
      </SidebarGroupContent>
    </CollapsibleContent>
  </SidebarGroup>
</Collapsible>
```

**Icon mode behavior:** `SidebarGroupLabel` applies `group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0` -- the label hides, but the nav items remain visible as icons. This is the correct behavior: group labels disappear in icon mode, items show as icon rail.

**Settings nav item:** Currently Settings is at `/dashboard/settings` and the Dashboard nav item matches it. With sections, Settings becomes its own nav item under the "Account" group with a `Settings` (gear) icon. The Dashboard active state match should be updated to NOT include `/dashboard/settings` since Settings gets its own entry.

**Decision:** Both groups should default to `open` (not collapsed). For a small nav like this (3+1 items), collapsing groups would hide too much. The groups serve as visual organizers, not space savers.

**Confidence:** HIGH -- standard shadcn pattern.

### SIDE-10: Notification Badges on Nav Items

**What:** Live data badges showing tasks due count, incomplete habits count.

**Component:** `SidebarMenuBadge` is already in `components/ui/sidebar.tsx`:
```tsx
<SidebarMenuItem>
  <SidebarMenuButton asChild isActive={...} tooltip={t(item.labelKey)}>
    <Link href={item.href}>
      <item.icon />
      <span>{t(item.labelKey)}</span>
    </Link>
  </SidebarMenuButton>
  <SidebarMenuBadge>3</SidebarMenuBadge>
</SidebarMenuItem>
```

**Icon mode behavior:** `SidebarMenuBadge` applies `group-data-[collapsible=icon]:hidden` -- badges are hidden when collapsed to icon mode. This is the correct UX (badges would overlap icons in the 48px rail).

**Data strategy -- CRITICAL DECISION:**

Option A: Reuse existing SWR cache from dashboard page.
- Dashboard already fetches `/api/dashboard?date=YYYY-MM-DD` which contains `stats.tasks_due_today` and stats about habits.
- Problem: This SWR key includes the date, and the sidebar is rendered on ALL pages (habits, tasks, settings), not just dashboard. SWR would deduplicate on the same key but only if the components share the same cache. Since SidebarProvider wraps all pages, the cache IS shared.
- Problem: The dashboard fetches the full dashboard payload (habits array, tasks arrays, etc.) -- heavy for just getting counts.

Option B: Create a lightweight `/api/sidebar/counts` endpoint.
- Returns just `{ tasks_due: number, habits_incomplete: number }`.
- Minimal payload, fast query (two COUNT queries).
- Sidebar fetches this independently with its own SWR key.
- Can have a longer `refreshInterval` (e.g., 5 minutes) since badge counts are informational, not critical.

Option C: Create a `useSidebarCounts` hook that fetches `/api/tasks?view=today` and `/api/habits` with filters.
- Reuses existing endpoints but makes 2 API calls.
- More coupling to existing API shape.

**Recommendation: Option B** -- create a dedicated `/api/sidebar/counts` endpoint. Rationale:
1. Minimal payload (just two numbers) vs. full dashboard data
2. Independent refresh interval appropriate for sidebar context
3. No coupling to dashboard page's SWR key (which includes date)
4. Two simple COUNT queries in one endpoint is optimal
5. Sidebar badge data needs to work on ALL pages, not just dashboard

**What badges to show:**
- **Tasks:** Count of incomplete tasks due today (or overdue). Show if > 0.
- **Habits:** Count of habits not yet completed today. Show if > 0.
- **Dashboard:** No badge needed (it is the overview page).
- **Settings:** No badge needed.

**Badge UX:** Show numeric count. Cap at "9+" for visual consistency. Do not show badge when count is 0.

**Confidence:** HIGH for the UI pattern, MEDIUM for the API strategy (Option B is sound but needs implementation).

### VISL-09: Theme and Language Switchers in Sidebar

**What:** Move theme and language switchers to the sidebar, remove from any top header.

**Current state:** Switchers only exist in `components/navbar.tsx` (landing page). They are NOT in the authenticated app header at all. The mobile header in `sidebar-layout.tsx` only has a `SidebarTrigger` and brand name.

**Placement options:**

Option A: In the SidebarFooter, above or below the user profile.
- Con: Footer gets crowded with profile + theme + language.
- Con: In icon mode, the footer only shows the avatar; theme/language would need to be in the dropdown.

Option B: In the user profile DropdownMenu.
- Theme and language become dropdown menu items.
- Matches the Chameleon pattern where the settings gear opens account options.
- Con: Requires sub-menus or dedicated sections within the dropdown.

Option C: In a separate SidebarGroup at the bottom of SidebarContent (above footer).
- Clean separation.
- Con: Adds visual weight to the sidebar.

Option D: In the SidebarFooter as icon buttons next to the user profile trigger.
- Shows icons for theme (Sun/Moon) and language (Globe) in the footer row.
- In icon mode, these stack vertically.

**Recommendation: Option B (in the dropdown menu)** combined with Option D (icon buttons in footer for quick access).

Actually, re-evaluating based on the requirement "Theme and language switchers are accessible from the sidebar (removed from any top header area)":

**Final recommendation:** Place both switchers **inside the user account dropdown menu** in the sidebar footer. This keeps the sidebar clean, provides a natural grouping (account-level preferences), and avoids cluttering the sidebar with extra controls. The dropdown will have sections:
1. Account label (name/email)
2. Settings link
3. Separator
4. Theme selector (radio group or sub-section)
5. Language selector (radio group or sub-section)
6. Separator
7. Log out

For the theme switcher specifically, a simple toggle row with icons (Sun | Moon | Monitor) works well in a dropdown. For language, a sub-menu or inline radio group.

**However, there is a UX consideration:** Changing language triggers a full page reload (`window.location.reload()`). This is fine from a dropdown -- the dropdown closes, page reloads. Theme changes are instant via `next-themes`.

**Icon mode behavior:** In icon mode, the user clicks the avatar (visible), which opens the dropdown with all options including theme/language. This works perfectly.

**Confidence:** HIGH

---

## 3. Architecture Decisions

### 3.1 Component Structure

```
components/layouts/app-sidebar.tsx  (modified)
  -- Imports new sub-components
  -- Restructured nav into collapsible groups
  -- Adds SidebarMenuBadge per item

components/layouts/sidebar-user-footer.tsx  (NEW)
  -- SidebarFooter content: avatar, name, dropdown
  -- DropdownMenu with settings link, theme, language, logout
  -- Uses SWR to fetch profile data

components/layouts/sidebar-nav-badge.tsx  (NEW, optional)
  -- Small component rendering SidebarMenuBadge with count
  -- Or inline in app-sidebar.tsx

lib/hooks/use-sidebar-counts.ts  (NEW)
  -- SWR hook for /api/sidebar/counts
  -- Returns { tasksDue: number, habitsIncomplete: number }

app/api/sidebar/counts/route.ts  (NEW)
  -- Lightweight endpoint returning badge counts
  -- Two COUNT queries to Supabase
```

### 3.2 Data Flow

```
SidebarShell (server)
  -> reads sidebar_pinned cookie
  -> renders SidebarLayout (client)
    -> renders AppSidebar (client)
      -> useSidebarCounts() hook -- SWR fetch /api/sidebar/counts
      -> renders nav groups with badges
      -> renders SidebarUserFooter (client)
        -> useSWR('/api/profile') -- shares cache with settings page
        -> renders avatar + dropdown with theme/language/logout
```

### 3.3 SWR Cache Sharing

The profile data SWR key `/api/profile` is already used by the settings page (`components/settings/settings-content.tsx` and `components/settings/profile-form.tsx`). When the user is on the settings page and updates their profile, `mutate('/api/profile')` is called, which will automatically update the sidebar footer's display name/avatar. This is a free benefit of SWR deduplication.

### 3.4 i18n Keys Needed

New translation keys required across all three locale files:
```json
{
  "common": {
    "sidebar": {
      "mainGroup": "Main",
      "accountGroup": "Account",
      "myAccount": "My Account",
      "logOut": "Log out",
      "theme": "Theme",
      "language": "Language",
      "themeLight": "Light",
      "themeDark": "Dark",
      "themeSystem": "System"
    },
    "nav": {
      "settings": "Settings"  // already exists
    }
  }
}
```

---

## 4. Pitfalls and Risks

### 4.1 CRITICAL: Icon Mode Dropdown Positioning

When the sidebar is in collapsed (icon) mode, the `DropdownMenu` in the footer must open correctly. The trigger is the 8x8 avatar. The dropdown should open to the right (`side="right"`) in icon mode, but upward (`side="top"`) in expanded mode.

**Mitigation:** Use `useSidebar()` hook to read `state` ("expanded" | "collapsed") and conditionally set `side` prop on `DropdownMenuContent`. Or always use `side="top"` which works in both modes since the footer is at the bottom.

### 4.2 CRITICAL: Avoiding Excessive API Calls

The sidebar renders on EVERY authenticated page. If useSidebarCounts() fetches on every page mount, it could create excessive API calls.

**Mitigation:**
- Set `refreshInterval: 300000` (5 minutes) -- badge counts are informational
- Set `revalidateOnFocus: false` -- prevent re-fetch on tab switch
- SWR's built-in deduplication prevents duplicate in-flight requests
- `dedupingInterval: 60000` (1 minute) prevents refetching within 1 minute

### 4.3 MODERATE: Theme Switcher in Dropdown vs. Standalone

The current `ThemeSwitcher` component uses its own `DropdownMenu`. Nesting a `DropdownMenu` inside another `DropdownMenu` would create a sub-menu interaction. This is supported by Radix UI but can be confusing UX.

**Mitigation:** Do NOT nest dropdown menus. Instead, render theme options as `DropdownMenuRadioGroup` items directly inside the account dropdown. Extract the theme logic (useTheme) inline rather than importing the existing `ThemeSwitcher` component.

### 4.4 MODERATE: Language Change Triggers Page Reload

The current `LanguageSwitcher` calls `window.location.reload()` on locale change. This is fine behavior but the dropdown will close (unmount) during reload. No special handling needed -- just ensure the cookie is set before reload.

### 4.5 MODERATE: Updating Dashboard Active State Match

Currently, Dashboard nav item matches `/dashboard/settings`. When Settings gets its own nav item, the Dashboard match function must be updated to exclude `/dashboard/settings`. Otherwise both Dashboard and Settings will show as active simultaneously.

**Current:** `match: (p: string) => p === "/dashboard" || p === "/dashboard/settings"`
**Updated:** `match: (p: string) => p === "/dashboard"`

### 4.6 MINOR: Avatar Loading State

The profile data loads asynchronously. The sidebar footer should show a skeleton or fallback while loading. `AvatarFallback` already handles the case where avatar_url is null or loading.

### 4.7 MINOR: SidebarGroupLabel in Icon Mode

Group labels auto-hide in icon mode via built-in CSS (`opacity-0`, `-mt-8`). No special handling needed. But the `CollapsibleContent` wrapper could interfere with this if not careful.

**Mitigation:** Test that collapsible groups degrade correctly to icon mode. The `CollapsibleContent` should remain open (not animated closed) in icon mode -- the `Collapsible` should have `defaultOpen={true}` and the collapsed icon mode hides labels via CSS, not via collapsible state.

---

## 5. Implementation Plan Recommendations

### Task Breakdown (3 tasks recommended)

**Task 07-01: Collapsible Section Groups + Settings Nav Item**
- Restructure `app-sidebar.tsx` nav items into two groups: Main (Dashboard, Habits, Tasks) and Account (Settings)
- Add `SidebarGroupLabel` with `Collapsible` wrappers
- Add Settings nav item with Settings/gear icon
- Update Dashboard active state match to exclude `/dashboard/settings`
- Add i18n keys for group labels
- Update existing `app-sidebar.test.tsx`
- Scope: `app-sidebar.tsx`, i18n files, test file
- Risk: LOW -- straightforward restructuring

**Task 07-02: User Profile Footer with Account Dropdown**
- Create `SidebarUserFooter` component in sidebar footer
- Fetch user profile via SWR (`/api/profile`)
- Render Avatar + name + email
- DropdownMenu with Settings link and Log out action
- Integrate theme switching (inline radio group) and language switching (inline radio group) into dropdown
- Handle icon mode: avatar-only trigger, dropdown opens correctly
- Handle loading state with skeleton/fallback
- Remove or deprecate standalone `ThemeSwitcher`/`LanguageSwitcher` usage in navbar (if navbar still exists for landing page, keep them there)
- Add i18n keys for dropdown items
- Write tests for SidebarUserFooter
- Scope: New component, `app-sidebar.tsx` (integrate footer), i18n files, tests
- Risk: MEDIUM -- dropdown content complexity, icon mode positioning

**Task 07-03: Notification Badges with Live Data**
- Create `/api/sidebar/counts` endpoint (tasks due today + incomplete habits today)
- Create `useSidebarCounts` hook with SWR
- Add `SidebarMenuBadge` to Tasks and Habits nav items
- Badge shows count when > 0, hidden when 0
- Cap display at "9+"
- Write tests for API endpoint, hook, and badge rendering
- Scope: New API route, new hook, `app-sidebar.tsx` modification, tests
- Risk: MEDIUM -- API design, SWR configuration for sidebar context

### Task Ordering

07-01 -> 07-02 -> 07-03

Rationale:
1. **07-01 first:** Restructuring groups is the foundation. Adding Settings as a nav item is needed before the footer dropdown links to it.
2. **07-02 second:** Footer with profile and dropdown. This is the most complex visual change. Theme/language integration in the dropdown should be done here.
3. **07-03 last:** Badges depend on the nav structure from 07-01 being stable. The API endpoint and SWR hook are self-contained additions.

Tasks 07-02 and 07-03 are technically independent (could be parallel), but sequential ordering reduces merge conflicts in `app-sidebar.tsx`.

---

## 6. Files Modified/Created

### Modified
| File | Changes |
|------|---------|
| `components/layouts/app-sidebar.tsx` | Add groups, Settings nav item, badges, integrate footer component |
| `tests/components/layouts/app-sidebar.test.tsx` | Update for groups, Settings item, badges |
| `i18n/messages/en.json` | Add sidebar group/account/theme/language keys |
| `i18n/messages/zh.json` | Add sidebar group/account/theme/language keys |
| `i18n/messages/zh-TW.json` | Add sidebar group/account/theme/language keys |

### Created
| File | Purpose |
|------|---------|
| `components/layouts/sidebar-user-footer.tsx` | User profile + account dropdown in sidebar footer |
| `lib/hooks/use-sidebar-counts.ts` | SWR hook for badge counts |
| `app/api/sidebar/counts/route.ts` | Lightweight badge count endpoint |
| `tests/components/layouts/sidebar-user-footer.test.tsx` | Tests for footer component |
| `tests/lib/hooks/use-sidebar-counts.test.ts` | Tests for counts hook |
| `tests/app/api/sidebar/counts/route.test.ts` | Tests for counts API |

---

## 7. Verification Criteria

### SIDE-05 (User Profile Footer)
- [ ] Avatar (with fallback initials) visible in sidebar footer
- [ ] Full name and email displayed (expanded mode)
- [ ] Only avatar visible in icon (collapsed) mode
- [ ] Clicking avatar/button opens dropdown menu
- [ ] Dropdown contains "Settings" link navigating to `/dashboard/settings`
- [ ] Dropdown contains "Log out" action that signs out and redirects
- [ ] Profile data stays in sync when updated on settings page (SWR cache)

### SIDE-08 (Collapsible Section Groups)
- [ ] Nav items organized into "Main" (Dashboard, Habits, Tasks) and "Account" (Settings)
- [ ] Group labels visible in expanded mode, hidden in icon mode
- [ ] Groups default to open
- [ ] Collapsible trigger toggles group open/closed with chevron animation
- [ ] Settings nav item shows gear icon and "Settings" label
- [ ] Settings nav item is active when on `/dashboard/settings`
- [ ] Dashboard nav item is NOT active when on `/dashboard/settings`

### SIDE-10 (Notification Badges)
- [ ] Habits nav item shows count of incomplete habits today (when > 0)
- [ ] Tasks nav item shows count of tasks due today (when > 0)
- [ ] Badges hidden when count is 0
- [ ] Badges hidden in icon (collapsed) mode
- [ ] Badge counts update when habits are toggled or tasks are completed
- [ ] Badge counts capped at "9+" for display
- [ ] No excessive API calls (deduplication + long refresh interval)

### VISL-09 (Theme/Language in Sidebar)
- [ ] Theme options (Light/Dark/System) accessible from account dropdown
- [ ] Language options (English, Chinese Simplified, Chinese Traditional) accessible from account dropdown
- [ ] Theme change takes effect immediately (no page reload)
- [ ] Language change sets cookie and reloads page
- [ ] No theme/language controls in the authenticated app's top header area
- [ ] Landing page navbar retains its own theme/language switchers (separate concern)

---

## 8. Sources

- shadcn/ui Sidebar docs: https://ui.shadcn.com/docs/components/sidebar (SidebarFooter, SidebarGroupLabel, SidebarMenuBadge patterns)
- shadcn/ui Sidebar blocks: https://ui.shadcn.com/blocks/sidebar (user footer with dropdown examples)
- Existing codebase: `components/ui/sidebar.tsx` (lines 636-655 for SidebarMenuBadge, 378-391 for SidebarFooter, 441-459 for SidebarGroupLabel)
- Existing codebase: `components/layouts/app-sidebar.tsx` (current sidebar structure)
- Existing codebase: `app/api/profile/route.ts` (profile data endpoint)
- Existing codebase: `app/api/dashboard/route.ts` (dashboard stats for reference)
- Chameleon reference: `chameleon-sidebar.png` (user avatar in bottom-left footer pattern)
