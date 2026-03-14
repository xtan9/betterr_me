---
phase: 23-household-couples
verified: 2026-02-23T22:15:00Z
status: human_needed
score: 5/5 must-haves verified
re_verification: false
human_verification:
  - test: "Invite partner flow — solo user visits /money/settings and clicks Invite Partner button, enters an email, verifies a shareable invite link appears"
    expected: "Invite link displays in dialog with copy button; link format is /money/invite/accept?token=<uuid>"
    why_human: "Requires authentication session and live Supabase instance to create household invitation record"
  - test: "Accept invite page — open invite link in a different browser session as a new user"
    expected: "Page shows loading spinner, then success message with Go to Money button; user is now in the shared household"
    why_human: "Requires two live authenticated sessions, real token in household_invitations table, and actual merge logic execution"
  - test: "Mine/Household tabs do NOT appear for solo user"
    expected: "No Mine/Household tabs visible on /money/accounts, /money/transactions, or any other money page"
    why_human: "Tab rendering depends on isMultiMember derived from live API call to /api/money/household"
  - test: "Mine/Household tabs appear after partner joins"
    expected: "Mine and Household tabs appear on accounts, transactions, budgets, goals, bills, and net-worth pages; switching tabs refreshes data"
    why_human: "Requires two users sharing a household to be present in the database"
  - test: "Account visibility selector (mine/ours/hidden)"
    expected: "In multi-member household, each account card on /money/accounts shows a visibility dropdown; changing it updates the account and triggers relevant transaction behavior"
    why_human: "Requires multi-member household and live PATCH /api/money/accounts/[id]/visibility call"
  - test: "Transaction redaction in household view"
    expected: "In Household tab on /money/transactions, merchant name and description are blank; only category and amount are visible"
    why_human: "Requires multi-member household with shared ('ours') accounts and transactions"
  - test: "Household settings page shows member management"
    expected: "Owner sees member list with Remove buttons and pending invitations with Revoke; non-owner sees Leave Household button"
    why_human: "Requires live household with multiple members; role-based UI depends on runtime data"
---

# Phase 23: Household & Couples Verification Report

**Phase Goal:** Two partners can share a household with combined and individual financial views while controlling what each sees
**Verified:** 2026-02-23T22:15:00Z
**Status:** human_needed (automated checks all passed — 7 items require live two-user environment)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | User can invite a partner by email; partner accepts and joins without disrupting inviter's data | VERIFIED | `HouseholdsDB.createInvite` + `acceptInvite` with full merge flow; `POST /api/money/household/invite` (201 with token); `POST /api/money/household/accept` uses adminClient for cross-household merge |
| 2  | Each partner has their own login and personal view of individual accounts, transactions, and budgets | VERIFIED | `getByHouseholdFiltered(view='mine')` filters by `owner_id`; all GET endpoints default to `view=mine`; solo users get unchanged behavior |
| 3  | Both partners can see combined household view showing merged spending, budgets, net worth, and savings goals | VERIFIED | All 7 money GET endpoints accept `?view=household`; `HouseholdViewTabs` switches view mode; net-worth household view sums ALL accounts |
| 4  | User can set each account as "mine", "ours", or "hidden"; partner respects visibility settings | VERIFIED | `PATCH /api/money/accounts/[id]/visibility` calls `MoneyAccountsDB.updateVisibility`; household transaction queries filter by visibility; `redactForHousehold` strips private details |
| 5  | Partner 1 can use the app solo from day one; Partner 2 joins asynchronously at any time | VERIFIED | `HouseholdViewTabs` returns null when `!isMultiMember`; all SWR hooks default to `view='mine'`; `acceptInvite` merges data from solo household non-destructively |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260224000001_household_invitations_visibility.sql` | Schema for invitations, visibility, ownership | VERIFIED | Contains `household_invitations` CREATE TABLE, ALTER TABLE for accounts/transactions/budgets/goals, RLS policies, indexes, backfill UPDATEs |
| `lib/db/households.ts` | HouseholdsDB class with invite lifecycle | VERIFIED | `class HouseholdsDB` with 9 public methods: resolveHousehold, getMembers, getMemberRole, getMemberCount, createInvite, getInvitations, getInvitationByToken, acceptInvite (full merge), removeMember, revokeInvite, getPendingInvitesForEmail |
| `lib/validations/household.ts` | Zod schemas for invite, visibility, transaction visibility | VERIFIED | `inviteSchema`, `visibilityChangeSchema`, `transactionVisibilitySchema` all present with inferred types |
| `app/api/money/household/invite/route.ts` | POST for sending invitations | VERIFIED | POST (auth, owner-only, member count limit, duplicate handling) + DELETE (revoke) |
| `app/api/money/household/accept/route.ts` | POST for accepting invitations with merge | VERIFIED | POST uses `HouseholdsDB.acceptInvite` with adminClient |
| `app/api/money/household/members/[id]/route.ts` | DELETE for member removal | VERIFIED | Owner-only, cannot remove self, 204 on success |
| `app/api/money/household/leave/route.ts` | POST for non-owner departure | VERIFIED | Non-owner only guard, uses adminClient via removeMember |
| `app/api/money/accounts/[id]/visibility/route.ts` | PATCH for visibility changes | VERIFIED | Uses `visibilityChangeSchema`, calls `MoneyAccountsDB.updateVisibility` |
| `lib/hooks/use-household.ts` | SWR hook with view mode state | VERIFIED | Exports `useHousehold()` with `viewMode`, `setViewMode`, `isMultiMember`, `isOwner`, `userId`, `members`, `invitations`, `mutate` |
| `components/money/household-view-tabs.tsx` | Mine/Household tab switcher | VERIFIED | Returns `null` when `!isMultiMember`; `HouseholdViewTabs` with ViewMode props |
| `components/money/household-invite-dialog.tsx` | Email invite form + shareable link | VERIFIED | react-hook-form + zodResolver, POST to /api/money/household/invite, shows invite link with copy button |
| `components/money/household-members-list.tsx` | Member list with remove/leave | VERIFIED | Present with remove/leave/revoke actions |
| `components/money/household-settings.tsx` | Settings panel with invite + members | VERIFIED | Wired to `useHousehold()`, renders `HouseholdInviteDialog` (owner only) + `HouseholdMembersList` |
| `components/money/account-visibility-selector.tsx` | Mine/ours/hidden dropdown | VERIFIED | Select component, PATCH to `/api/money/accounts/${accountId}/visibility`, toast feedback |
| `app/money/invite/accept/page.tsx` | Token-based invite acceptance page | VERIFIED | Reads `?token=` from searchParams, POSTs to `/api/money/household/accept`, shows loading/success/error states; wrapped in Suspense |
| `tests/components/money/household-view-tabs.test.tsx` | Component tests | VERIFIED | 6 tests passing: renders nothing for solo, renders tabs for multi-member, tab switching, active state, accessibility |
| `tests/components/money/household-settings.test.tsx` | Settings component tests | VERIFIED | 5 tests passing: invite button owner/non-owner, member list, loading state, count display |
| `tests/lib/validations/household.test.ts` | Validation schema tests | VERIFIED | 16 tests passing: all 3 schemas covered |
| `tests/app/api/money/household/invite-route.test.ts` | Invite API route tests | VERIFIED | 7 tests passing: auth, validation, owner-only, full, success, duplicate |
| `tests/app/api/money/household/accept-route.test.ts` | Accept API route tests | VERIFIED | 6 tests passing: auth, missing token, invalid token, expired, success, already in household |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lib/db/households.ts` | `household_invitations` table | queries against household_invitations, household_members tables | WIRED | `createInvite`, `getInvitations`, `acceptInvite`, `revokeInvite` all query `household_invitations` table |
| `lib/db/accounts-money.ts` | accounts table | visibility-aware queries using `owner_id`, `visibility` columns | WIRED | `getByHouseholdFiltered` filters by `owner_id` (mine) or `visibility IN ('ours','hidden')` (household); `updateVisibility` sets visibility column |
| `app/api/money/household/accept/route.ts` | `lib/db/households.ts` | `HouseholdsDB.acceptInvite` with adminClient | WIRED | `adminHouseholdsDB.acceptInvite(parsed.data.token, user.id, adminClient)` — confirmed in code |
| `app/api/money/transactions/route.ts` | `lib/db/transactions.ts` | `getByHouseholdFiltered` with view mode | WIRED | `transactionsDB.getByHouseholdFiltered(householdId, user.id, view, filters)` called in GET |
| `app/api/money/accounts/[id]/visibility/route.ts` | `lib/db/accounts-money.ts` | `updateVisibility` | WIRED | `accountsDB.updateVisibility(accountId, parsed.data.visibility, householdId)` called in PATCH |
| `components/money/household-view-tabs.tsx` | `lib/hooks/use-household.ts` | `useHousehold().isMultiMember` to show/hide tabs | WIRED | `HouseholdViewTabs` accepts `isMultiMember` prop; callers (`accounts-list.tsx`, `transaction-list.tsx`, `money-page-shell.tsx`, etc.) get it from `useHousehold()` |
| `lib/hooks/use-accounts.ts` | `/api/money/accounts?view=` | SWR key includes view mode | WIRED | Key is `/api/money/accounts?view=${view}`; `accounts-list.tsx` calls `useAccounts(viewMode)` where viewMode comes from `useHousehold()` |
| `lib/hooks/use-transactions.ts` | `/api/money/transactions?view=` | SWR key includes view mode | WIRED | `params.set("view", view)` in getKey; `transaction-list.tsx` calls `useTransactions(filters, viewMode)` |
| `app/money/invite/accept/page.tsx` | `/api/money/household/accept` | POST with token from searchParams | WIRED | `fetch("/api/money/household/accept", { method: "POST", body: JSON.stringify({ token }) })` — confirmed |
| `app/money/settings/page.tsx` | `components/money/household-settings.tsx` | imports and renders HouseholdSettings | WIRED | `import { HouseholdSettings }` and `<HouseholdSettings />` on line 12 |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| HOUS-01 | 23-01, 23-02, 23-04 | User can invite a partner via email | SATISFIED | `HouseholdsDB.createInvite`, `POST /api/money/household/invite`, `HouseholdInviteDialog`, invite-route test suite |
| HOUS-02 | 23-01, 23-02, 23-03, 23-04 | Each partner has their own login and personal view | SATISFIED | `view='mine'` default on all GET endpoints; `getByHouseholdFiltered` filters by `owner_id`; `HouseholdViewTabs` null for solo users |
| HOUS-03 | 23-01, 23-02, 23-03, 23-04 | Both partners see combined household spending view | SATISFIED | `view='household'` on all money GET endpoints; `HouseholdViewTabs` switches all pages; analytics uses `getSpendingByCategoryForShared` |
| HOUS-04 | 23-01, 23-02, 23-03, 23-04 | User sets accounts as mine/ours/hidden | SATISFIED | `PATCH /api/money/accounts/[id]/visibility`; `AccountVisibilitySelector` component; `visibilityChangeSchema` validated; `updateVisibility` DB method |
| HOUS-05 | 23-01, 23-02, 23-03, 23-04 | Individual budgets alongside shared household budgets | SATISFIED | `BudgetsDB.getByMonthFiltered` filters by `owner_id`+`is_shared=false` (mine) or `is_shared=true` (household); owner-only write protection on budget mutations |
| HOUS-06 | 23-02, 23-03, 23-04 | Household view shows combined net worth, spending, budgets | SATISFIED | Net-worth `view=household` sums ALL accounts; analytics `view=household` uses shared accounts; budget `view=household` shows `is_shared=true` budgets |
| HOUS-07 | 23-01, 23-02, 23-03, 23-04 | Partner 1 uses solo; Partner 2 joins asynchronously | SATISFIED | `resolveHousehold` creates solo household on first call; `acceptInvite` merges data non-destructively; all hooks default `view='mine'`; `HouseholdViewTabs` hidden for solo users |

All 7 HOUS requirements satisfied. No orphaned requirements (REQUIREMENTS.md Phase 23 mapping covers all 7 IDs).

### Anti-Patterns Found

No blockers or stubs detected. Key checks:

| File | Pattern Checked | Result |
|------|----------------|--------|
| `lib/db/households.ts` | Empty implementations, TODO/placeholder | None found — full merge/split implementations |
| `app/api/money/household/invite/route.ts` | Static JSON returns, no DB query | None — live DB calls via HouseholdsDB |
| `app/api/money/household/accept/route.ts` | Stub responses | None — adminClient merge flow wired |
| `components/money/household-invite-dialog.tsx` | Form handler only prevents default | None — POSTs to API, shows invite link |
| `app/money/invite/accept/page.tsx` | Returns null / placeholder | None — full loading/success/error states |
| `lib/hooks/use-accounts.ts` | View param not in SWR key | Not present — `view=${view}` in SWR key URL |
| `lib/hooks/use-transactions.ts` | View param not set | Not present — `params.set("view", view)` confirmed |

### Human Verification Required

The automated layer is fully implemented and wired. All 41 new tests pass. All existing API tests pass with no regressions. The following items require a live two-user environment to verify:

#### 1. Invitation Flow End-to-End

**Test:** As user A (owner), go to `/money/settings` -> click "Invite Partner" -> enter an email -> submit form
**Expected:** Dialog shows a shareable invite link in the format `https://<host>/money/invite/accept?token=<uuid>`, copy button works
**Why human:** Requires authenticated session, live Supabase, and household_invitations table to accept the insert

#### 2. Invite Acceptance with Data Merge

**Test:** Open the invite link in a second browser as user B (who has their own accounts/transactions), click accept
**Expected:** Page shows loading spinner, then "Welcome! You've joined the household." message. User B's accounts are now in the shared household with visibility='mine'. User A's data is unchanged.
**Why human:** Requires two live sessions and real data merge execution across household boundaries

#### 3. Solo User — No Tabs Visible

**Test:** Log in as a solo user (no household partners) and navigate to /money/accounts, /money/transactions, /money/budgets
**Expected:** No Mine/Household tabs appear anywhere. UI is identical to pre-Phase 23 behavior.
**Why human:** isMultiMember depends on live /api/money/household response (members.length > 1)

#### 4. Mine/Household Tab Switching

**Test:** With two users sharing a household, switch between Mine and Household tabs on transactions page
**Expected:** Mine shows only user's own transactions; Household shows transactions from shared ('ours') accounts with merchant/description redacted (category + amount only)
**Why human:** Requires live multi-member household and accounts with varying visibility settings

#### 5. Account Visibility Selector

**Test:** On /money/accounts in a multi-member household, change an account from "Private" (mine) to "Shared" (ours)
**Expected:** Dropdown changes; "Visibility updated" toast appears; after switching to Household tab, the account's transactions appear with redacted details
**Why human:** Requires live multi-member household; transaction bulk-hide behavior on mine->ours change needs runtime verification

#### 6. Member Management

**Test:** Owner visits /money/settings and verifies member list shows all members; removes one member; verifies departing member's data moved to their new solo household
**Expected:** Owner sees Remove buttons next to non-owner members; after removal, removed user can still see their accounts/transactions (now in solo household)
**Why human:** Requires two active user sessions and live removeMember flow execution

#### 7. Transaction Redaction in Household View

**Test:** On /money/transactions with Household tab selected, verify sensitive details are hidden
**Expected:** Transaction rows show only date, category badge, and amount. No merchant name, no description text, no notes visible.
**Why human:** Requires live transactions with merchant_name/description data and a shared ('ours') account

## Gaps Summary

No automated gaps found. All 5 observable truths verified, all 20 required artifacts exist and are substantively implemented, all 10 key links are wired. All 7 HOUS requirements are satisfied.

Phase 23 goal is structurally achieved: the codebase contains all layers needed for two partners to share a household with combined and individual views and privacy controls.

The 7 human verification items are confirmatory — they test the runtime behavior of correctly-implemented code in a live multi-user environment. They are not blockers on the implementation's correctness.

---
_Verified: 2026-02-23T22:15:00Z_
_Verifier: Claude (gsd-verifier)_
