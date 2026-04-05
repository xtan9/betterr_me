# Roadmap: BetterR.Me

## Milestones

- ✅ **v1.0 Codebase Hardening** — Phases 1-5 (shipped 2026-02-16)
- ✅ **v1.1 Dashboard Task Fixes** — Phase 6 (shipped 2026-02-17)
- ✅ **v2.0 UI Style Redesign** — Phases 1-9 (shipped 2026-02-17)
- ✅ **v2.1 UI Polish & Refinement** — Phases 10-12 (shipped 2026-02-18)
- ✅ **v3.0 Projects & Kanban** — Phases 13-17 (shipped 2026-02-21)
- ✅ **v4.0 Money Tracking** — Phases 18-26 (shipped 2026-02-28)
- ✅ **v6.0 Calendar & Feed Aggregation** — Phases 29-33 (shipped 2026-04-02)
- 🚧 **v7.0 AI Chat Foundation** — Phases 34-37 (in progress)

## Phases

<details>
<summary>✅ v1.0 Codebase Hardening (Phases 1-5) — SHIPPED 2026-02-16</summary>

5 phases, 11 plans, 26 requirements. See `.planning/milestones/v1.0-ROADMAP.md` for details.

</details>

<details>
<summary>✅ v1.1 Dashboard Task Fixes (Phase 6) — SHIPPED 2026-02-17</summary>

1 phase, 1 plan, 3 requirements. See `.planning/milestones/v1.1-ROADMAP.md` for details.

</details>

<details>
<summary>✅ v2.0 UI Style Redesign (Phases 1-9) — SHIPPED 2026-02-17</summary>

9 phases, 21 plans, 28 requirements. See `.planning/milestones/v2.0-ROADMAP.md` for details.

</details>

<details>
<summary>✅ v2.1 UI Polish & Refinement (Phases 10-12) — SHIPPED 2026-02-18</summary>

3 phases, 6 plans, 8 requirements. See `.planning/milestones/v2.1-ROADMAP.md` for details.

</details>

<details>
<summary>✅ v3.0 Projects & Kanban (Phases 13-17) — SHIPPED 2026-02-21</summary>

5 phases, 12 plans, 17 requirements. See `.planning/milestones/v3.0-ROADMAP.md` for details.

</details>

<details>
<summary>✅ v4.0 Money Tracking (Phases 18-26) — SHIPPED 2026-02-28</summary>

9 phases, 38 plans, 66 requirements. See `.planning/milestones/v4.0-ROADMAP.md` for details.

- [x] Phase 18: Database Foundation & Household Schema (2/2 plans) — completed 2026-02-21
- [x] Phase 19: Plaid Bank Connection Pipeline (6/6 plans) — completed 2026-02-22
- [x] Phase 20: Transaction Management & Categorization (5/5 plans) — completed 2026-02-23
- [x] Phase 21: Budgets & Spending Analytics (5/5 plans) — completed 2026-02-23
- [x] Phase 22: Bills, Goals & Net Worth (6/6 plans) — completed 2026-02-24
- [x] Phase 23: Household & Couples (4/4 plans) — completed 2026-02-24
- [x] Phase 24: Future-First Dashboard & AI Insights (5/5 plans) — completed 2026-02-24
- [x] Phase 25: Data Management & Polish (2/2 plans) — completed 2026-02-24
- [x] Phase 26: CSV Import & Integration Polish (3/3 plans) — completed 2026-02-28

</details>

<details>
<summary>✅ v6.0 Calendar & Feed Aggregation (Phases 29-33) — SHIPPED 2026-04-02</summary>

5 phases, 13 plans. See `.planning/milestones/v6.0-ROADMAP.md` for details.

- [x] Phase 29: Database Schema & Infrastructure Foundation (3/3 plans) — completed 2026-03-31
- [x] Phase 30: Calendar Event CRUD API (3/3 plans) — completed 2026-03-31
- [x] Phase 31: Calendar UI — Month View & Navigation (2/2 plans) — completed 2026-04-01
- [x] Phase 32: Calendar UI — Week & Day Views (4/4 plans) — completed 2026-04-02
- [x] Phase 33: Cross-Domain Feed Aggregation (1/1 plans) — completed 2026-04-02

</details>

## v7.0 AI Chat Foundation (Phases 34-37)

**Goal:** Build a working chat interface that lets authenticated users have streaming conversations with Claude via the llm.betterr.me proxy, with conversation persistence across page refreshes.

- [x] **Phase 34: Database, Types & Streaming API** - Supabase tables, TypeScript types, Zod schemas, AI SDK provider, and streaming API route with auth and error handling (completed 2026-04-02)
- [x] **Phase 35: Chat UI & Message Rendering** - Chat page with message bubbles, markdown rendering, stop button, keyboard shortcuts, and dark mode support (completed 2026-04-03)
- [x] **Phase 36: Conversation Persistence & Management** - Save/load messages to DB, conversation list sidebar, create/switch conversations, auto-generated titles (completed 2026-04-04)
- [x] **Phase 37: Navigation & i18n** - Sidebar navigation link, all chat UI strings translated in en, zh, zh-TW (completed 2026-04-05)

## Phase Details

### Phase 34: Database, Types & Streaming API
**Goal**: Authenticated users can send a message and receive a streaming Claude response via the API, with database tables ready for conversation persistence
**Depends on**: Nothing (first phase of v7.0)
**Requirements**: CHAT-01, CHAT-04
**Success Criteria** (what must be TRUE):
  1. Supabase tables (conversations, chat_messages) exist with RLS policies isolating data per user
  2. User can POST to /api/chat with a message and receive a streaming text response from Claude via llm.betterr.me proxy
  3. API route rejects unauthenticated requests with 401
  4. User sees a descriptive error message when the LLM proxy is unreachable or returns an error, with a retry mechanism
  5. DB classes (ConversationsDB, ChatMessagesDB) and Zod validation schemas pass unit tests
**Plans:** 3/3 plans complete
Plans:
- [x] 34-01-PLAN.md — Database migration, TypeScript types, DB classes (ConversationsDB, ChatMessagesDB)
- [x] 34-02-PLAN.md — Package installation, AI provider config, Zod validation schemas
- [x] 34-03-PLAN.md — Streaming POST /api/chat endpoint with auth and error handling

### Phase 35: Chat UI & Message Rendering
**Goal**: Users interact with a polished chat interface that streams responses with formatted markdown, supports stop/retry, and works in both light and dark mode
**Depends on**: Phase 34
**Requirements**: CHAT-02, CHAT-03, INTG-03, INTG-04
**Success Criteria** (what must be TRUE):
  1. User sees their messages and Claude's responses in distinct message bubbles with clear visual differentiation
  2. Claude's responses render formatted markdown including bold text, bullet/numbered lists, and fenced code blocks
  3. User can click a stop button (or press Escape) to halt Claude's response mid-generation
  4. User can send a message with Enter, insert a newline with Shift+Enter, and stop generation with Escape
  5. Chat UI uses existing BetterR.Me design tokens and renders correctly in both light and dark mode
**Plans:** 2/2 plans complete
Plans:
- [x] 35-01-PLAN.md — Leaf components: MarkdownRenderer, MessageBubble, ChatInput, ChatEmptyState, MessageList + tests
- [x] 35-02-PLAN.md — ChatContent orchestrator (useChat), ChatPage, Layout + integration tests

### Phase 35.1: Reminder Cron, Preferences & Polish (INSERTED)

**Goal:** Cron-based reminder dispatch, smart defaults, quiet hours, user preferences, responsive mobile layout, and i18n.
**Requirements**: REMN-01, REMN-02, REMN-03, REMN-04, REMN-05, REMN-06, REMN-07, REMN-08, REMN-09, REMN-10, I18N-01, RESP-01, RESP-02, RESP-03
**Depends on:** Phase 35 (Chat UI), Phase 34 (Push Notifications - v6.0), Phase 35 (Email Notifications - v6.0)
**Plans:** 5/5 plans complete

**Success criteria:**
1. User can add multiple reminders per event with relative (5m/15m/30m/1h/1d) or absolute timing, targeting push, email, or both
2. Smart defaults auto-apply per source type and user can customize defaults in settings
3. Quiet hours prevent push notifications between configurable start/end times
4. Vercel Cron job runs every minute to dispatch pending reminders via push and/or email
5. Failed deliveries are logged with status='failed' for retry
6. All calendar and reminder UI strings translated in en, zh, zh-TW
7. Mobile-responsive calendar (sidebar collapses, day view default, swipe navigation, FAB for new event)

Plans:
- [x] 35.1-01-PLAN.md — Push send utility, quiet hours logic, cron dispatch route
- [x] 35.1-02-PLAN.md — Reminder CRUD API routes, defaults API, fire_at computation
- [x] 35.1-03-PLAN.md — Event dialog reminder rows, settings UI (quiet hours + defaults)
- [x] 35.1-04-PLAN.md — Mobile responsive calendar (sidebar collapse, swipe, FAB)
- [x] 35.1-05-PLAN.md — i18n translations for all new UI strings (en, zh, zh-TW)

### Phase 36: Conversation Persistence & Management
**Goal**: Users can maintain multiple conversations that persist across page refreshes, with automatic title generation
**Depends on**: Phase 35
**Requirements**: CONV-01, CONV-02, CONV-03, CONV-04
**Success Criteria** (what must be TRUE):
  1. User can create a new conversation (starting fresh, clearing the current chat)
  2. User can see a list of their conversations and switch between them
  3. Messages and responses persist in the database and survive page refresh without data loss
  4. After the first user-assistant exchange, the conversation receives an auto-generated title summarizing the topic
**Plans:** 2/2 plans complete
Plans:
- [x] 36-01-PLAN.md — Conversation API routes (CRUD, messages, title generation) + message converter utility
- [x] 36-02-PLAN.md — Conversation sidebar UI, ChatContent persistence refactor, i18n strings
**UI hint**: yes

### Phase 37: Navigation & i18n
**Goal**: Chat is discoverable from the app sidebar and all UI strings are available in all three supported locales
**Depends on**: Phase 36
**Requirements**: INTG-01, INTG-02
**Success Criteria** (what must be TRUE):
  1. User can access the chat page via a navigation link in the app sidebar
  2. All chat UI strings (button labels, placeholders, empty states, error messages) are translated in en, zh, and zh-TW
  3. Switching locale updates all chat interface text without breaking functionality
**Plans:** 1/1 plans complete
Plans:
- [x] 37-01-PLAN.md — Add Chat sidebar nav item and complete i18n coverage

### Phase 37.1: v6.0 Gap Closure — Calendar & Reminder Fixes (INSERTED)

**Goal:** Fix 4 bugs found by v6.0 milestone audit: stale closure in reminder save, workouts not at start time, layer defaults, timezone persistence.
**Depends on:** Phase 35.1
**Requirements:** INFR-07, AGGR-04, AGGR-06, REMN-01, REMN-04
**Gap Closure:** Closes gaps from v6.0-MILESTONE-AUDIT.md
**Success Criteria** (what must be TRUE):
  1. Editing reminders in event dialog persists the user's actual edits (not stale snapshot)
  2. Workouts appear at their started_at time on the calendar (not all-day)
  3. All 5 domain layers (events, tasks, habits, bills, workouts) enabled by default on first load
  4. User's IANA timezone auto-detected and persisted to profile on first visit
**Plans:** 2 plans

Plans:
- [ ] 37.1-01-PLAN.md — Stale closure fix, workout time extraction, layer defaults + tests
- [ ] 37.1-02-PLAN.md — Timezone persistence (API fix + hook wiring) + tests

## Progress

**Execution Order:**
Phases execute in numeric order: 34 → 35 → 36 → 37

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Frequency Correctness | v1.0 | 3/3 | Complete | 2026-02-15 |
| 2. API Hardening | v1.0 | 3/3 | Complete | 2026-02-15 |
| 3. Auth & Profile Reliability | v1.0 | 2/2 | Complete | 2026-02-16 |
| 4. Dead Code & Observability | v1.0 | 2/2 | Complete | 2026-02-16 |
| 5. Test Coverage Backfill | v1.0 | 1/1 | Complete | 2026-02-16 |
| 6. Dashboard Task Data Flow | v1.1 | 1/1 | Complete | 2026-02-16 |
| 10. Token Consistency | v2.1 | 3/3 | Complete | 2026-02-18 |
| 11. Sidebar Polish | v2.1 | 2/2 | Complete | 2026-02-18 |
| 12. Component Fixes | v2.1 | 1/1 | Complete | 2026-02-18 |
| 13. Data Foundation & Migration | v3.0 | 2/2 | Complete | 2026-02-19 |
| 14. Projects & Sections | v3.0 | 3/3 | Complete | 2026-02-20 |
| 15. Kanban Board | v3.0 | 4/4 | Complete | 2026-02-20 |
| 16. Integration Bug Fixes | v3.0 | 2/2 | Complete | 2026-02-21 |
| 17. Fix Archive/Restore Validation | v3.0 | 1/1 | Complete | 2026-02-21 |
| 18. Database Foundation | v4.0 | 2/2 | Complete | 2026-02-21 |
| 19. Plaid Bank Connection | v4.0 | 6/6 | Complete | 2026-02-22 |
| 20. Transactions & Categorization | v4.0 | 5/5 | Complete | 2026-02-23 |
| 21. Budgets & Spending | v4.0 | 5/5 | Complete | 2026-02-23 |
| 22. Bills, Goals & Net Worth | v4.0 | 6/6 | Complete | 2026-02-24 |
| 23. Household & Couples | v4.0 | 4/4 | Complete | 2026-02-24 |
| 24. Dashboard & AI Insights | v4.0 | 5/5 | Complete | 2026-02-24 |
| 25. Data Management | v4.0 | 2/2 | Complete | 2026-02-24 |
| 26. CSV Import & Polish | v4.0 | 3/3 | Complete | 2026-02-28 |
| 29. Database Schema & Infrastructure | v6.0 | 3/3 | Complete | 2026-03-31 |
| 30. Calendar Event CRUD API | v6.0 | 3/3 | Complete | 2026-03-31 |
| 31. Calendar UI — Month View | v6.0 | 2/2 | Complete | 2026-04-01 |
| 32. Calendar UI — Week & Day Views | v6.0 | 4/4 | Complete | 2026-04-02 |
| 33. Cross-Domain Feed Aggregation | v6.0 | 1/1 | Complete | 2026-04-02 |
| 34. Database, Types & Streaming API | v7.0 | 3/3 | Complete    | 2026-04-02 |
| 35. Chat UI & Message Rendering | v7.0 | 2/2 | Complete    | 2026-04-03 |
| 35.1 Reminder Cron & Polish | v6.0 | 5/5 | Complete    | 2026-04-03 |
| 36. Conversation Persistence & Management | v7.0 | 2/2 | Complete    | 2026-04-04 |
| 37. Navigation & i18n | v7.0 | 0/? | Not started | - |
| 37.1 v6.0 Gap Closure | v6.0 | 1/2 | In progress | - |
