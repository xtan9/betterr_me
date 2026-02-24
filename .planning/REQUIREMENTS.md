# Requirements: BetterR.Me

**Defined:** 2026-02-22
**Core Value:** Users see accurate stats, the API rejects bad input, and the codebase is maintainable

## v4.0 Requirements

Requirements for the Journal milestone. Each maps to roadmap phases.

### Entry

- [x] **ENTR-01**: User can create a journal entry for a specific date with rich text (Tiptap editor)
- [x] **ENTR-02**: User can edit and update an existing journal entry
- [x] **ENTR-03**: User can delete a journal entry
- [x] **ENTR-04**: User can select a mood emoji (5-point scale) for each entry
- [x] **ENTR-05**: User sees one entry per day (upsert model — creating for a date with an existing entry opens edit)

### Prompts

- [x] **PRMT-01**: User can choose from a library of writing prompts (gratitude, reflection, goals categories)
- [x] **PRMT-02**: User can skip prompts and write free-form

### Browsing

- [x] **BRWS-01**: User can view a calendar showing which days have journal entries (dot indicators)
- [x] **BRWS-02**: User can click a calendar day to view or create that day's entry
- [x] **BRWS-03**: User can scroll a timeline feed of past entries chronologically
- [x] **BRWS-04**: User can access journal via a sidebar navigation entry

### Integration

- [x] **INTG-01**: User can write a quick journal entry from a dashboard widget
- [x] **INTG-02**: User can optionally link a journal entry to specific habits or tasks
- [x] **INTG-03**: User can see "On This Day" past reflections for today's date
- [x] **INTG-04**: User can see a journal streak counter (consecutive days with entries)

### i18n

- [x] **I18N-01**: All journal UI strings translated in en, zh, zh-TW
- [x] **I18N-02**: Writing prompts available in all three locales

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
| ENTR-01 | Phase 26 | Complete |
| ENTR-02 | Phase 26 | Complete |
| ENTR-03 | Phase 21 | Complete |
| ENTR-04 | Phase 26 | Complete |
| ENTR-05 | Phase 26 | Complete |
| PRMT-01 | Phase 22 | Complete |
| PRMT-02 | Phase 22 | Complete |
| BRWS-01 | Phase 23 | Complete |
| BRWS-02 | Phase 23 | Complete |
| BRWS-03 | Phase 23 | Complete |
| BRWS-04 | Phase 23 | Complete |
| INTG-01 | Phase 24 | Complete |
| INTG-02 | Phase 24 | Complete |
| INTG-03 | Phase 24 | Complete |
| INTG-04 | Phase 24 | Complete |
| I18N-01 | Phase 25 | Complete |
| I18N-02 | Phase 25 | Complete |

**Coverage:**
- v4.0 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0

---
*Requirements defined: 2026-02-22*
*Last updated: 2026-02-24 after gap closure phase creation*
