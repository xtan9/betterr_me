# Requirements: BetterR.Me v7.0 AI Chat Foundation

**Defined:** 2026-04-02
**Core Value:** Users see accurate stats, the API rejects bad input, and the codebase is maintainable

## v7.0 Requirements

Requirements for AI Chat Foundation. Each maps to roadmap phases.

### Core Chat

- [ ] **CHAT-01**: User can send a message and receive a streaming response from Claude
- [ ] **CHAT-02**: User can see Claude's response rendered as formatted markdown (bold, lists, code blocks)
- [ ] **CHAT-03**: User can stop Claude's response mid-generation
- [ ] **CHAT-04**: User sees an error message with retry button when the LLM proxy fails

### Conversation Management

- [ ] **CONV-01**: User can create a new conversation
- [ ] **CONV-02**: User can switch between multiple conversations via a conversation list
- [ ] **CONV-03**: User's messages and Claude's responses persist in the database across page refreshes
- [ ] **CONV-04**: Conversation gets an auto-generated title after the first exchange

### Integration & Polish

- [ ] **INTG-01**: Chat is accessible via the app sidebar navigation
- [ ] **INTG-02**: All chat UI strings are translated in en, zh, and zh-TW
- [ ] **INTG-03**: Chat UI respects dark mode using existing design tokens
- [ ] **INTG-04**: User can send with Enter, newline with Shift+Enter, stop with Escape

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
| CHAT-01 | Phase 34 | Pending |
| CHAT-02 | Phase 35 | Pending |
| CHAT-03 | Phase 35 | Pending |
| CHAT-04 | Phase 34 | Pending |
| CONV-01 | Phase 36 | Pending |
| CONV-02 | Phase 36 | Pending |
| CONV-03 | Phase 36 | Pending |
| CONV-04 | Phase 36 | Pending |
| INTG-01 | Phase 37 | Pending |
| INTG-02 | Phase 37 | Pending |
| INTG-03 | Phase 35 | Pending |
| INTG-04 | Phase 35 | Pending |

**Coverage:**
- v7.0 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0

---
*Requirements defined: 2026-04-02*
*Last updated: 2026-04-02 after roadmap creation*
