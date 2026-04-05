# Phase 37: Navigation & i18n - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a "Chat" navigation link to the app sidebar and ensure all chat UI strings are translated in all three locales (en, zh, zh-TW). This is pure integration — no new features, no new components beyond adding one nav item.

</domain>

<decisions>
## Implementation Decisions

### Sidebar Navigation
- **D-01:** Add "Chat" to the `mainNavItems` array in `components/layouts/app-sidebar.tsx`, after Calendar (last item in the list)
- **D-02:** Use `MessageSquare` icon from `lucide-react` — standard chat icon
- **D-03:** Follow the exact existing nav item pattern: `{ href: "/chat", icon: MessageSquare, labelKey: "chat", match: (p: string) => p.startsWith("/chat") }`
- **D-04:** No badge count for chat (unlike habits/tasks which show incomplete counts)

### i18n Strings
- **D-05:** Add `"chat": "Chat"` to `common.nav` in `en.json` — matches existing nav label pattern
- **D-06:** Add `"chat": "聊天"` to `common.nav` in `zh.json`
- **D-07:** Add `"chat": "聊天"` to `common.nav` in `zh-TW.json`
- **D-08:** Verify all existing `chat.*` strings (from Phases 35-36) are present in all 3 locales — they should already be there but must be confirmed

### Claude's Discretion
- Test structure and approach
- Whether to add any additional i18n strings that may have been missed in prior phases

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Navigation Pattern
- `components/layouts/app-sidebar.tsx` — Main sidebar with `mainNavItems` array (THE file to modify)
- `i18n/messages/en.json` — English locale file, `common.nav` section has all nav labels
- `i18n/messages/zh.json` — Simplified Chinese locale
- `i18n/messages/zh-TW.json` — Traditional Chinese locale

### Chat Components (verify i18n coverage)
- `components/chat/chat-content.tsx` — Uses `useTranslations("chat")`
- `components/chat/conversation-sidebar.tsx` — Uses `useTranslations("chat")` for sidebar strings
- `components/chat/chat-input.tsx` — Uses `useTranslations("chat")`
- `components/chat/chat-empty-state.tsx` — Uses `useTranslations("chat")`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `mainNavItems` array in `app-sidebar.tsx`: Exact pattern to follow — `{ href, icon, labelKey, match }`
- `useTranslations("common.nav")`: Already used in sidebar, reads from `common.nav.*` keys
- `MessageSquare` from `lucide-react`: Standard chat icon, already available

### Established Patterns
- Nav items: kebab-case href, LucideIcon, labelKey matching i18n key, match function for active state
- i18n: All user-facing strings in `common.nav` for navigation labels, domain-specific strings in `{domain}.*`
- All three locales must have matching keys

### Integration Points
- `components/layouts/app-sidebar.tsx` line 40-83 — `mainNavItems` array, add after Calendar entry
- `i18n/messages/{en,zh,zh-TW}.json` — `common.nav` section

</code_context>

<specifics>
## Specific Ideas

- Phase 36 already added `chat.sidebar.*`, `chat.loading`, and conversation-related i18n strings to all 3 locales
- Phase 35 added `chat.emptyState.*`, `chat.input.*`, `chat.error.*` to all 3 locales
- The only missing i18n key is `common.nav.chat` for the sidebar nav label
- This is the last phase of v7.0 — after this, the milestone is complete

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 37-navigation-i18n*
*Context gathered: 2026-04-05*
