# Phase 20: Database & API Foundation - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Journal data layer exists end-to-end — schema enforces one-entry-per-day, API routes handle all CRUD, and SWR hooks provide client-side data access. This phase creates the foundation that Phases 21-25 build on. No UI components are built here.

</domain>

<decisions>
## Implementation Decisions

### Entry data model
- Entries have a **title field** (required) plus rich-text content body
- **Word count** stored as a persisted column (enables stats like average entry length, streak gating)
- **Tags** stored as a text array column on the entry (user-defined labels like 'work', 'travel', 'gratitude')
- **Prompt reference** stored as a column (prompt_key or prompt_id) linking back to the prompt library — enables "entries inspired by this prompt" browsing in Phase 22
- Core fields: user_id, entry_date, title, content (Tiptap JSON), mood, word_count, tags, prompt_key, timestamps
- UNIQUE constraint on (user_id, entry_date) — upsert model

### Mood scale
- **Simple valence scale**: 😄 😊 😐 😞 😢 (positive-to-negative, no text labels needed)
- Stored as **integer 1-5** (1=awful/😢, 5=great/😄) — easy to average, sort, compute trends
- **Default neutral** (3/😐) — pre-selected but user can change. Ensures data exists without forcing a choice
- **Hardcoded emojis** — same 5 for everyone, not configurable per user

### Linking semantics
- Links support **habits, tasks, AND projects** (extends INTG-02 requirement to include projects since they exist from v3.0)
- **Simple references** only — just an association, no status snapshot captured at link time
- **One polymorphic table** (`journal_entry_links`) with `link_type` ('habit'/'task'/'project') + `link_id`
- **Soft limit of ~10 links** per entry to keep UI clean

### Calendar API
- Calendar endpoint returns **date + mood + title** per entry day — enough for mood-colored dots and hover previews
- Endpoint scoped to **single month** (e.g., ?year=2026&month=2) — matches standard calendar UI pattern
- Timeline endpoint uses **cursor-based pagination** (last entry's date as cursor) — good for infinite scroll in Phase 23
- Timeline returns **preview only** (~first 100 chars of content), not full body — click to see full entry

### Claude's Discretion
- Tiptap content storage format (JSON vs HTML)
- Exact RLS policy design
- SWR cache key structure and revalidation strategy
- API error response shapes
- Preview text extraction logic (plain text from Tiptap JSON)

</decisions>

<specifics>
## Specific Ideas

- Mood integers map to emojis in app code, not in the database — DB just stores 1-5
- Tags are a simple text[] array, not a separate tags table — keep it lightweight
- The prompt_key column should be nullable (entries without prompts are the default)
- Calendar endpoint should be fast — consider a lightweight query that doesn't load full content

</specifics>

<deferred>
## Deferred Ideas

- Configurable mood emoji sets — future enhancement if users want personalization
- Full-text search across entries (ANLT-03) — tracked in future requirements
- Entry attachments/images (MEDA-01) — out of scope per requirements

</deferred>

---

*Phase: 20-database-api-foundation*
*Context gathered: 2026-02-22*
