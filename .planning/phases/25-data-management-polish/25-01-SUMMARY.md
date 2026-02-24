---
phase: 25-data-management-polish
plan: 01
subsystem: api
tags: [csv, export, data-deletion, plaid, zod, rfc-4180]

# Dependency graph
requires:
  - phase: 19-plaid-integration
    provides: Plaid token exchange, Vault secrets, bank connections
  - phase: 20-transaction-management-categorization
    provides: TransactionsDB, MoneyAccountsDB, transaction query filtering
  - phase: 23-household-couples
    provides: HouseholdsDB.removeMember, multi-member household logic
provides:
  - CSV export utility with RFC 4180 escaping and UTF-8 BOM
  - GET /api/money/export endpoint returning CSV file
  - POST /api/money/delete-data endpoint with Plaid token revocation
  - Zod validation schemas for export date range and delete confirmation
affects: [25-02-data-management-polish]

# Tech tracking
tech-stack:
  added: []
  patterns: [rfc-4180-csv-escaping, utf8-bom-prefix, graceful-plaid-revocation-loop]

key-files:
  created:
    - lib/money/csv-export.ts
    - lib/validations/data-management.ts
    - app/api/money/export/route.ts
    - app/api/money/delete-data/route.ts
    - tests/lib/money/csv-export.test.ts
    - tests/lib/validations/data-management.test.ts
  modified: []

key-decisions:
  - "UTF-8 BOM prefix on CSV for Excel compatibility"
  - "Export limited to 10000 transactions to prevent memory issues"
  - "Delete endpoint gracefully handles Plaid revocation failures (log and continue)"
  - "Solo vs multi-member delete: solo deletes household directly, multi-member leaves then deletes"

patterns-established:
  - "RFC 4180 CSV escaping: escapeCsvField wraps fields with commas/quotes/newlines in double quotes"
  - "Data deletion pattern: revoke Plaid tokens, remove Vault secrets, then CASCADE via household delete"

requirements-completed: [MGMT-01, MGMT-02]

# Metrics
duration: 4min
completed: 2026-02-24
---

# Phase 25 Plan 01: Data Management Backend Summary

**CSV export with RFC 4180 escaping and BOM, data deletion with Plaid token revocation and CASCADE household delete**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-24T22:43:25Z
- **Completed:** 2026-02-24T22:47:07Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Pure `transactionsToCsv` function with RFC 4180 field escaping, UTF-8 BOM prefix, and dollar amount formatting via `centsToDecimal`
- GET `/api/money/export` endpoint returning CSV with Content-Type and Content-Disposition headers
- POST `/api/money/delete-data` endpoint that revokes all Plaid tokens, removes Vault secrets, and deletes household data via CASCADE
- Zod validation schemas for export date range (optional YYYY-MM-DD) and delete confirmation (exact "DELETE" literal)
- 33 unit tests covering CSV generation, field escaping, and validation schemas

## Task Commits

Each task was committed atomically:

1. **Task 1: CSV export utility, validation schemas, and tests** - `78f2b29` (feat)
2. **Task 2: Export and delete-data API routes** - `74ad972` (feat)

## Files Created/Modified
- `lib/money/csv-export.ts` - Pure CSV generation with RFC 4180 escaping and BOM prefix
- `lib/validations/data-management.ts` - Zod schemas for export params and delete confirmation
- `app/api/money/export/route.ts` - GET endpoint returning CSV attachment with date range filtering
- `app/api/money/delete-data/route.ts` - POST endpoint for full money data deletion with Plaid cleanup
- `tests/lib/money/csv-export.test.ts` - 20 unit tests for escapeCsvField and transactionsToCsv
- `tests/lib/validations/data-management.test.ts` - 13 unit tests for validation schemas

## Decisions Made
- Used UTF-8 BOM prefix (`\uFEFF`) on CSV output for Excel compatibility on Windows
- Export limited to 10,000 transactions to prevent memory issues on large datasets
- Delete endpoint gracefully handles individual Plaid token revocation failures (logs warning, continues to next)
- For multi-member households, delete uses removeMember to leave first, then deletes the new solo household
- Account name resolution falls back through name -> official_name -> plaid_account_id -> raw id

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- One pre-existing test failure in `transaction-list.test.tsx` (date-dependent "yesterday" label) - unrelated to changes, not caused by this plan

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Backend infrastructure complete for CSV export and data deletion
- Plan 25-02 can build UI components (export button, delete confirmation dialog) on top of these endpoints
- All validation schemas ready for client-side form integration

---
*Phase: 25-data-management-polish*
*Completed: 2026-02-24*

## Self-Check: PASSED

- All 6 created files exist on disk
- Both task commits (78f2b29, 74ad972) found in git history
