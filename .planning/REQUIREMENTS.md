# Requirements: BetterR.Me

**Defined:** 2026-02-22
**Core Value:** Users see accurate stats, the API rejects bad input, and the codebase is maintainable

## v4.0 Requirements

Requirements for the Journal milestone. Each maps to roadmap phases.

### Entry

- [ ] **ENTR-01**: User can create a journal entry for a specific date with rich text (Tiptap editor)
- [ ] **ENTR-02**: User can edit and update an existing journal entry
- [ ] **ENTR-03**: User can delete a journal entry
- [ ] **ENTR-04**: User can select a mood emoji (5-point scale) for each entry
- [ ] **ENTR-05**: User sees one entry per day (upsert model — creating for a date with an existing entry opens edit)

### Prompts

- [ ] **PRMT-01**: User can choose from a library of writing prompts (gratitude, reflection, goals categories)
- [ ] **PRMT-02**: User can skip prompts and write free-form

### Browsing

- [ ] **BRWS-01**: User can view a calendar showing which days have journal entries (dot indicators)
- [ ] **BRWS-02**: User can click a calendar day to view or create that day's entry
- [ ] **BRWS-03**: User can scroll a timeline feed of past entries chronologically
- [ ] **BRWS-04**: User can access journal via a sidebar navigation entry

### Integration

- [ ] **INTG-01**: User can write a quick journal entry from a dashboard widget
- [ ] **INTG-02**: User can optionally link a journal entry to specific habits or tasks
- [ ] **INTG-03**: User can see "On This Day" past reflections for today's date
- [ ] **INTG-04**: User can see a journal streak counter (consecutive days with entries)

### i18n

- [ ] **I18N-01**: All journal UI strings translated in en, zh, zh-TW
- [ ] **I18N-02**: Writing prompts available in all three locales

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### Analytics

- **ANLT-01**: User can see mood correlation with habits ("you feel better on exercise days")
- **ANLT-02**: User can view mood distribution charts over time
- **ANLT-03**: User can search across journal entries (full-text search)

### Media

- **MEDA-01**: User can attach images to journal entries
- **MEDA-02**: User can use markdown formatting shortcuts

## Out of Scope

| Feature | Reason |
|---------|--------|
| AI-generated prompts or summaries | No AI API integration planned; static prompt library sufficient |
| Voice-to-text journal entries | Requires speech API, out of scope for web-first |
| Journal entry sharing/export | Data export exists for habits; journal export deferred |
| Real-time collaborative journaling | Single-user app, not applicable |
| Mood notification reminders | No push notification infrastructure |
| Photo/file uploads | No file storage infrastructure (Supabase Storage not configured) |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ENTR-01 | — | Pending |
| ENTR-02 | — | Pending |
| ENTR-03 | — | Pending |
| ENTR-04 | — | Pending |
| ENTR-05 | — | Pending |
| PRMT-01 | — | Pending |
| PRMT-02 | — | Pending |
| BRWS-01 | — | Pending |
| BRWS-02 | — | Pending |
| BRWS-03 | — | Pending |
| BRWS-04 | — | Pending |
| INTG-01 | — | Pending |
| INTG-02 | — | Pending |
| INTG-03 | — | Pending |
| INTG-04 | — | Pending |
| I18N-01 | — | Pending |
| I18N-02 | — | Pending |

**Coverage:**
- v4.0 requirements: 17 total
- Mapped to phases: 0
- Unmapped: 17 ⚠️

---
*Requirements defined: 2026-02-22*
*Last updated: 2026-02-22 after initial definition*
