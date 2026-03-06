# Phase 23: Household & Couples - Research

**Researched:** 2026-02-23
**Domain:** Multi-user household data sharing, invitation flows, privacy controls, combined financial views
**Confidence:** HIGH

## Summary

Phase 23 transforms the existing single-user money feature into a multi-user household system where 2-5 members share combined and individual financial views. The foundation is already strong: all money tables use `household_id` with IN-subquery RLS policies, and the `households`/`household_members` tables already exist with `owner`/`member` roles. The core work falls into four areas:

1. **Invitation system** -- new `household_invitations` table with token-based email invites, an accept-invite API endpoint, and RLS policies for invitation management.
2. **Account/transaction visibility** -- new `owner_id` and `visibility` columns on accounts, `is_hidden_from_household` on transactions, `is_shared_to_household` on transactions (for selectively sharing "mine" transactions), and application-layer filtering that respects privacy.
3. **Personal vs shared budgets/goals** -- new `owner_id` and `is_shared` columns on budgets and savings_goals, with shared budgets/goals only tracking "ours" accounts.
4. **Mine/Household tab UI** -- a tab switcher component that only appears when the household has >1 member, with each page rendering filtered data based on the active tab.

**Primary recommendation:** Build this in layers: (1) invitation/joining infrastructure, (2) schema additions for visibility/ownership, (3) API-layer filtering for views, (4) UI tabs and household view components, (5) settings page for household management.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Invite delivery method: Claude's discretion (email link, code, or hybrid)
- If invited partner already has a BetterR.Me account with solo money data, their existing accounts and transactions merge into the household tagged as "mine"
- Household size: up to a small group (3-5 members), not strictly two
- One household owner manages invites
- Owner can remove members AND members can leave voluntarily
- Removed/leaving members keep their personal data but lose access to shared views
- Three account visibility levels: "mine" (private), "ours" (shared), "hidden" (balance-only)
- "Hidden" means: partner sees account name + balance, but cannot see any transactions
- Either household member can change any account's visibility (not restricted to account owner)
- New accounts default to "mine" -- user explicitly shares them
- When changing an account from "mine" to "ours": future transactions become visible to partners; historical transactions are NOT visible by default but visibility can be changed
- Transaction-level hiding: individual transactions can be hidden from household view entirely
- Transaction-level sharing: individual transactions on a "mine" account can be marked as shared, appearing in the household view
- In shared views, partners see transactions as **category + amount only** -- no merchant name, notes, or other details
- No notifications or audit logs for visibility changes -- privacy changes are silent
- Switching between personal and household views via **tabs on each page** (Mine / Household)
- Tabs only appear after a second member joins the household -- solo users see the current single view with no tabs
- Household tab defaults to flat merge of all visible accounts; optional filter/group-by to see per-member breakdown
- Only the budget/goal creator can edit shared budgets; other members see them read-only
- Shared budgets track spending only from accounts marked "ours" (not individually shared transactions)
- Shared savings goals track progress from "ours" accounts only
- Individual budgets are completely private -- never visible to other household members

### Claude's Discretion
- Invite delivery mechanism (email link vs code vs hybrid)
- Which money pages get the Mine / Household tabs
- Technical implementation of merge flow for existing accounts
- Tab design and page-level UX details
- Error states and edge case handling

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HOUS-01 | User can invite a partner to join their household via email | Invitation table schema, token-based invite flow, admin.inviteUserByEmail or custom email approach, accept-invite API endpoint |
| HOUS-02 | Each partner has their own login and personal view | Already supported by Supabase auth (separate users), personal view = current default behavior, enhanced with owner_id on accounts/budgets/goals |
| HOUS-03 | Both partners can see a combined household spending view | Household view queries all visible accounts (visibility = "ours" + "hidden" balance-only), transaction filtering at API layer |
| HOUS-04 | User can set accounts as "mine", "ours", or "hidden" (balance-only) for privacy controls | New `visibility` column on accounts, `is_hidden_from_household`/`is_shared_to_household` on transactions, API-layer enforcement |
| HOUS-05 | Each partner can have individual budgets alongside shared household budgets | New `owner_id` + `is_shared` columns on budgets, shared budgets query only "ours" accounts for spending |
| HOUS-06 | Household view shows combined net worth, spending, and budgets | Aggregate queries filtered by visibility, new household-view API endpoints or query params |
| HOUS-07 | Partner 1 can use the app solo; Partner 2 joins asynchronously without disruption | Current solo flow unchanged (tabs hidden until >1 member), invitation + merge flow handles async join |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Supabase | existing | Auth, DB, RLS, admin API | Already used, admin.inviteUserByEmail or custom invite flow |
| Next.js 16 | existing | App Router, API routes | Invitation/accept routes, server components for tabs |
| SWR | existing | Client data fetching | Household member count, view toggle state |
| next-intl | existing | i18n for all 3 locales | Household/invite UI strings |
| Zod | existing | Validation schemas | Invite, visibility change, and settings schemas |
| react-hook-form | existing | Form state | Invite form, household settings form |
| sonner | existing | Toast notifications | Invite sent/accepted/error feedback |

### Supporting (no new dependencies)
No new libraries required. The entire phase uses existing project dependencies. Invitation tokens use `crypto.randomUUID()` (Node.js built-in). Email sending is handled by Supabase auth hooks or a simple API call.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom invite tokens | `supabase.auth.admin.inviteUserByEmail()` | Admin invite creates a Supabase auth user, but doesn't handle household association; custom tokens give full control |
| RLS-level visibility | Application-layer filtering | RLS can't easily express "show balance but hide transactions for hidden accounts"; application-layer is more flexible for the 3-tier visibility model |
| React Context for view mode | URL query param `?view=household` | URL param is bookmarkable/shareable but might leak state; local state in a provider is simpler |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure (new/modified files)
```
supabase/migrations/
  20260224000001_household_invitations_visibility.sql  # New migration

lib/db/
  households.ts          # Extended: invite, accept, remove, leave, getMembers
  accounts-money.ts      # Extended: getByHouseholdFiltered (visibility-aware)
  transactions.ts        # Extended: getByHouseholdFiltered (visibility-aware)
  budgets.ts             # Extended: getByMonth with owner_id/is_shared filter
  savings-goals.ts       # Extended: getByHousehold with owner_id/is_shared filter
  types.ts               # Extended: new interfaces

lib/validations/
  household.ts           # New: invite schema, visibility change schema

lib/hooks/
  use-household.ts       # New: SWR hook for household members + view mode
  use-accounts.ts        # Extended: accepts view filter
  use-transactions.ts    # Extended: accepts view filter
  use-budgets.ts         # Extended: accepts view filter
  use-goals.ts           # Extended: accepts view filter

app/api/money/
  household/
    route.ts             # Extended: GET returns members list too
    invite/route.ts      # New: POST send invite
    accept/route.ts      # New: POST accept invite
    members/[id]/route.ts # New: DELETE remove member
    leave/route.ts       # New: POST leave household
  accounts/
    [id]/visibility/route.ts  # New: PATCH change visibility
  transactions/
    [id]/route.ts        # Extended: PATCH is_hidden_from_household, is_shared_to_household

components/money/
  household-view-tabs.tsx      # New: Mine/Household tab switcher
  household-invite-dialog.tsx  # New: Invite form dialog
  household-members-list.tsx   # New: Members list with remove/leave
  household-settings.tsx       # New: Household management panel

app/money/settings/page.tsx    # Extended: includes household management section
```

### Pattern 1: Invitation Token Flow (Recommended)
**What:** Custom invitation table with UUID tokens, email link delivery
**When to use:** When you need full control over the invitation lifecycle
**Why over admin.inviteUserByEmail:** The Supabase admin invite creates an auth user but doesn't handle household association. A custom flow lets us: (a) associate the invite with a specific household, (b) handle the case where the invitee already has an account, (c) control the accept flow completely.

```sql
-- New table: household_invitations
CREATE TABLE household_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES profiles(id),
  email TEXT NOT NULL,
  token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(household_id, email)  -- one active invite per email per household
);
```

**Accept flow (API route):**
```typescript
// POST /api/money/household/accept
// Body: { token: string }
async function acceptInvite(token: string, userId: string) {
  // 1. Validate token (exists, pending, not expired)
  // 2. Check if user already in a household
  //    a. If solo household (only member = owner), merge into inviter's household
  //    b. If multi-member household, reject (can't be in two households)
  // 3. Add user as 'member' to inviter's household
  // 4. Mark invitation as 'accepted'
  // 5. If merging: update user's accounts.household_id, re-tag as "mine"
}
```

### Pattern 2: Account Visibility Model
**What:** Three-tier visibility at the account level + transaction-level overrides
**When to use:** Every query that returns accounts or transactions to a user

```sql
-- Add to accounts table
ALTER TABLE accounts
  ADD COLUMN owner_id UUID REFERENCES profiles(id),  -- who connected/created this account
  ADD COLUMN visibility TEXT NOT NULL DEFAULT 'mine'
    CHECK (visibility IN ('mine', 'ours', 'hidden'));

-- Add to transactions table
ALTER TABLE transactions
  ADD COLUMN is_hidden_from_household BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN is_shared_to_household BOOLEAN NOT NULL DEFAULT false;
  -- is_hidden: even on "ours" account, this transaction is hidden from partners
  -- is_shared: on "mine" account, this transaction appears in household view
```

**Visibility matrix (what partner sees):**
| Account Visibility | Partner sees account? | Partner sees transactions? | Partner sees details? |
|---|---|---|---|
| mine | No | No (except is_shared=true ones) | Category + amount only |
| ours | Yes | Yes (except is_hidden=true ones) | Category + amount only |
| hidden | Yes (name + balance) | No | N/A |

### Pattern 3: Application-Layer View Filtering
**What:** API routes accept a `view` parameter to filter data
**When to use:** All money API routes that return accounts, transactions, budgets, goals, or net worth

```typescript
// In API routes: pass view mode and current user
async function getAccountsForView(
  householdId: string,
  userId: string,
  view: 'mine' | 'household'
): Promise<MoneyAccount[]> {
  const allAccounts = await accountsDB.getByHousehold(householdId);

  if (view === 'mine') {
    // Show only accounts owned by this user
    return allAccounts.filter(a => a.owner_id === userId);
  }

  // Household view: show ours + hidden (balance only) + shared transactions from mine
  return allAccounts.filter(a =>
    a.visibility === 'ours' || a.visibility === 'hidden'
  );
}
```

### Pattern 4: Household View Tabs
**What:** A tab component that switches between "Mine" and "Household" views
**When to use:** On money pages when the household has >1 member

```typescript
// components/money/household-view-tabs.tsx
"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHousehold } from "@/lib/hooks/use-household";

export function HouseholdViewTabs({
  value,
  onValueChange,
}: {
  value: "mine" | "household";
  onValueChange: (v: "mine" | "household") => void;
}) {
  const { members } = useHousehold();

  // Hide tabs for solo users
  if (members.length <= 1) return null;

  return (
    <Tabs value={value} onValueChange={onValueChange}>
      <TabsList>
        <TabsTrigger value="mine">{t("household.tabMine")}</TabsTrigger>
        <TabsTrigger value="household">{t("household.tabHousehold")}</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
```

### Pattern 5: Merge Flow for Existing Users
**What:** When an invited user already has solo money data, merge their household into the inviter's
**When to use:** During invitation acceptance when invitee has existing accounts

```typescript
// Server-side merge (in accept-invite handler, uses adminClient)
async function mergeHouseholds(
  adminClient: SupabaseClient,
  sourceHouseholdId: string,  // invitee's solo household
  targetHouseholdId: string,  // inviter's household
  userId: string              // invitee
) {
  // 1. Update all accounts: SET household_id = target, owner_id = userId, visibility = 'mine'
  // 2. Update all transactions: SET household_id = target
  // 3. Update all budgets: SET household_id = target, owner_id = userId, is_shared = false
  // 4. Update all savings_goals: SET household_id = target, owner_id = userId, is_shared = false
  // 5. Update all recurring_bills: SET household_id = target
  // 6. Update all manual_assets: SET household_id = target
  // 7. Update all merchant_category_rules: SET household_id = target
  // 8. Move household_member row: SET household_id = target, role = 'member'
  // 9. Delete the empty source household
  // 10. Move bank_connections: SET household_id = target
  // 11. Move net_worth_snapshots: handled separately (may conflict on dates)
  // 12. Move categories (custom, non-system): SET household_id = target
  //     -- Handle name collisions: skip if same name exists in target
}
```

### Pattern 6: Transaction Detail Redaction
**What:** Strip sensitive fields from transactions in household view
**When to use:** All household-view transaction responses

```typescript
function redactTransactionForHousehold(tx: Transaction): Partial<Transaction> {
  return {
    id: tx.id,
    account_id: tx.account_id,
    amount_cents: tx.amount_cents,
    category: tx.category,
    category_id: tx.category_id,
    transaction_date: tx.transaction_date,
    is_pending: tx.is_pending,
    // Redacted fields:
    // description: EXCLUDED
    // merchant_name: EXCLUDED
    // notes: EXCLUDED
    // plaid_category_detailed: EXCLUDED
  };
}
```

### Anti-Patterns to Avoid
- **RLS for visibility logic:** Do NOT try to encode the 3-tier visibility model in RLS. RLS already handles household scoping. Visibility is an application-layer concern because the rules are context-dependent (who is viewing, what view mode, what account visibility, what transaction flags).
- **Separate household_id per member:** Do NOT create separate households for each member's personal data. All data stays in one household; `owner_id` and `visibility` control what's shown.
- **Client-side filtering only:** Do NOT send all data to the client and filter there. The API must filter before sending to prevent data leakage via network inspection.
- **Modifying existing RLS policies:** Do NOT change the existing IN-subquery RLS pattern. It already correctly scopes to household members. Visibility filtering happens above RLS.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Invitation tokens | Custom crypto token generation | `crypto.randomUUID()` (Node built-in) | UUIDs are unguessable, no need for signed tokens |
| Email delivery | Custom SMTP integration | Supabase auth hooks or a simple fetch to an email API | Project already has Supabase; piggyback on its email infra |
| Household membership check | Query on every request | Cache in SWR via `useHousehold()` hook | Already have the pattern with `useAccounts()` |
| View mode state | Redux/Zustand store | React Context or simple useState in layout | Small, page-local state; no need for external state management |

**Key insight:** The hardest part of this phase is NOT the technical implementation -- it's the data model design for the 3-tier visibility system and the merge flow. The actual code follows patterns already established in Phases 18-22.

## Common Pitfalls

### Pitfall 1: Orphaned Data on Member Removal
**What goes wrong:** When a member leaves or is removed, their accounts/transactions/budgets are left in the household with no owner, or are accidentally deleted.
**Why it happens:** Forgetting that "removed members keep their personal data" means we need to handle the reverse of the merge flow.
**How to avoid:** On leave/remove: (1) Create a new solo household for the departing member, (2) Move their owned accounts + transactions back, (3) Delete their shared budgets (or transfer ownership), (4) Remove from household_members.
**Warning signs:** Tests that only test the "join" path but not the "leave" path.

### Pitfall 2: Historical Transaction Visibility on Account Sharing
**What goes wrong:** When user changes account from "mine" to "ours", all historical transactions become visible.
**Why it happens:** The decision says "historical transactions are NOT visible by default" but the naive implementation shows everything.
**How to avoid:** When visibility changes from "mine" to "ours", record a `shared_since` timestamp on the account. Only transactions with `transaction_date >= shared_since` are visible in household view. Alternatively, bulk-set `is_hidden_from_household = true` on all existing transactions when sharing.
**Warning signs:** No timestamp or flag tracking when the account was shared.

### Pitfall 3: Race Condition in Household Merge
**What goes wrong:** Two users accept invites simultaneously, or an invite is accepted while the inviter is actively using the app.
**Why it happens:** The merge flow updates many tables non-atomically.
**How to avoid:** Use the adminClient (service role) for the merge, wrap critical steps in error handling, and use SWR `mutate()` to refresh the inviter's view after acceptance. Consider a `status` flag on the household to prevent concurrent merges.
**Warning signs:** No error handling in the merge flow.

### Pitfall 4: Net Worth Double-Counting
**What goes wrong:** Household net worth counts the same account twice (once per member view).
**Why it happens:** Each member's "mine" view includes their personal accounts, and the household view includes "ours" + "hidden" accounts.
**How to avoid:** Household net worth = sum of ALL accounts across ALL members (mine + ours + hidden). The individual "mine" view net worth = sum of only that user's accounts. These are separate calculations.
**Warning signs:** Using the same net worth calculation for both views.

### Pitfall 5: Shared Budget Spending Calculation
**What goes wrong:** Shared budgets include spending from "mine" accounts.
**Why it happens:** The current `getSpendingByCategory` queries all transactions in the household.
**How to avoid:** Shared budget spending must filter: `WHERE account_id IN (SELECT id FROM accounts WHERE visibility = 'ours')`. Add an `accountIds` filter to `getSpendingByCategory`.
**Warning signs:** No account filtering in spending aggregation queries.

### Pitfall 6: Invite to Non-Existent Email
**What goes wrong:** User invites an email that doesn't have a BetterR.Me account, but the invitation link doesn't work after they sign up.
**Why it happens:** The invite was tied to a specific email, but the new user's auth flow doesn't check for pending invitations.
**How to avoid:** After login/signup, check for pending invitations matching the user's email. Show a banner or prompt to accept. The invitation token should also work as a direct accept link.
**Warning signs:** Invitation flow only tested with existing users.

## Code Examples

### Migration: Household Invitations + Visibility Columns

```sql
-- household_invitations table
CREATE TABLE household_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES profiles(id),
  email TEXT NOT NULL,
  token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(household_id, email)
);

CREATE INDEX idx_invitations_token ON household_invitations(token);
CREATE INDEX idx_invitations_email ON household_invitations(email);
CREATE INDEX idx_invitations_household ON household_invitations(household_id);

-- RLS for invitations
ALTER TABLE household_invitations ENABLE ROW LEVEL SECURITY;

-- Household owners can view/create invitations
CREATE POLICY "Household owners can view invitations"
  ON household_invitations FOR SELECT TO authenticated
  USING (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid()) AND role = 'owner'
  ));

CREATE POLICY "Household owners can create invitations"
  ON household_invitations FOR INSERT TO authenticated
  WITH CHECK (household_id IN (
    SELECT household_id FROM household_members
    WHERE user_id = (SELECT auth.uid()) AND role = 'owner'
  ));

-- Invitees can view their own invitations (by email match)
-- Note: This requires application-layer filtering since we can't
-- reliably match auth.email() in RLS. Use adminClient for invite acceptance.

-- Account visibility columns
ALTER TABLE accounts
  ADD COLUMN owner_id UUID REFERENCES profiles(id),
  ADD COLUMN visibility TEXT NOT NULL DEFAULT 'mine'
    CHECK (visibility IN ('mine', 'ours', 'hidden')),
  ADD COLUMN shared_since TIMESTAMPTZ;

-- Backfill owner_id from connected_by (for Plaid accounts)
UPDATE accounts SET owner_id = bc.connected_by
FROM bank_connections bc
WHERE accounts.bank_connection_id = bc.id
AND accounts.owner_id IS NULL
AND bc.connected_by IS NOT NULL;

-- Transaction visibility flags
ALTER TABLE transactions
  ADD COLUMN is_hidden_from_household BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN is_shared_to_household BOOLEAN NOT NULL DEFAULT false;

-- Budget/Goal ownership
ALTER TABLE budgets
  ADD COLUMN owner_id UUID REFERENCES profiles(id),
  ADD COLUMN is_shared BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE savings_goals
  ADD COLUMN owner_id UUID REFERENCES profiles(id),
  ADD COLUMN is_shared BOOLEAN NOT NULL DEFAULT false;

-- Indexes for ownership queries
CREATE INDEX idx_accounts_owner ON accounts(owner_id);
CREATE INDEX idx_accounts_visibility ON accounts(visibility);
CREATE INDEX idx_budgets_owner ON budgets(owner_id);
CREATE INDEX idx_goals_owner ON savings_goals(owner_id);
```

### API Route: Send Invitation

```typescript
// POST /api/money/household/invite
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  const householdId = await resolveHousehold(supabase, user.id);

  // Verify user is owner
  const { data: membership } = await supabase
    .from("household_members")
    .select("role")
    .eq("household_id", householdId)
    .eq("user_id", user.id)
    .single();

  if (membership?.role !== "owner") {
    return NextResponse.json({ error: "Only owners can invite" }, { status: 403 });
  }

  // Check household size limit
  const { count } = await supabase
    .from("household_members")
    .select("*", { count: "exact", head: true })
    .eq("household_id", householdId);

  if ((count ?? 0) >= 5) {
    return NextResponse.json({ error: "Household is full (max 5)" }, { status: 400 });
  }

  // Create invitation (adminClient for cross-user email lookup)
  const adminClient = createAdminClient();
  const { data: invite, error } = await adminClient
    .from("household_invitations")
    .insert({
      household_id: householdId,
      invited_by: user.id,
      email: parsed.data.email,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Already invited" }, { status: 409 });
    }
    throw error;
  }

  // Send invitation email (via Supabase Edge Function or direct API)
  // The email contains a link: /money/invite/accept?token={invite.token}

  return NextResponse.json({ invitation: invite }, { status: 201 });
}
```

### SWR Hook: Household Members

```typescript
// lib/hooks/use-household.ts
export function useHousehold() {
  const { data, error, mutate } = useSWR<HouseholdResponse>(
    "/api/money/household",
    fetcher
  );

  const isLoading = !data && !error;
  const isMultiMember = (data?.members?.length ?? 0) > 1;

  return {
    householdId: data?.household_id ?? null,
    members: data?.members ?? [],
    invitations: data?.invitations ?? [],
    isMultiMember,
    isOwner: data?.role === "owner",
    isLoading,
    error,
    mutate,
  };
}
```

### Validation Schema: Invite

```typescript
// lib/validations/household.ts
import { z } from "zod";

export const inviteSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const visibilityChangeSchema = z.object({
  visibility: z.enum(["mine", "ours", "hidden"]),
});

export const transactionVisibilitySchema = z.object({
  is_hidden_from_household: z.boolean().optional(),
  is_shared_to_household: z.boolean().optional(),
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate DB per household | Shared DB with RLS + application filtering | Standard practice | Project already uses shared DB + RLS; visibility is app-layer |
| Custom auth invite system | Supabase admin.inviteUserByEmail() | Supabase GA | Good for new users, but doesn't handle household association; hybrid approach needed |
| URL-based view switching | Client-side state (tabs) | React patterns | Simpler, no URL leakage, view mode is ephemeral |

**Deprecated/outdated:**
- None relevant -- Supabase invitation API has been stable since GA

## Open Questions

1. **Email delivery for invitations**
   - What we know: Supabase provides `admin.inviteUserByEmail()` for new users and email hooks for customization
   - What's unclear: Whether the project has an email sending service configured (SendGrid, Resend, etc.) or relies solely on Supabase's built-in emails
   - Recommendation: Use Supabase's built-in email for the invitation link. If the invitee is already a user, they'll see the invite after logging in (check for pending invites on auth). If new, the link directs them to sign up first, then auto-accepts.

2. **Net worth snapshots during merge**
   - What we know: Net worth snapshots have a UNIQUE(household_id, snapshot_date) constraint
   - What's unclear: How to handle overlapping snapshot dates when merging households
   - Recommendation: During merge, recalculate net worth snapshots for the target household by re-summing all accounts. Or simply delete the source household's snapshots and let the next sync create fresh ones.

3. **Categories deduplication during merge**
   - What we know: Categories are household-scoped, and system defaults are shared (NULL household_id)
   - What's unclear: What happens when both households have a custom category with the same name
   - Recommendation: Skip duplicates during merge. If source household has custom category "Pets" and target also has "Pets", keep target's version and remap the source's transactions to target's category ID.

4. **Which pages get Mine/Household tabs**
   - What we know: User decided tabs on each page
   - Recommendation: All money pages except Settings: Accounts, Transactions, Budgets, Bills, Goals, Net Worth, and the main Money page shell. Settings page gets a Household Management section instead of tabs.

## Sources

### Primary (HIGH confidence)
- Supabase documentation via Context7 (`/supabase/supabase`) - admin.inviteUserByEmail, RLS patterns, magic link OTP
- Project codebase (direct file reads) - all migration files, DB classes, API routes, components, types, hooks

### Secondary (MEDIUM confidence)
- Supabase blog on multi-tenant RLS patterns - verified against project's existing IN-subquery pattern
- next-intl documentation via Context7 (`/amannn/next-intl`) - tab/view pattern i18n

### Tertiary (LOW confidence)
- None -- all findings verified against primary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, all patterns verified against existing codebase
- Architecture: HIGH - extends existing patterns (household_id, RLS, DB classes, SWR hooks)
- Invitation flow: HIGH - Supabase admin API documented, custom token table straightforward
- Visibility model: HIGH - clear rules from CONTEXT.md, implementation is application-layer filtering
- Merge flow: MEDIUM - complex edge cases (net worth snapshots, category dedup), needs careful testing
- Pitfalls: HIGH - identified from analyzing existing code patterns and CONTEXT.md constraints

**Research date:** 2026-02-23
**Valid until:** 2026-03-23 (stable domain, no fast-moving dependencies)
