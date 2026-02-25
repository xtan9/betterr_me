# Phase 21: Journal Entry CRUD - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can write, edit, and delete rich-text journal entries with mood tracking through a complete entry form. The entry form lives in a center modal opened from the journal page. Writing prompts (Phase 22), calendar/timeline browsing (Phase 23), and dashboard integration (Phase 24) are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Editor experience
- Rich formatting toolbar: bold, italic, strikethrough, headings (H2/H3), bullet list, numbered list, blockquote, links, code blocks, horizontal rule, task lists
- Floating bubble toolbar — appears on text selection only (Medium-style), not a fixed top bar
- No placeholder text — blank editor with cursor ready
- Tiptap as the rich-text engine (per roadmap)

### Mood selector
- 5 emoji faces on an expressive scale: `🤩 😊 🙂 😕 😩` (amazing → awful)
- Standard emoji rendering (not custom icons or abstract colors)

### Autosave & status
- Debounced autosave on content change (~2 seconds after user stops typing)
- No unsaved-changes browser warning — autosave handles it, with a save-on-beforeunload fallback
- Save status indicator style and save-on-beforeunload implementation at Claude's discretion

### Entry page layout
- Center modal (~70% viewport) for both creating and editing entries — journal page visible at edges
- Delete requires a confirmation dialog ("Delete this entry?") before proceeding

### Claude's Discretion
- Editor height/sizing approach (auto-grow vs fixed)
- Mood selector placement relative to editor (above, below, or alongside)
- Whether mood is required or optional (and prompting behavior)
- Save status indicator style (inline text vs icon-based)
- Create vs edit flow unification (unified upsert vs explicit create/edit entry points)
- Threshold for first autosave on new entries (immediate vs minimum content)

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

*Phase: 21-journal-entry-crud*
*Context gathered: 2026-02-22*
