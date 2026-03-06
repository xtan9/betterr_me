---
phase: 20-transaction-management-categorization
plan: 04
subsystem: ui
tags: [react, nextjs, swr, sonner, react-hook-form, i18n, plaid, supabase, categories, transactions, splits, merchant-rules]

# Dependency graph
requires:
  - phase: 20-transaction-management-categorization
    plan: 02
    provides: "API routes for categories, merchant rules, transaction detail/update, transaction splits"
  - phase: 20-transaction-management-categorization
    plan: 03
    provides: "TransactionList, TransactionRow, useCategories, useTransactions hooks, CategoryBadge"
provides:
  - "TransactionDetail inline expand with category, notes, split info, account details"
  - "CategoryOverride with merchant rule prompt toast on category change"
  - "CategorySplitForm with dynamic rows, running remainder, and amount validation"
  - "CategoryManager with hide/show system categories, custom CRUD, merchant rules list"
  - "/money/settings page route rendering CategoryManager"
  - "Plaid sync pipeline applies merchant category rules before inserting transactions"
  - "Money page shell links to transactions and settings"
  - "i18n strings for transactions detail, categories, merchant rules, settings in en/zh/zh-TW"
affects: [20-05]

# Tech tracking
tech-stack:
  added: []
  patterns: ["toast-action-confirm: sonner toast with action/cancel buttons for merchant rule prompt", "inline-expand-detail: expandedId state in list with detail rendered below expanded row", "applyMerchantRules: bulk merchant name lookup before DB insert in sync pipeline"]

key-files:
  created:
    - components/money/transaction-detail.tsx
    - components/money/category-override.tsx
    - components/money/category-split-form.tsx
    - components/money/category-manager.tsx
    - app/money/settings/page.tsx
  modified:
    - components/money/transaction-list.tsx
    - components/money/money-page-shell.tsx
    - lib/plaid/sync.ts
    - i18n/messages/en.json
    - i18n/messages/zh.json
    - i18n/messages/zh-TW.json

key-decisions:
  - "Toast action/cancel pattern for merchant rule prompt (sonner with 10s duration)"
  - "Escape key closes expanded transaction detail (keydown listener in both list and detail)"
  - "Split form uses react-hook-form useFieldArray for dynamic rows with auto-fill remainder"
  - "Sync pipeline applies merchant rules via direct admin client query (no DB class import needed)"
  - "CategoryManager uses separate SWR call for merchant rules (independent from categories hook)"

patterns-established:
  - "toast-action-confirm: sonner toast with action + cancel buttons for user confirmation prompts"
  - "inline-expand-detail: expandedId state pattern for list items with inline detail views"
  - "applyMerchantRules: merchant name bulk lookup and category_id override in sync pipeline"

requirements-completed: [TXNS-04, TXNS-06, CATG-01, CATG-02, CATG-03]

# Metrics
duration: 6min
completed: 2026-02-22
---

# Phase 20 Plan 04: Transaction Detail & Category Management Summary

**Inline transaction detail with category override/merchant rule toast, split form with running remainder, category manager with hide/show and merchant rules, Plaid sync merchant rule integration, and i18n in 3 locales**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-23T02:34:16Z
- **Completed:** 2026-02-23T02:41:11Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- TransactionDetail inline expand with category selector, notes textarea, split summary, account info, and Plaid category display
- CategoryOverride with merchant rule creation prompt via sonner toast (action: "Yes, always" / cancel: "Just this once")
- CategorySplitForm with react-hook-form useFieldArray, dynamic split rows, running remainder, auto-fill last split, amount validation
- CategoryManager with system category hide/show toggles, custom category CRUD (create/delete), and merchant rules list with delete
- Money settings page at /money/settings following server page + client component pattern
- Plaid sync pipeline applies merchant category rules before inserting transactions (applyMerchantRules function)
- Money page shell links to /money/transactions and /money/settings
- Complete i18n coverage: 17 new transaction keys, 11 category keys, 4 merchant rule keys, 1 settings key in all 3 locales

## Task Commits

Each task was committed atomically:

1. **Task 1: Create transaction detail, category override, and split form components** - `d945a01` (feat)
2. **Task 2: Create category manager, update sync pipeline, add i18n, and wire navigation** - `4e4a98d` (feat)

## Files Created/Modified
- `components/money/transaction-detail.tsx` - Inline expand detail view with category, notes, splits, account info
- `components/money/category-override.tsx` - Category change with merchant rule prompt toast
- `components/money/category-split-form.tsx` - Split transaction UI with dynamic rows and amount validation
- `components/money/category-manager.tsx` - Category settings (hide/show, CRUD) and merchant rules list
- `app/money/settings/page.tsx` - Money settings page route
- `components/money/transaction-list.tsx` - Added expandedId state and TransactionDetail rendering
- `components/money/money-page-shell.tsx` - Added transactions and settings navigation links
- `lib/plaid/sync.ts` - Added applyMerchantRules function and category_id field to transaction objects
- `i18n/messages/en.json` - Added transactions detail, categories, merchantRules, settings keys
- `i18n/messages/zh.json` - Simplified Chinese translations for all new keys
- `i18n/messages/zh-TW.json` - Traditional Chinese translations for all new keys

## Decisions Made
- Toast action/cancel pattern chosen for merchant rule prompt (matches existing sonner usage in project, provides clear Yes/No action)
- Escape key handler added at both list and detail level for defensive UX
- Split form auto-fills last row remainder when exactly 2 splits exist (common case optimization)
- applyMerchantRules queries merchant_category_rules table directly with admin client instead of importing MerchantRulesDB (avoids circular dependency in sync pipeline)
- CategoryManager tracks hidden categories in local state for immediate UI feedback before API confirmation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 4 new components created and wired into existing UI
- Transaction detail expansion works with click toggle and Escape key
- Category override with merchant rule creation ready for user testing
- Split form validated (amounts must sum to transaction total)
- Plaid sync pipeline applies merchant rules before DB insert
- All i18n strings present in 3 locales
- Ready for Plan 05 (final phase tasks)

## Self-Check: PASSED

All 5 created files verified present. Both task commits (d945a01, 4e4a98d) verified in git log.

---
*Phase: 20-transaction-management-categorization*
*Plan: 04*
*Completed: 2026-02-22*
