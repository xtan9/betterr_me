# Requirements: BetterR.Me v7.0 AI Chat Foundation

**Defined:** 2026-04-02
**Core Value:** Users see accurate stats, the API rejects bad input, and the codebase is maintainable

## v7.0 Requirements

Requirements for AI Chat Foundation. Each maps to roadmap phases.

### Core Chat

- [x] **CHAT-01**: User can send a message and receive a streaming response from Claude
- [x] **CHAT-02**: User can see Claude's response rendered as formatted markdown (bold, lists, code blocks)
- [x] **CHAT-03**: User can stop Claude's response mid-generation
- [x] **CHAT-04**: User sees an error message with retry button when the LLM proxy fails

### Conversation Management

- [x] **CONV-01**: User can create a new conversation
- [x] **CONV-02**: User can switch between multiple conversations via a conversation list
- [x] **CONV-03**: User's messages and Claude's responses persist in the database across page refreshes
- [x] **CONV-04**: Conversation gets an auto-generated title after the first exchange

### Integration & Polish

- [x] **INTG-01**: Chat is accessible via the app sidebar navigation
- [x] **INTG-02**: All chat UI strings are translated in en, zh, and zh-TW
- [x] **INTG-03**: Chat UI respects dark mode using existing design tokens
- [x] **INTG-04**: User can send with Enter, newline with Shift+Enter, stop with Escape

## v6.0 Remainder — Reminders, i18n & Responsive (Phase 35.1)

Carried forward from v6.0 Calendar & Reminder Notifications. Push (Phase 34) and email (Phase 35) infrastructure already shipped.

### Reminders

- [x] **REMN-01**: User can add multiple reminders per calendar event (relative or absolute)
- [x] **REMN-02**: Relative reminders support: 5 min, 15 min, 30 min, 1 hour, 1 day before, and custom minutes
- [x] **REMN-03**: Absolute reminders support a specific date + time
- [x] **REMN-04**: Each reminder can target push, email, or both channels
- [x] **REMN-05**: Smart defaults auto-apply reminders based on source type (event: 15min/push, task: 1hr/push, habit: 8am/push, bill: 3days/push+email)
- [x] **REMN-06**: User can customize default reminders per source type in settings
- [ ] **REMN-07**: User can set quiet hours (no push between configurable start/end times)
- [ ] **REMN-08**: Vercel Cron job runs every minute to dispatch pending reminders
- [x] **REMN-09**: Reminders have fire_at pre-computed and recomputed on event reschedule
- [ ] **REMN-10**: Failed reminder deliveries are logged with status='failed' for retry

### Internationalization

- [x] **I18N-01**: All calendar and reminder UI strings translated in en, zh, and zh-TW

### Responsive & Accessibility

- [ ] **RESP-01**: On mobile (sm), sidebar collapses; layer toggles move to header filter dropdown
- [ ] **RESP-02**: On mobile, default view is Day with swipe left/right to navigate
- [ ] **RESP-03**: "+ New Event" becomes a floating action button on mobile

## Future Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### NLP Command Parsing

- **NLP-01**: User can create habits/tasks/journal entries via natural language in chat
- **NLP-02**: Chat parses intent and executes structured actions via existing API routes
- **NLP-03**: Chat confirms parsed action before executing

### AI Companion

- **COMP-01**: Chat has context of user's app data (habits, tasks, workouts, journal, money)
- **COMP-02**: User can ask analytical questions about their data ("how's my workout routine this month?")
- **COMP-03**: Chat proactively surfaces insights based on user data patterns

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| NLP command parsing (create habits/tasks via chat) | Future milestone — needs tool calling infrastructure |
| App data context in conversations | Future milestone — needs data aggregation layer |
| Code syntax highlighting | Add later if users request code assistance |
| Token counting / usage display | Not needed for personal use with subscription proxy |
| Conversation sharing / export | Not needed for personal app |
| Voice input | Complexity, separate scope |
| Chatbot financial advice | SEC/FINRA compliance risk (carried from v4.0) |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CHAT-01 | Phase 34 | Complete |
| CHAT-02 | Phase 35 | Complete |
| CHAT-03 | Phase 35 | Complete |
| CHAT-04 | Phase 34 | Complete |
| CONV-01 | Phase 36 | Complete |
| CONV-02 | Phase 36 | Complete |
| CONV-03 | Phase 36 | Complete |
| CONV-04 | Phase 36 | Complete |
| INTG-01 | Phase 37 | Complete |
| INTG-02 | Phase 37 | Complete |
| INTG-03 | Phase 35 | Complete |
| INTG-04 | Phase 35 | Complete |

| REMN-01 | Phase 35.1 | Complete |
| REMN-02 | Phase 35.1 | Complete |
| REMN-03 | Phase 35.1 | Complete |
| REMN-04 | Phase 35.1 | Complete |
| REMN-05 | Phase 35.1 | Complete |
| REMN-06 | Phase 35.1 | Complete |
| REMN-07 | Phase 35.1 | Pending |
| REMN-08 | Phase 35.1 | Pending |
| REMN-09 | Phase 35.1 | Complete |
| REMN-10 | Phase 35.1 | Pending |
| I18N-01 | Phase 35.1 | Complete |
| RESP-01 | Phase 35.1 | Pending |
| RESP-02 | Phase 35.1 | Pending |
| RESP-03 | Phase 35.1 | Pending |

**Coverage:**
- v7.0 requirements: 12 total, mapped: 12
- v6.0 remainder (Phase 35.1): 14 total, mapped: 14
- Unmapped: 0

---
*Requirements defined: 2026-04-02*
*Last updated: 2026-04-02 after roadmap creation*
