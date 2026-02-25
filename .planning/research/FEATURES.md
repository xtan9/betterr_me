# Feature Landscape

**Domain:** Reflective journaling with mood tracking in a personal habit tracking & productivity app
**Researched:** 2026-02-22
**Overall confidence:** MEDIUM-HIGH

## Context: What Exists Today

BetterR.Me already has:
- **Habits:** Create/edit/delete with 5 frequency types, toggle completion, 30-day heatmap, streaks, stats, milestones/badges
- **Tasks:** CRUD with priorities, due dates, Work/Personal sections, project association, kanban boards
- **Dashboard:** Daily snapshot (stats cards), habit checklist, tasks today, motivation messages, weekly insights, absence recovery cards, milestone celebrations
- **Sidebar:** 3 nav items (Dashboard, Habits, Tasks) with badge counts
- **UI primitives:** shadcn/ui Calendar component (react-day-picker), Textarea, existing design token system
- **i18n:** Three locale files (en, zh, zh-TW) using next-intl
- **Data fetching:** SWR with optimistic mutations, client-sent dates (never server-local time)

The v4.0 milestone adds: A journal/diary layer with daily entries, mood tracking, writing prompts, optional habit/task linking, calendar view, timeline feed, sidebar nav entry, and a dashboard quick-entry widget.

---

## Table Stakes

Features users expect from ANY journaling feature in a productivity/habit tracking app. Missing any of these would make the journal feel broken or half-baked.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| **Daily journal entry with text area** | The fundamental journal action -- write about your day. Every journal app (Day One, Daylio, Finch) centers on this. Users expect a generous text area for free-form writing, not a tiny input field. | Low | New `journal_entries` table, API routes, Zod validation | Use existing shadcn/ui Textarea. Plain text is sufficient for v1 -- rich text editors (TipTap, TinyMCE) add massive complexity (XSS sanitization, storage format, toolbar UI) for marginal value in a personal journal. Character limit ~5000 is generous without being excessive. |
| **One entry per day model** | Daylio, Finch, and most habit-adjacent journals use one-entry-per-day. Multiple entries per day is a notebook paradigm (Day One), not a reflection paradigm. One entry keeps the UX simple: today either has an entry or it doesn't. | Low | Unique constraint on (user_id, entry_date) | This is the right model for BetterR.Me's reflection focus. If users want to add to today's entry, they edit it. The calendar view becomes trivially simple: filled or empty. |
| **Mood selection per entry** | Mood tracking is the #1 reason users combine journaling with habit tracking. Daylio's entire product is built on mood + activities. Finch uses 1-5 scale with face emojis. Users expect to quickly tag how they felt today. | Low | `mood` column (integer 1-5) on journal_entries table | Use a 5-point scale with emoji/icon faces: very bad (1), bad (2), neutral (3), good (4), great (5). This is the Daylio/Finch standard. Render as 5 clickable icons in a row -- one tap selection. Null means no mood selected (optional). |
| **Edit existing entries** | Users revisit past entries to add thoughts, fix typos, or update mood after reflection. Every journal app supports editing. | Low | PATCH endpoint on journal entry API | Allow editing any past entry within a reasonable window (no artificial time lock -- this is a personal app). |
| **Delete entries** | Users must be able to remove entries they no longer want. | Low | DELETE endpoint on journal entry API | Simple delete with confirmation (existing window.confirm pattern is fine for now, matching the app's current pattern). |
| **Journal page with entry list** | Users need a dedicated place to see and manage their journal. A full page accessible from sidebar navigation. | Medium | New `/journal` route, page component, sidebar nav item (BookOpen icon) | Show entries in reverse chronological order. This is the "home" of the journal feature. |
| **Calendar view showing entries** | Users expect to see at-a-glance which days have journal entries. This is the journal equivalent of the habit heatmap. Daylio's "Year in Pixels" is iconic. Finch shows a mood calendar. | Medium | Extend existing shadcn/ui Calendar component with entry indicators, API to fetch entries for a month | Use react-day-picker (already installed via shadcn Calendar). Add dot indicators or mood-colored backgrounds on days with entries. Month navigation with prev/next arrows. |
| **Click calendar day to view/create entry** | The calendar is not just decorative -- clicking a day should navigate to that day's entry (or create a new one if none exists). This is the primary navigation pattern for journals. | Low | Calendar day click handler, route to entry page/form | Day One and Daylio both use this pattern. Clicking a day with an entry shows it; clicking an empty day opens the create form. |
| **Sidebar navigation entry** | Users must find the journal. Adding a 4th nav item in the sidebar is the natural integration point. | Low | Add to `mainNavItems` array in app-sidebar.tsx | Use `BookOpen` or `NotebookPen` from Lucide (already in the project's icon library). Match existing nav item pattern exactly. |
| **i18n for all journal UI** | BetterR.Me supports en, zh, zh-TW. All journal strings must be translated. | Medium | Add journal namespace to all 3 locale JSON files | This is not optional -- it's a project constraint. Translating ~50-80 new string keys across 3 files. Includes prompts, mood labels, UI labels, error messages, empty states. |
| **Dark mode support** | BetterR.Me has dark mode throughout. Journal UI must respect existing design tokens. | Low | Use existing CSS custom properties (bg-card, text-foreground, etc.) | Not a separate feature -- it's a constraint. Using shadcn/ui components and existing tokens gets this for free. |

---

## Differentiators

Features that set BetterR.Me's journal apart from standalone journal apps. These leverage the existing habit/task ecosystem to create something neither a pure journal (Day One) nor a pure tracker (Daylio) offers.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **Writing prompts (gratitude, reflection, goals)** | Reduces blank-page anxiety. Studies show prompted journaling is 42% more effective for goal achievement than unprompted writing. Finch's "guided reflections" are one of its most praised features. BetterR.Me can offer categorized prompts: gratitude ("What are you thankful for today?"), reflection ("What challenged you today?"), and goals ("What will you focus on tomorrow?"). | Medium | Static prompt library (JSON/TS constant), prompt category type, UI to show/dismiss/shuffle prompts | Ship with 15-20 built-in prompts across 3 categories, all translated to 3 locales. Show a random prompt as placeholder/suggestion in the text area. User can dismiss or tap "another prompt" to shuffle. NO AI-generated prompts -- static library is simpler, predictable, and works offline. |
| **Optional habit/task linking** | The unique BetterR.Me differentiator. No competitor links journal entries to specific habits or tasks. "I journaled about my morning run habit" creates a reflective connection between doing and thinking. Users can optionally tag which habits they completed or tasks they worked on. | Medium | `journal_entry_links` junction table (entry_id, linkable_type, linkable_id), UI multi-select for habits/tasks | Keep it lightweight: an optional "Link to habits/tasks" section at the bottom of the entry form. Show today's habits (completed ones first) and tasks as checkable chips. Stored as a junction table with polymorphic type column. This is NOT required for every entry -- strictly optional. |
| **Dashboard quick-entry widget** | The dashboard is where users start their day. A small "How's your day?" card with mood selector and a "Write more..." link reduces friction to zero. Finch and Daylio both surface quick mood capture on their main screen. | Low | New dashboard component, conditionally shown when no entry exists for today | Show a compact card: mood emoji row + "Add journal entry" link. Once an entry exists for today, show a preview snippet instead. Fits naturally into the existing dashboard card grid. |
| **Timeline feed for chronological reading** | Reading past entries as a continuous scroll is the "diary" experience. Day One's timeline is their signature view. A vertical timeline with date headers, mood indicators, and entry previews lets users re-read their personal story. | Medium | Timeline component, paginated API (cursor-based or offset), infinite scroll or "Load more" | Reverse chronological (newest first). Each entry card shows: date, mood emoji, first ~150 chars of text, linked habit/task count. Click to expand or navigate to full entry. Paginate with 20 entries per page. Use SWR infinite for smooth loading. |
| **Mood trends visualization** | Showing mood over time (week/month) gives users insight into emotional patterns. Daylio's "Year in Pixels" and mood charts are premium features that users love. When combined with habit completion data, users can see "I feel better on days I exercise." | High | Aggregate mood data by week/month, simple bar chart or pixel grid, correlation with habit data | Defer the correlation analysis to a future milestone. For v4.0, just show a simple mood distribution for the current month: 5 bars showing count per mood level, or a "Year in Pixels" grid using the existing heatmap pattern. The habit correlation is the killer feature but requires significant data analysis logic. |
| **"On This Day" past reflections** | Day One's signature feature. Showing "1 month ago you wrote..." or "1 year ago..." on the dashboard creates a reflective feedback loop. This is simple to implement but emotionally powerful. | Low | Query journal_entries WHERE entry_date IN (today - 30 days, today - 365 days), show in dashboard | Only show if entries exist for those dates. A small "On this day" card below the greeting. Deeply personal and zero-effort for the user. |
| **Entry word count & streak** | Gamify consistent journaling the same way BetterR.Me gamifies habit streaks. "You've journaled 7 days in a row!" encourages the reflection habit. | Low | Count consecutive days with entries, display on journal page | Reuse the existing streak calculation pattern from habits. Show current streak and longest streak on the journal page header. |

---

## Anti-Features

Features to explicitly NOT build. Either wrong for the personal reflection context, premature, or scope creep.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Rich text editor (bold, italic, lists, headings)** | TipTap, Slate, or TinyMCE add 30-100kb+ of JS, require HTML sanitization (XSS risk), complicate storage format, and make the journal feel like a document editor rather than a reflection space. Daylio, Finch, and most mood+journal apps use plain text successfully. | Use plain Textarea with generous sizing. If users want formatting, they can use markdown-like conventions. Consider a lightweight markdown renderer for DISPLAY only in a future milestone. |
| **Photo/media attachments** | File upload infrastructure (Supabase Storage buckets, presigned URLs, image optimization, thumbnail generation) is a separate project. Day One supports this; BetterR.Me should not attempt it in v4.0. | Omit entirely. Text-only journal entries. Users can paste text descriptions of moments. Photo journals can come in a future media milestone. |
| **Voice memos / audio entries** | Even more complex than photos (audio recording API, storage, playback UI). Daylio Premium supports this, but it's a significant engineering effort. | Omit. Write text. |
| **Multiple entries per day** | Adds confusion to the one-day-one-entry mental model. Calendar view becomes ambiguous. Entry list becomes noisy. Day One supports this because it's a full notebook replacement; BetterR.Me's journal is a daily reflection tool. | Enforce one entry per day via unique constraint. Users edit their single entry to add more thoughts. |
| **AI-generated prompts / AI analysis** | Requires an LLM API integration, token costs, prompt engineering, error handling for API failures, and privacy concerns (sending journal entries to a third-party AI). Not aligned with "your data stays private" ethos. | Static prompt library with 15-20 handcrafted, translated prompts. Randomized selection. No external API calls. |
| **Social sharing / export to social media** | BetterR.Me is a private reflection tool. Sharing journal entries to social media undermines the vulnerability that makes journaling effective. | Omit social features. Data export (ZIP) already exists and is sufficient for backup/portability. |
| **Tags / labels on entries** | A tagging system requires tag CRUD, tag search, tag filtering, tag autocomplete -- significant UI and data work. The habit/task linking feature already provides meaningful categorization of entries. | Use mood as the primary categorization. Use habit/task links as contextual tags. No free-form tag system. |
| **Full-text search across entries** | Postgres full-text search (tsvector/tsquery) or pg_trgm requires index creation, search query parsing, result ranking, and highlight UI. Valuable but significant effort. | Defer to a future milestone. For v4.0, users browse by calendar or scroll the timeline. Simple date-based filtering is sufficient. |
| **Notification reminders to journal** | Requires notification infrastructure (service workers, push API, Supabase Edge Functions for scheduling). BetterR.Me has no notification system today. | Omit push notifications. The dashboard quick-entry widget serves as a passive reminder -- users see it when they open the app. |
| **Entry templates (custom prompt collections)** | Template CRUD, template selector UI, template ordering -- too much meta-feature for the journal's core value. | Use the built-in prompt categories (gratitude/reflection/goals). Users can ignore prompts and write freely. |
| **Mood correlation analytics** | Analyzing "you feel happier on days you exercise" requires joining habit_logs with journal_entries, aggregating by mood level, running statistical correlations, and building chart UI. Valuable but out of scope for v4.0 MVP. | Show simple mood distribution only (count per mood level per month). Save cross-feature analytics for a dedicated "Insights v2" milestone. |
| **Entry pinning / favorites** | Minor UX feature that adds state management complexity. Users don't pin diary entries -- they read chronologically. | Omit. Timeline and calendar are sufficient for navigation. |

---

## Feature Dependencies

```
Database: journal_entries table (user_id, entry_date, content, mood, created_at, updated_at)
    |
    +--> CRUD API routes: POST/GET/PATCH/DELETE /api/journal
    |       |
    |       +--> Zod validation schemas (lib/validations/journal.ts)
    |       |
    |       +--> JournalDB class (lib/db/journal.ts)
    |
    +--> Journal page (/journal)
    |       |
    |       +--> Calendar view (reuse shadcn Calendar + entry indicators)
    |       |       |
    |       |       +--> Click day to view/create entry
    |       |
    |       +--> Timeline feed (reverse chronological, paginated)
    |       |
    |       +--> Entry form (Textarea + mood picker + optional prompt)
    |       |       |
    |       |       +--> Writing prompts (static library, 3 categories, 3 locales)
    |       |       |
    |       |       +--> Mood emoji picker (5-point scale, clickable icons)
    |       |
    |       +--> Entry view/edit (read existing, edit in-place)
    |
    +--> Sidebar nav item (4th item: Journal with BookOpen icon)
    |
    +--> Dashboard quick-entry widget (mood + "Write more..." link)
    |
    +--> i18n strings (journal namespace in en.json, zh.json, zh-TW.json)

Optional (can ship after core):
    |
    +--> journal_entry_links junction table (entry_id, linkable_type, linkable_id)
    |       |
    |       +--> Habit/task linking UI in entry form
    |
    +--> "On This Day" dashboard card (query past entries)
    |
    +--> Entry streak counter (consecutive days with entries)
    |
    +--> Mood distribution chart (aggregate mood by month)
```

**Critical path:** DB table + API + Zod schema --> Entry form (text + mood) --> Journal page (calendar + timeline) --> Sidebar nav --> Dashboard widget --> i18n

**Habit/task linking is independent** and can be built in parallel once the core entry system exists.

---

## MVP Recommendation

**Phase 1 -- Database & API Foundation:**
1. Create `journal_entries` table with RLS policies (user_id, entry_date, content, mood, prompt_category)
2. JournalDB class following existing patterns (fresh server client per request)
3. API routes: GET (list + single), POST (create), PATCH (update), DELETE
4. Zod validation schema (content max 5000 chars, mood 1-5 nullable, entry_date YYYY-MM-DD)
5. TypeScript types in `lib/db/types.ts`

**Phase 2 -- Core Journal UI:**
6. Entry form component (Textarea + mood emoji picker + optional writing prompt)
7. Writing prompt library (15-20 prompts across 3 categories, all 3 locales)
8. Mood emoji picker component (5 clickable face icons in a row)
9. Journal page with calendar view (react-day-picker with entry indicators)
10. Journal page with timeline/list view (reverse chronological, paginated)
11. Entry view/edit page (click calendar day or timeline card to see full entry)

**Phase 3 -- Integration & Polish:**
12. Sidebar nav item (BookOpen icon, `/journal` route, match pattern)
13. Dashboard quick-entry widget (compact mood selector + "Write more..." link)
14. Sidebar badge count (optional: show indicator when today has no entry)
15. i18n: all strings translated in en, zh, zh-TW

**Phase 4 -- Differentiators (optional, ship if time allows):**
16. Habit/task linking (junction table + chip selector in entry form)
17. "On This Day" dashboard card
18. Journal streak counter
19. Simple mood distribution for current month

**Defer to future milestones:**
- Mood correlation analytics ("you feel better when you exercise")
- Full-text search across entries
- Rich text / markdown support
- Photo/media attachments
- AI-powered prompts or analysis
- Push notification reminders

---

## Competitor Analysis Summary

### Daylio (closest model -- mood + micro-journal)
- **Core loop:** Select mood (5-point scale) + select activities (customizable icons) + optional notes. Two taps minimum.
- **Visualization:** Year in Pixels (mood heatmap by day), mood charts (weekly/monthly/yearly), activity correlations.
- **What to learn:** Speed of entry is critical. Mood selection FIRST, text SECOND. Make it possible to log mood in 2 seconds without writing anything. Text is always optional.
- **What NOT to copy:** Activity grid (BetterR.Me already has habits for this), premium-only analytics.

### Finch (self-care + reflection + gamification)
- **Core loop:** Daily check-in (mood 1-5 + energy), guided self-care journeys, free-form journal, thoughtful prompts.
- **Linking:** Journals are connected to completed goals. The app analyzes entries for emotional patterns.
- **What to learn:** Prompt categories (Building Focus, Creating Calm, Practicing Gratitude) make journaling approachable. Post-completion reflections ("How did that go?") bridge action and awareness.
- **What NOT to copy:** Gamified pet mechanic, AI analysis, premium tracks.

### Day One (full-featured journal, gold standard)
- **Core loop:** Rich text entries with photos, location, weather, tags, multiple journals.
- **"On This Day":** Shows past entries from same date in previous months/years. Powerful emotional hook.
- **Timeline:** Vertical scrolling feed with date headers, media previews, mood/weather icons.
- **What to learn:** "On This Day" is simple to implement and deeply engaging. Timeline as primary navigation (not calendar) works for heavy journalers.
- **What NOT to copy:** Multiple journals, rich text, media, location/weather, end-to-end encryption -- all out of scope for an integrated feature.

### Balance Journal (habit + task + journal hybrid)
- **Core loop:** Tracks habits, tasks, sleep, and mood in one daily journal entry.
- **Linking:** Weekly actions connect to checklists and journal entries.
- **What to learn:** The "one screen for everything today" model is compelling. BetterR.Me's dashboard already does this for habits/tasks; the journal widget extends it naturally.

---

## Mood Picker UX Research

The 5-point emoji scale is the industry standard across Daylio, Finch, and academic research (ECMES scale). Key design decisions:

| Design Choice | Recommendation | Rationale |
|---------------|---------------|-----------|
| **Scale size** | 5 levels | Daylio uses 5 (rad/good/meh/bad/awful). Finch uses 5. Research supports 5-point scales for minimal cognitive load with sufficient granularity. |
| **Visual style** | Emoji-like face icons, not actual Unicode emoji | Unicode emoji render differently across OS/browsers. Custom SVG icons (or Lucide equivalents) ensure visual consistency. Use faces: grinning, smiling, neutral, frowning, very sad. |
| **Interaction** | Tap to select (radio-button pattern) | Single selection, not a slider. Sliders imply continuous values; discrete faces are clearer. Selected face should be highlighted with primary color; unselected faces should be muted. |
| **Required?** | No, optional | Some days users just want to write without categorizing their mood. Null mood is valid. |
| **Colors** | Mood-mapped colors | Great=green, Good=teal, Neutral=yellow, Bad=orange, Awful=red. Used for calendar indicators and mood distribution chart. |

---

## Writing Prompt Design

Prompts should be organized into 3 categories matching BetterR.Me's self-improvement focus:

| Category | Purpose | Example Prompts (en) |
|----------|---------|---------------------|
| **Gratitude** | Cultivate appreciation, positive framing | "What are three things you're thankful for today?", "Who made a positive difference in your day?", "What's one small thing that brought you joy?" |
| **Reflection** | Process the day, build self-awareness | "What challenged you today and how did you handle it?", "What did you learn about yourself today?", "If you could redo one moment from today, what would you change?" |
| **Goals** | Forward-looking, intention-setting | "What's one thing you want to focus on tomorrow?", "What habit are you most proud of maintaining?", "What's one step you can take toward your biggest goal?" |

**Implementation:** Store as a TypeScript constant (not DB table). 5-7 prompts per category = 15-21 total. All translated to 3 locales. Shown as a suggestion above the text area -- user can dismiss, shuffle, or ignore.

---

## Sources

### Competitor & Feature Research (MEDIUM confidence -- verified across multiple sources)
- [Daylio Official Site](https://daylio.net/)
- [Daylio App Review 2025](https://appsreviewnest.com/app-review/daylio-app-review-a-helpful-tool-for-mood-tracking-and-journaling/)
- [Finch Self-Care App Review](https://www.autonomous.ai/ourblog/finch-self-care-app-review-full-breakdown)
- [Finch: Self Care App Review (Webisoft)](https://webisoft.com/articles/finch-self-care-app/)
- [Day One Features](https://dayoneapp.com/features/)
- [Day One: On This Day on Web](https://dayoneapp.com/releases/on-this-day-now-available-on-web/)
- [Balance Journal App](https://www.balancejournal.app/)
- [Day One: 550+ Journal Prompts](https://dayoneapp.com/blog/journal-prompts/)

### Mood Tracking UX Research (MEDIUM confidence -- academic + industry sources)
- [Top 7 Mood Tracker Apps for 2026 (Clustox)](https://www.clustox.com/blog/mood-tracker-apps/)
- [Mood Tracking App Development (Onix Systems)](https://onix-systems.com/blog/how-to-develop-a-mood-tracker-app)
- [ACM: UEQ-Emoji -- Developing an Emoji-based UX Questionnaire](https://dl.acm.org/doi/fullHtml/10.1145/3626705.3627767)
- [Emoji Current Mood and Experience Scale (ECMES)](https://www.tandfonline.com/doi/full/10.1080/09638237.2022.2069694)

### Habit + Journal Integration Patterns (MEDIUM confidence -- web search)
- [Typesy: Productivity Power-Ups](https://www.typesy.com/productivity-power-ups-track-habits-journal-smarter/)
- [Zapier: 4 Best Journal Apps](https://zapier.com/blog/best-journaling-apps/)
- [Habit Tracker & Journal Guide (SelfGuide)](https://selfguide.net/habit-tracker-and-journal-guide/)

### Calendar & Timeline UX (MEDIUM confidence -- UX pattern guides)
- [Eleken: Calendar UI Examples](https://www.eleken.co/blog-posts/calendar-ui)
- [Wendy Zhou: Timeline UI Design](https://www.wendyzhou.se/blog/10-gorgeous-timeline-ui-design-inspiration-tips/)
- [NN/g: Date Input UX Guidelines](https://www.nngroup.com/articles/date-input/)

### Journal Prompt Research (LOW-MEDIUM confidence -- content sites, not technical)
- [QuillBot: 75+ Journal Prompts](https://quillbot.com/blog/creative-writing/journal-prompts/)
- [Gratefulness.me: 120+ Daily Journal Prompts](https://blog.gratefulness.me/daily-journal-prompts/)
- [Calm Blog: Gratitude Journal Prompts](https://www.calm.com/blog/gratitude-journal-prompts)
