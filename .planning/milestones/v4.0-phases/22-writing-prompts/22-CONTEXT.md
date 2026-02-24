# Phase 22: Writing Prompts - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Provide optional writing prompts organized by category to reduce blank-page anxiety. Users can browse and select from a prompt library, or skip prompts entirely and write free-form (free-form is the default). The prompt key is saved with the entry. This phase does NOT cover custom/user-created prompts, prompt scheduling, or AI-generated prompts.

</domain>

<decisions>
## Implementation Decisions

### Prompt browsing experience
- Sidebar panel for browsing prompts (appears to the side on desktop, full-screen on mobile)
- Categories displayed as horizontal tabs at the top of the sidebar
- Category tabs only — no search/filter (library is small enough to scan)
- Sidebar closes after prompt selection (exact select-then-close interaction at Claude's discretion)

### Prompt content & categories
- 5-8 prompts per category — curated and concise, minimal decision fatigue
- Mix of tones: some warm/gentle ("What made you smile today?"), some direct/thought-provoking ("What's one thing you'd change about today?")
- All prompts need i18n support across en, zh, zh-TW (Phase 25 handles full translation, but structure must support it)

### Editor integration
- Prompt sidebar triggered from the editor area (exact trigger location at Claude's discretion — toolbar icon or standalone button)
- Prompt key saved with the journal entry (success criteria requires this)

### Default & empty states
- Free-form is the default — prompts are an optional enhancement, not a gate
- Gentle placeholder text in empty editor (e.g., "What's on your mind?" or "Start writing...")

### Claude's Discretion
- Category selection: which categories beyond gratitude/reflection/goals (if any)
- Prompt storage: hardcoded in code vs database-seeded (pick what fits codebase best)
- Prompt placement: above editor as card/banner vs as placeholder text vs other
- Dismissal behavior: whether prompt can be changed/dismissed after writing starts
- Selection interaction: tap-to-select vs tap-to-preview-then-confirm
- First-use experience: whether to show onboarding hint or keep it self-explanatory
- Edit view: whether to show original prompt when re-opening an entry
- Trigger UI: lightbulb icon, "Need inspiration?" link, or other pattern

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 22-writing-prompts*
*Context gathered: 2026-02-23*
