# Pitfalls Research

**Domain:** Adding money tracking features (Plaid, transactions, household/couples, AI insights) to an existing single-user Supabase habit/task app (BetterR.Me v4.0)
**Researched:** 2026-02-21
**Confidence:** HIGH (verified against existing codebase, Plaid official docs, Supabase official docs, moneyy.me research, and community post-mortems)

**Scope note:** This document focuses on **integration-specific pitfalls** -- mistakes that arise from adding money tracking to the *existing* BetterR.Me codebase. For general money-app pitfalls (Plaid sandbox confidence, transaction deduplication, categorization accuracy, etc.), see the moneyy.me research at `/home/xingdi/code/moneyy_me/.planning/research/PITFALLS.md`. Those pitfalls remain fully relevant and are referenced here where they intersect with BetterR.Me-specific concerns.

## Critical Pitfalls

### Pitfall 1: Household Model Breaks Every Existing RLS Policy

**What goes wrong:**
The entire existing BetterR.Me codebase uses `auth.uid() = user_id` as the RLS pattern. Every table (profiles, tasks, habits, habit_logs, habit_milestones, projects, recurring_tasks) enforces strict single-user isolation: `USING (auth.uid() = user_id)`. When household/couples support is added, money tables need a *different* RLS pattern: some data is shared via `household_id`, some is private to one partner.

The critical failure mode: a developer adds money tables with `household_id`-based RLS, then either (a) tries to retrofit existing habit/task tables with `household_id` (breaking everything) or (b) creates two incompatible security models in the same database. If a shared query joins a `household_id`-scoped money table with a `user_id`-scoped habits table, the results are wrong or empty because RLS policies apply independently to each table in a join.

**Why it happens:**
The codebase has 7+ tables all using identical `auth.uid() = user_id` policies. This pattern is deeply embedded -- every DB class (HabitsDB, TasksDB, ProjectsDB, etc.) passes `user_id` to `.eq('user_id', userId)` in every query. Developers adding money features will pattern-match the existing code and either force money tables into the `user_id` model (breaking household sharing) or introduce a completely different model that does not compose with existing features.

**How to avoid:**
1. **Do NOT add `household_id` to existing habit/task tables.** Habits, tasks, projects, recurring tasks remain strictly `user_id`-scoped. The existing RLS policies stay untouched.
2. **Money tables use a dual-column model:** every money table has both `user_id` (who created/owns the record) AND `household_id` (which household it belongs to). RLS policies on money tables use `household_id` for SELECT (allows both partners to see shared data) but `user_id` for INSERT (only the creator can insert).
3. **Create a `households` table and a `household_members` join table** as the bridge between Supabase auth users and household membership. RLS on money tables checks `household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())`.
4. **The dashboard API route remains single-user.** Money widgets on the dashboard query money data through household-scoped DB classes, but the dashboard route still authenticates via `auth.uid()` and passes the user's `household_id` (looked up from `household_members`) to money queries.
5. **Write the RLS policy for money tables in the same migration that creates them.** Never create a money table without RLS in the same transaction.

**Warning signs:**
- Habit/task tables gaining a `household_id` column
- Money RLS policies using `auth.uid() = user_id` (too restrictive -- partner cannot see shared data)
- Joins between `user_id`-scoped tables and `household_id`-scoped tables returning empty results
- Tests for money features only testing single-user scenarios, never two-partner scenarios

**Phase to address:**
Phase 1 (Database Schema) -- the household model and money table RLS policies must be designed and tested before any money features are built. This is the architectural foundation that everything else depends on.

---

### Pitfall 2: Supabase `numeric` Type Returns JavaScript `number` -- Silent Precision Loss

**What goes wrong:**
The project constraint says "all money arithmetic must use decimal.js, not native JS floats." However, Supabase's JavaScript client (`@supabase/supabase-js`) returns PostgreSQL `numeric` columns as JavaScript `number` type. This means even if you store `100.10` correctly in PostgreSQL `numeric(12,2)`, when you read it back via Supabase client, you get JavaScript `100.1` (a float). For most amounts this is invisible, but amounts like `$0.10 + $0.20` will not equal `$0.30` in JavaScript floats. More critically, the auto-generated TypeScript types from Supabase CLI map `numeric` to `number`, not `string`, so the type system will not warn you.

This is a confirmed Supabase issue (GitHub supabase/cli#582, closed as "not planned" -- PostgREST returns numeric as JavaScript number and the CLI follows suit). The data is stored correctly in PostgreSQL but corrupted on the round trip through the JavaScript client.

**Why it happens:**
PostgREST (which powers Supabase's REST API) serializes PostgreSQL `numeric` as JSON numbers. JSON has no decimal type -- all numbers are IEEE 754 floats. By the time the value reaches your JavaScript code, precision may already be lost. The existing BetterR.Me codebase has no financial data, so this has never been an issue before. Developers will add `decimal.js` for calculations but forget that the data coming FROM Supabase is already a float, making `new Decimal(amount)` reconstruct from a possibly-corrupted value.

**How to avoid:**
1. **Store money amounts as `integer` (cents), not `numeric` or `decimal`.** Store `$10.50` as `1050` (integer cents). This eliminates the Supabase numeric precision issue entirely. PostgreSQL `integer` maps to JavaScript `number` without precision loss (safe for amounts up to ~$90 trillion in cents).
2. **If you must use `numeric`:** Override the generated Supabase types to use `string` instead of `number` for money columns. Read amounts as strings, then construct `Decimal` from the string: `new Decimal(row.amount_str)`.
3. **Create a money utility module** (`lib/money/index.ts`) that wraps all conversions:
```typescript
import Decimal from 'decimal.js';
// All money stored as integer cents in the database
export function centsToDecimal(cents: number): Decimal {
  return new Decimal(cents).div(100);
}
export function decimalToCents(amount: Decimal): number {
  return amount.mul(100).round().toNumber();
}
export function formatMoney(cents: number, locale: string): string {
  return centsToDecimal(cents).toFixed(2);
}
```
4. **Never pass a Supabase-returned `numeric` value directly to `new Decimal()`.** Always go through the conversion layer.
5. **Add a lint rule or code review checklist item:** "No `new Decimal(row.amount)` where `amount` came from Supabase without cents conversion."

**Warning signs:**
- `numeric` or `decimal` column types in money table migrations (should be `integer` for cents)
- `new Decimal(transaction.amount)` without a cents-to-decimal conversion
- Unit tests passing because test values happen to be round numbers (test with `$10.33`, `$0.07`, `$19.99`)
- Budget totals off by 1 cent

**Phase to address:**
Phase 1 (Database Schema) -- the money storage format (integer cents) must be decided in the first migration. Changing from `numeric` to `integer` later requires a data migration on every money table.

---

### Pitfall 3: Plaid Webhook Endpoint Bypasses Supabase Auth -- Needs Separate Security

**What goes wrong:**
Every existing API route in BetterR.Me starts with the same pattern:
```typescript
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
```
Plaid webhook endpoints CANNOT use this pattern. Plaid sends webhooks server-to-server with no Supabase auth session -- no cookies, no JWT, no user context. The webhook must authenticate via Plaid's JWT verification (checking the `Plaid-Verification` header), not via Supabase auth.

The failure mode: a developer creates `/api/plaid/webhook` following the existing API route pattern, adds `getUser()` check, and every webhook returns 401. Or worse, they skip all auth checks to "make it work" and the endpoint accepts any unsigned request, allowing an attacker to inject fake transactions.

Additionally, the webhook handler needs to write to the database using the Supabase **service role key** (not the anon key), because there is no authenticated user context for RLS to evaluate. If the webhook uses the standard `createClient()` (which uses `NEXT_PUBLIC_SUPABASE_ANON_KEY`), writes will fail because RLS policies require `auth.uid()` which is null for server-to-server calls.

**Why it happens:**
The existing codebase has exactly one authentication pattern used across all 15+ API routes. Developers will cargo-cult this pattern for new endpoints. Plaid webhooks are the first external integration that calls INTO the app without user context, breaking the assumption that every API call has an authenticated Supabase session.

**How to avoid:**
1. **Create a separate Supabase client for service-role operations:**
```typescript
// lib/supabase/service.ts
import { createClient } from '@supabase/supabase-js';
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // NOT the anon key
    { auth: { persistSession: false } }
  );
}
```
2. **The webhook route handler must verify Plaid's JWT signature** before processing any data. Use Plaid's `plaid-node` SDK webhook verification utilities.
3. **Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client.** It must be a server-only env var (no `NEXT_PUBLIC_` prefix). Verify it is in `.env.local` and NOT in any client-side bundle.
4. **Create explicit RLS bypass policies for service-role operations** OR use the service role client which bypasses RLS entirely. If bypassing RLS, the webhook handler code itself must enforce correct `household_id` scoping.
5. **Add the webhook route to the proxy middleware allowlist** so it does not get redirected to the login page. Current proxy in `lib/supabase/proxy.ts` redirects unauthenticated requests to `/auth/login` -- this would catch the webhook too.

**Warning signs:**
- `/api/plaid/webhook` route contains `supabase.auth.getUser()` check
- Webhook handler uses `createClient()` from `lib/supabase/server.ts` (anon key, session-based)
- `SUPABASE_SERVICE_ROLE_KEY` appears in any file with `NEXT_PUBLIC_` prefix
- Webhook endpoint missing from middleware allowlist in `proxy.ts`
- No Plaid JWT verification in the webhook handler

**Phase to address:**
Phase 2 (Plaid Integration) -- the service-role client, webhook verification, and middleware allowlist update must be implemented as the first step of Plaid integration, before any webhook processing logic.

---

### Pitfall 4: SWR Cache Collision Between Money and Habit Data

**What goes wrong:**
The existing SWR cache uses URL-based keys: `/api/dashboard`, `/api/tasks`, `/api/habits`, `/api/sidebar/counts`. Money features will add new keys: `/api/transactions`, `/api/budgets`, `/api/accounts`, and likely extend `/api/dashboard` to include money widgets. The dashboard API route currently returns `DashboardData` with habits, tasks, stats. Adding money data to this response changes the shape of what every existing SWR consumer expects.

Specific failure scenario: the dashboard is extended to return money summary data alongside habits/tasks. An existing component (`DashboardContent`) destructures the response expecting the current shape. A money-specific mutation (`categorize transaction`) triggers a dashboard revalidation. The dashboard refetches and returns the new shape with money data. An old component fails to render because it doesn't handle the new fields, or worse, renders stale money data because SWR returned the cached (pre-money) response shape.

The project already has centralized SWR invalidation patterns (from the v3.0 kanban work), but money features introduce a new dimension: **household-level data vs. user-level data**. If User A categorizes a transaction in a shared household, User B's SWR cache still shows the old category until they manually refresh. SWR has no built-in mechanism for cross-user cache invalidation.

**Why it happens:**
SWR keys are per-browser-session. In a household app, two users look at the same data through different SWR caches. There is no pub/sub mechanism to tell User B's browser that User A changed something. Additionally, adding money data to existing endpoints (like `/api/dashboard`) conflates two caching lifecycles: habit data (changes infrequently) and money data (changes on every Plaid sync).

**How to avoid:**
1. **Keep money API endpoints completely separate from habit/task endpoints.** Do NOT add money data to the existing `/api/dashboard` response. Create `/api/money/dashboard` (or `/api/money/summary`) as a separate endpoint.
2. **The dashboard page composes multiple SWR hooks** -- the existing `useDashboard()` for habits/tasks and a new `useMoneyDashboard()` for money summary. They have independent cache keys, independent loading states, and independent error handling.
3. **For household cache staleness:** Accept that SWR will not sync across browsers. Add a "last synced" indicator on money views and a manual "Refresh" button. Use `revalidateOnFocus: true` (already the SWR default) so switching tabs triggers a refetch.
4. **Consider Supabase Realtime** for push-based updates within a household. Subscribe to `transactions` table changes filtered by `household_id`. On receiving an insert/update event, call `mutate()` on the relevant SWR key. This is the only way to get cross-user reactivity without polling.
5. **Create a money-specific SWR invalidation utility** separate from the existing task invalidation utility.

**Warning signs:**
- Money data added to the existing `/api/dashboard` route response
- A single SWR hook fetching both habit and money data
- Partner A makes a change and Partner B does not see it until full page reload
- Dashboard loading state blocked by slow Plaid sync data

**Phase to address:**
Phase 1 (Architecture) -- decide the API boundary between money and habit features before building any money endpoints. Phase 3 (Household) -- add Supabase Realtime subscriptions for cross-user updates.

---

### Pitfall 5: Existing DB Class Pattern Does Not Support Household Scoping

**What goes wrong:**
Every existing DB class follows this pattern:
```typescript
export class HabitsDB {
  constructor(private supabase: SupabaseClient) {}
  async getUserHabits(userId: string, filters?: HabitFilters): Promise<Habit[]> {
    // queries use .eq('user_id', userId)
  }
}
```
Money DB classes need a different scoping model: they query by `household_id`, not `user_id`. The temptation is to create money DB classes that follow the same pattern but with `householdId`:
```typescript
export class TransactionsDB {
  constructor(private supabase: SupabaseClient) {}
  async getTransactions(householdId: string, filters?: TransactionFilters) {
    // queries use .eq('household_id', householdId)
  }
}
```
The problem: the `householdId` must be derived from the authenticated user's membership, NOT from client input. If a developer passes a client-provided `householdId` (e.g., from a URL parameter or request body), an attacker can change the `householdId` to access another household's financial data.

The existing pattern avoids this because `userId` is always derived from `supabase.auth.getUser()` -- a server-side call that cannot be spoofed. But `householdId` has no equivalent server-side derivation in Supabase auth. It must be looked up from the `household_members` table.

**Why it happens:**
The existing code pattern of passing `userId` directly to DB methods looks simple and safe. Developers replicate the pattern with `householdId` without realizing that `userId` is trusted (from auth) while `householdId` is untrusted (must be derived). The codebase has no precedent for derived authorization -- every existing check is `auth.uid() = user_id`.

**How to avoid:**
1. **Create a `resolveHousehold()` utility** that takes a Supabase client (with user session) and returns the user's `household_id`:
```typescript
// lib/money/resolve-household.ts
export async function resolveHousehold(supabase: SupabaseClient): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AuthError('Not authenticated');
  const { data } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .single();
  if (!data) throw new AuthError('No household membership');
  return data.household_id;
}
```
2. **Money API routes call `resolveHousehold()` once, then pass the result to DB methods.** The `household_id` is NEVER accepted from the client request.
3. **RLS policies on money tables enforce the same check at the database level** as a safety net:
```sql
CREATE POLICY "Household members can view their money data"
  ON transactions FOR SELECT
  USING (household_id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  ));
```
4. **Add integration tests that explicitly verify:** a user cannot access money data from a household they do not belong to, even if they know the `household_id`.

**Warning signs:**
- Any money API route accepting `household_id` as a query parameter or request body field
- Money DB classes that take `householdId` as a constructor argument (too easy to pass wrong value)
- RLS policies on money tables that only check `user_id` (too restrictive) or have no household check (too permissive)
- No test for cross-household data isolation

**Phase to address:**
Phase 1 (Database Schema + Auth) -- the `resolveHousehold()` utility and money table RLS policies must be implemented before any money endpoints exist.

---

### Pitfall 6: Plaid Access Token Encryption with Supabase (Not Drizzle/Prisma)

**What goes wrong:**
The moneyy.me research recommends encrypting Plaid access tokens at rest with AES-256. That research assumed a Drizzle ORM + Neon stack where application-level encryption is straightforward (encrypt before insert, decrypt after select). BetterR.Me uses Supabase's JavaScript client, which does not have a middleware/hook layer for automatic encrypt/decrypt. You must manually encrypt before every insert and decrypt after every select.

The failure mode: a developer stores Plaid access tokens as plain text in a `plaid_items` table because "RLS protects it." RLS prevents *other users* from seeing the token, but does NOT protect against database dumps, backup leaks, Supabase dashboard access, or Supabase employees. A database breach exposes permanent read access to every connected user's bank accounts.

**Why it happens:**
Supabase makes database operations feel safe because of RLS. Developers conflate "only the owner can see this row via the API" with "this data is encrypted at rest." They are not the same thing. Supabase encrypts the disk at rest (infrastructure level), but individual column values are stored in plain text in the database. A `SELECT * FROM plaid_items` in the Supabase SQL Editor shows the token.

The existing BetterR.Me codebase has no encrypted columns and no encryption utilities. There is no pattern to follow.

**How to avoid:**
1. **Use Supabase Vault** (the `vault` extension) to store Plaid access tokens. Vault provides Authenticated Encryption with Associated Data (AEAD) using libsodium. The encryption key is managed by Supabase and never stored in the database. Store the access token in `vault.secrets` and reference it by ID from your `plaid_items` table.
2. **Alternative: Application-level encryption** with a key stored in environment variables. Create `lib/crypto/encrypt.ts`:
```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.PLAID_ENCRYPTION_KEY!, 'hex'); // 32 bytes
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  let enc = cipher.update(plaintext, 'utf8', 'hex');
  enc += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return iv.toString('hex') + ':' + enc + ':' + tag;
}
export function decrypt(ciphertext: string): string {
  const [ivHex, encHex, tagHex] = ciphertext.split(':');
  const decipher = createDecipheriv(ALGORITHM, Buffer.from(ivHex, 'hex'), /* ... */);
  // ... standard AES-256-GCM decryption
}
```
3. **Never store the encryption key in the database or in `NEXT_PUBLIC_` env vars.** Use `PLAID_ENCRYPTION_KEY` as a server-only environment variable.
4. **The `plaid_items` table should have a `text` column for the encrypted token**, NOT a `varchar` (encrypted values are longer than the original). Column name should be `encrypted_access_token` (not `access_token`) to make it obvious the value is encrypted.
5. **Add a startup check** that verifies `PLAID_ENCRYPTION_KEY` is set before the app starts processing Plaid operations.

**Warning signs:**
- A column named `access_token` in any migration SQL (should be `encrypted_access_token`)
- No `crypto` or `vault` imports in the Plaid service module
- `PLAID_ENCRYPTION_KEY` missing from `.env.example`
- Plaid access tokens appearing in application logs (check log scrubbing)

**Phase to address:**
Phase 2 (Plaid Integration) -- encryption must be implemented in the same PR that creates the `plaid_items` table. Never commit a migration with a plain-text access token column, even "temporarily."

---

### Pitfall 7: Vercel Serverless Timeout on Initial Plaid Transaction Sync

**What goes wrong:**
When a user first connects a bank account via Plaid Link, the app needs to immediately call `/transactions/sync` to fetch initial transaction history. This initial sync can return thousands of transactions and may take 10-30 seconds. Vercel Hobby plan has a 10-second function execution limit; Pro plan has 60 seconds. On the Hobby plan, the initial sync WILL time out for users with active bank accounts.

The existing BetterR.Me API routes are designed for fast responses (dashboard loads in <1 second). No route currently takes more than 2-3 seconds. The Plaid sync endpoint breaks this assumption.

**Why it happens:**
Developers test with Plaid Sandbox, which returns a small set of mock transactions instantly. The first real bank connection returns 6-24 months of transaction history in the initial sync -- potentially thousands of transactions requiring database insertion. On Vercel serverless, there is no persistent process to handle this in the background.

**How to avoid:**
1. **Never perform the initial transaction sync in the API route handler that responds to Plaid Link's `onSuccess`.** The Link success handler should only: (a) exchange the `public_token` for an `access_token`, (b) store the encrypted access token, (c) return success to the client immediately.
2. **Queue the initial sync as a background job.** Options for Vercel serverless:
   - **Vercel Cron Jobs** (`vercel.json` cron config): Schedule a periodic sync check every 15-30 minutes. Not ideal for initial sync (too much delay).
   - **Inngest**: Fire an event on account connection, handle the sync in an Inngest function that runs outside Vercel's execution limit. Inngest's free tier supports 50K function runs/month.
   - **Supabase Edge Functions**: Run the sync in a Supabase-hosted Deno function with a 150-second timeout.
   - **Fire-and-forget fetch**: The API route fires a fetch to another API route (`/api/internal/sync`) and does not await the response. The sync route runs until Vercel's timeout, processes what it can, and stores the cursor for the next run.
3. **Show the user a "Syncing your accounts..." status** immediately after connection. Do not block the UI waiting for transactions to appear.
4. **Implement cursor-based resumable sync**: If a sync is interrupted (timeout), store the cursor. The next sync attempt picks up where it left off rather than restarting.

**Warning signs:**
- `await plaidClient.transactionsSync()` called in the same API route as `plaidClient.itemPublicTokenExchange()`
- No background job infrastructure mentioned in the architecture
- Initial sync tested only with Plaid Sandbox (returns few transactions instantly)
- Vercel function timeout errors in production logs after real bank connections

**Phase to address:**
Phase 2 (Plaid Integration) -- background job infrastructure (Inngest or Supabase Edge Functions) must be set up before implementing transaction sync. The sync architecture is the foundation of the entire money feature.

---

### Pitfall 8: Adding `household_id` to Existing User Profile Creates Mandatory Coupling

**What goes wrong:**
A natural design is to add `household_id` to the existing `profiles` table, making every user belong to a household. This creates a migration problem: all existing users (who signed up for habits/tasks, not money tracking) must now have a `household_id`. Do you create a solo household for each existing user? Do you make `household_id` nullable? Either choice has consequences.

If `household_id` is NOT NULL, the migration must create a household for every existing user and backfill their `household_id`. This couples habit/task features to the household model -- now the `profiles` table (which is the FK target for ALL existing tables) has a dependency on the `households` table.

If `household_id` is nullable, every money query must handle the case where `household_id IS NULL` (user has not set up money features). This adds null checks throughout the money codebase.

Worse, the `profiles` table in BetterR.Me has an auto-creation trigger (`handle_new_user`) that fires on auth signup. If `household_id` is NOT NULL, this trigger must also create a household -- turning a simple auth trigger into a multi-table transaction that can fail.

**Why it happens:**
The `profiles` table is the natural place to store "user belongs to household" because it already stores user metadata. The existing `handle_new_user` trigger creates a profile row on signup. Extending it to also create a household and a household_members row feels logical but introduces fragile multi-table logic into a trigger.

**How to avoid:**
1. **Do NOT add `household_id` to the `profiles` table.** Keep profiles exactly as they are -- habits, tasks, and all existing features remain untouched.
2. **Use a separate `household_members` join table** that links `user_id` (from profiles/auth) to `household_id` (from households). Users who never use money features simply have no row in `household_members`.
3. **Money feature onboarding creates the household lazily.** When a user first visits `/money` (or connects a bank account), check for household membership. If none exists, create a solo household and membership row. This is an application-level operation, not a database trigger.
4. **The `handle_new_user` trigger stays unchanged.** New signups get a profile (as before) but no household. Household creation is opt-in via money feature onboarding.
5. **The `resolveHousehold()` utility (from Pitfall 5) returns null for users without a household.** Money routes check for null and redirect to money onboarding.

**Warning signs:**
- `ALTER TABLE profiles ADD COLUMN household_id` in any migration
- `handle_new_user` trigger modified to create household records
- Existing tests for profile creation breaking due to new household FK constraint
- Users who never use money features having phantom household records

**Phase to address:**
Phase 1 (Database Schema) -- the household model must be a separate table graph, not an extension of the existing profile table. This decision affects every subsequent migration.

---

### Pitfall 9: AI Insights Generating Harmful Financial Advice

**What goes wrong:**
The project spec calls for "contextual AI insights embedded in UI (not a chatbot)." If an LLM generates these insights, there is a real risk of the model producing statements that constitute financial advice -- "You should reduce your dining budget," "Consider moving your savings to a higher-yield account," "Your emergency fund is insufficient." These statements could be legally actionable under SEC/FINRA regulations, factually wrong (the model does not know the user's full financial picture), or anxiety-inducing (contradicting the "Calm Finance" design philosophy).

**Why it happens:**
LLMs are trained on financial content that is inherently advisory. Even with careful prompting, an LLM asked "what insights can you derive from this spending data?" will generate advice-like statements. The moneyy.me research explicitly flags "AI chatbot for financial advice" as an anti-feature due to SEC/FINRA compliance risk, but "contextual AI insights" exists in a gray area between observation and advice.

**How to avoid:**
1. **Start with rule-based insights, not LLM-generated insights.** Rule-based examples:
   - "Your grocery spending this month is 23% higher than last month" (observation, not advice)
   - "You have 3 subscriptions totaling $45/mo" (fact, not recommendation)
   - "Your rent is your largest expense at 35% of income" (context, not judgment)
2. **If using an LLM, constrain output to factual observations only.** System prompt must explicitly prohibit: recommendations, "should" statements, comparisons to benchmarks, and forward-looking predictions about investment returns.
3. **Add a legal disclaimer** to all AI-generated insights: "This is informational only and not financial advice."
4. **Review every insight template/prompt for advisory language** before launch. "You might want to..." is advice. "Your spending on X was Y" is not.
5. **Defer LLM-based insights to the last phase.** Build rule-based insights first, validate that users find them useful without anxiety, then consider adding LLM enhancement.

**Warning signs:**
- Insight text containing "should," "recommend," "consider," or "try to"
- Insights comparing user spending to external benchmarks ("average American spends...")
- No legal review of insight generation prompts
- Insights generating anxiety ("You overspent by $X this month!" with red styling)

**Phase to address:**
Phase 5 (AI Insights) -- rule-based insights first, LLM enhancement later. Legal review before any insight text is shown to users.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store money amounts as `numeric` instead of integer cents | Looks cleaner in SQL queries, no cents-to-dollars conversion | Silent precision loss through Supabase JS client, requires type overrides | Never -- integer cents is the correct pattern for Supabase |
| Skip Plaid access token encryption ("RLS is enough") | Faster development, no crypto code | Database breach exposes permanent bank access credentials | Never -- financial data encryption is non-negotiable |
| Add money data to existing `/api/dashboard` endpoint | One fetch for all dashboard data | Couples habit/money cache lifecycles, slower dashboard if Plaid data is slow | Never -- keep API boundaries separate |
| Use Supabase anon key for webhook handlers ("it works in dev") | Simpler code, no service role setup | Webhooks fail because RLS blocks unauthenticated writes | Never -- webhooks require service role from the start |
| Skip household model, build money features as single-user first | Ship faster, defer multi-user complexity | Retrofitting household_id on populated money tables is a painful data migration | Acceptable ONLY if household features are explicitly deferred to v5.0+ (the project spec includes household in v4.0, so this shortcut is NOT acceptable here) |
| Use `node-cron` for background sync jobs | Works in local dev | `node-cron` does not work on Vercel serverless (no persistent process) | Never for Vercel deployment |
| Skip background job infrastructure, do sync in API routes | Simpler architecture | Timeouts on initial sync, unreliable ongoing sync | First 1-2 days of prototyping; must add Inngest/Edge Functions before any real bank connection |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Supabase + Plaid Webhook | Using `createClient()` from `lib/supabase/server.ts` (session-based, anon key) in webhook handler | Create `lib/supabase/service.ts` with `SUPABASE_SERVICE_ROLE_KEY` for server-to-server operations |
| Supabase RLS + Household Model | Writing RLS policies that check `auth.uid() = user_id` on money tables (blocks partner access) | Use `household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())` |
| Supabase Proxy Middleware + Webhook Route | Webhook route gets caught by the unauthenticated redirect in `proxy.ts`, returning 302 instead of processing | Add `/api/plaid/webhook` and `/api/internal/*` to the middleware allowlist |
| Supabase `numeric` + decimal.js | Reading `numeric` column via Supabase client and passing to `new Decimal()` -- the value is already a JS float | Store as integer cents; or read as text and parse |
| SWR + Household Shared Data | Assuming SWR cache invalidation in one browser updates another user's browser | Use Supabase Realtime for cross-user updates, or accept stale-until-focus |
| Plaid Link + Supabase Auth | Running `public_token` exchange on the client side (exposes Plaid secret) | Exchange must happen server-side in an API route; only the `link_token` goes to the client |
| Supabase + Plaid Access Token Storage | Storing access token as plain text relying on RLS for security | Use Supabase Vault or application-level AES-256-GCM encryption |
| Vercel Cron + Supabase | Using Vercel Cron to call an API route that uses session-based auth (cron requests have no session) | Cron endpoint uses service role client and verifies a cron secret header |
| Plaid Node SDK + Vercel Edge Runtime | Using Plaid SDK in an Edge Runtime route (Plaid SDK depends on Axios which does not work in Edge) | Use Node.js runtime (not Edge) for all Plaid API routes |
| Existing DB Classes + Money DB Classes | Money DB classes inheriting the `user_id`-scoping pattern from HabitsDB/TasksDB | Money DB classes use `household_id` scoping with a separate `resolveHousehold()` utility |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Loading all transactions on dashboard page load | Dashboard load time goes from <1s to 5+ seconds | Separate money summary endpoint; aggregate server-side with pre-computed daily/monthly totals | 500+ transactions per household |
| OFFSET-based pagination for transaction lists | Slow page loads as user accumulates months of data | Cursor-based (keyset) pagination with composite index on `(household_id, date, transaction_id)` | 10K+ transactions per household (~6 months of active accounts) |
| SWR refetching money + habit data on every focus event | Excessive API calls on tab switch; Plaid rate limits hit | Separate SWR hooks for money vs habits; longer `dedupingInterval` for money data (30s vs default 2s) | Multiple browser tabs open |
| N+1 queries for transaction + account + category joins | API response times degrade linearly with transaction count | Eager-load via JOINs or batch queries in the DB layer | 100+ transactions per page |
| Recomputing budget progress on every budget page load | Budget page slow; DB CPU spikes | Pre-compute aggregations (daily/monthly by category) in a summary table; update on sync | 5K+ transactions per household |
| Fetching all accounts + balances on every page | Excessive Plaid API calls for balance refresh | Cache account balances with 15-30 minute TTL; refresh only on user request | 10+ connected accounts per household |
| Running money aggregation queries without household_id index | Full table scans on every money query | Composite indexes with `household_id` as leading column on all money tables | 1K+ total rows across all households |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Plaid access tokens stored as plain text in Supabase | Database breach exposes permanent read access to every user's bank accounts | Encrypt with AES-256-GCM (app-level) or use Supabase Vault |
| Webhook endpoint accepts unsigned requests | Attacker injects fake transactions, corrupts financial data | Verify Plaid JWT signature on every webhook; reject unsigned requests with 401 |
| `household_id` derived from client request parameter | Attacker changes `household_id` to access other household's finances | Always derive `household_id` from authenticated session via `household_members` table lookup |
| Service role key in client-accessible environment variable | Anyone can bypass RLS and read/write any data in the entire database | Use `SUPABASE_SERVICE_ROLE_KEY` (no `NEXT_PUBLIC_` prefix); only import in server-side files |
| Missing rate limiting on Plaid Link token creation | Attacker triggers thousands of Link sessions, running up Plaid API costs | Rate limit `/api/plaid/create-link-token` to 5-10 requests per user per hour |
| Logging financial data (transaction amounts, account numbers, balances) | Application logs become a data breach vector | Create logging middleware that redacts money amounts, account numbers, and access tokens |
| No Content Security Policy for Plaid Link iframe | XSS attack could intercept bank credentials during Plaid Link flow | Add CSP headers allowing `plaid.com` and `cdn.plaid.com` as frame sources |
| Money tables created without RLS enabled | Any authenticated user can read any household's financial data via direct Supabase API call | Enable RLS and add policies in the same migration that creates each money table |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Blocking dashboard load until money data syncs | Users who came for habits/tasks see a loading spinner because Plaid sync is slow | Load habit/task data immediately; money widgets load independently with their own loading state |
| Requiring bank connection before showing any money value | Users with bank-connection anxiety bounce during money onboarding | Allow manual transaction entry or CSV import first; bank connection is optional enhancement |
| Showing aggressive red/green colors for budget over/under | Triggers financial anxiety, contradicts "Calm Finance" philosophy | Use muted tones, forward-looking language ("$X remaining this month"), no red for overspending |
| Money features cluttering the existing habit/task sidebar | Existing users overwhelmed by new navigation items they did not ask for | Money section in sidebar is hidden until user opts into money features; progressive disclosure |
| Partner invitation requiring simultaneous onboarding | If Partner 2 does not sign up immediately, Partner 1 is stuck | Partner 1 uses money features solo; Partner 2 joins asynchronously; data merges on accept |
| Exposing raw Plaid transaction descriptions ("POS DEBIT 8923 MCDNLDS") | Ugly, unreadable text undermines trust in the product | Clean up merchant names using Plaid's enriched `merchant_name` field; fall back to cleaned `name` |
| Mixing money and habit data in notification/alert systems | Habit streak notifications interleaved with bill due dates creates confusion | Separate notification channels for habits vs money; user can opt into each independently |

## "Looks Done But Isn't" Checklist

- [ ] **Household RLS:** Often missing the `household_members` lookup in RLS policies -- verify by logging in as Partner B and confirming they see Partner A's shared transactions
- [ ] **Webhook security:** Often missing JWT signature verification -- verify by sending an unsigned POST to `/api/plaid/webhook` and confirming it returns 401
- [ ] **Proxy middleware allowlist:** Often missing webhook route -- verify Plaid webhook does not get 302 redirect to `/auth/login`
- [ ] **Service role client isolation:** Often the service role key leaks into client bundles -- verify `SUPABASE_SERVICE_ROLE_KEY` does NOT appear in the browser's network tab or JS bundles
- [ ] **Money amount precision:** Often tested with round numbers only -- verify calculations with `$10.33 + $5.67 = $16.00` and `$0.10 + $0.20 = $0.30` using actual database round-trip
- [ ] **Plaid reconnection flow:** Often missing `ITEM_LOGIN_REQUIRED` handling -- verify by simulating a broken connection and confirming Update Mode Link launches
- [ ] **Transaction sync cursor persistence:** Often missing cursor storage after interrupted sync -- verify by killing the sync process mid-way and confirming the next sync resumes (not restarts)
- [ ] **Existing features unbroken:** Often money migrations break habit/task features -- verify ALL existing 1207+ tests pass after money schema migration
- [ ] **Background sync on Vercel:** Often using `node-cron` which does not work on serverless -- verify transaction sync works on deployed Vercel (not just `pnpm dev`)
- [ ] **i18n for money strings:** Often forgetting to add translations for all three locales -- verify money UI strings exist in en.json, zh.json, zh-TW.json
- [ ] **Supabase type generation:** Often `numeric` columns generate as `number` type -- verify money column types are `integer` (cents) and TypeScript types reflect this
- [ ] **Dashboard independence:** Often money loading blocks habit display -- verify dashboard loads habits instantly even when Plaid API is down

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Plain-text access tokens in database | HIGH | Generate encryption key, write migration to encrypt all existing tokens in-place, update all read/write code paths simultaneously, rotate any tokens that may have been exposed via Plaid dashboard |
| `numeric` money columns instead of integer cents | HIGH | Write migration to convert all money columns from `numeric` to `integer` (multiply by 100, round), update every query and display formatter, re-validate all budget/spending calculations |
| Missing household RLS policies | HIGH | Add RLS policies to all money tables, run audit query to check for any cross-household data reads in access logs, notify users if leakage found |
| Money data mixed into existing dashboard API | MEDIUM | Create new `/api/money/dashboard` endpoint, update frontend to use separate SWR hook, remove money fields from existing `/api/dashboard` response, update tests |
| Webhook endpoint with no auth | MEDIUM | Add Plaid JWT verification immediately, audit webhook logs for suspicious payloads, re-sync all Items to ensure no fake transactions were injected |
| Background sync failing on Vercel | MEDIUM | Add Inngest or Supabase Edge Functions, implement manual "Refresh" button as immediate workaround, re-sync all Items with cursor reset |
| Household_id added to profiles table | HIGH | Remove column, create separate `household_members` table, write backfill migration to move data, update `handle_new_user` trigger if modified, re-run all profile tests |
| SWR cache showing stale partner data | LOW | Add `revalidateOnFocus: true` (default), add manual refresh button, consider Supabase Realtime subscription for cross-user updates |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Household model breaks existing RLS | Phase 1 (Database Schema) | Create money tables with RLS; run ALL existing 1207+ tests to verify habit/task features unaffected; test two-user household data visibility |
| Supabase numeric precision loss | Phase 1 (Database Schema) | Money columns use `integer` (cents); unit test with `$10.33`, `$0.07`, `$19.99` round-trip through Supabase client |
| Plaid webhook bypasses Supabase auth | Phase 2 (Plaid Integration) | Webhook endpoint uses service role client; unsigned requests return 401; middleware does not redirect webhook |
| SWR cache collision money/habits | Phase 1 (Architecture) | Money endpoints completely separate from habit endpoints; dashboard page uses multiple independent SWR hooks |
| DB class pattern lacks household scoping | Phase 1 (Database Schema + Auth) | `resolveHousehold()` utility created; money API routes never accept `household_id` from client; cross-household access test fails correctly |
| Plaid access token encryption | Phase 2 (Plaid Integration) | Token column named `encrypted_access_token`; `PLAID_ENCRYPTION_KEY` env var exists; token unreadable in Supabase SQL Editor |
| Vercel serverless timeout on initial sync | Phase 2 (Plaid Integration) | Background job infrastructure (Inngest/Edge Functions) handles sync; API route returns immediately; sync completes for accounts with 1000+ transactions |
| `household_id` on profiles table | Phase 1 (Database Schema) | No `household_id` column on `profiles` table; `handle_new_user` trigger unchanged; separate `household_members` table exists |
| AI insights generating financial advice | Phase 5 (AI Insights) | All insight text reviewed for advisory language; rule-based insights implemented first; legal disclaimer present |

## Sources

### Primary (HIGH confidence)
- [Supabase Row Level Security (Official Docs)](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase API Keys (Official Docs)](https://supabase.com/docs/guides/api/api-keys)
- [Supabase Vault (Official Docs)](https://supabase.com/docs/guides/database/vault)
- [Supabase `numeric` type precision issue (GitHub supabase/cli#582)](https://github.com/supabase/cli/issues/582)
- [Plaid Node SDK Edge Runtime limitation (GitHub plaid/plaid-node#604)](https://github.com/plaid/plaid-node/issues/604)
- [Plaid Webhook Verification (Official Docs)](https://plaid.com/docs/api/webhooks/webhook-verification/)
- [Plaid Transactions Sync (Official Docs)](https://plaid.com/docs/transactions/sync-migration/)
- [Vercel Serverless Function Timeout (Knowledge Base)](https://vercel.com/kb/guide/what-can-i-do-about-vercel-serverless-functions-timing-out)
- [Vercel Cold Start Performance (Knowledge Base)](https://vercel.com/kb/guide/how-can-i-improve-serverless-function-lambda-cold-start-performance-on-vercel)
- BetterR.Me codebase analysis: `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/proxy.ts`, `lib/db/types.ts`, `lib/db/habits.ts`, `app/api/tasks/route.ts`, `app/api/dashboard/route.ts`, `supabase/migrations/20260129_initial_schema.sql`, all existing RLS policies

### Secondary (MEDIUM confidence)
- [Supabase RLS Complete Guide 2026 (DesignRevision)](https://designrevision.com/blog/supabase-row-level-security)
- [Multi-Tenant Applications with RLS on Supabase (AntStack)](https://www.antstack.com/blog/multi-tenant-applications-with-rls-on-supabase-postgress/)
- [Supabase Best Practices (Leanware)](https://www.leanware.co/insights/supabase-best-practices)
- [SWR Mutation & Revalidation (Official Docs)](https://swr.vercel.app/docs/mutation)
- [SWR Cache (Official Docs)](https://swr.vercel.app/docs/advanced/cache)
- [Plaid Integration with Next.js 14 Step-by-Step (Medium)](https://medium.com/@nazardubovyk/step-by-step-guide-to-integrate-plaid-with-next-js-14-app-router-356b547b5a4a)

### Tertiary (inherited from moneyy.me research, HIGH confidence)
- [Plaid Transactions Troubleshooting (Official)](https://plaid.com/docs/transactions/troubleshooting/)
- [Plaid Link Update Mode (Official)](https://plaid.com/docs/link/update-mode/)
- [Plaid AI-Enhanced Categorization (Official Blog)](https://plaid.com/blog/ai-enhanced-transaction-categorization/)
- [AWS Multi-Tenant Data Isolation with PostgreSQL RLS](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/)
- [GitGuardian: Remediating Plaid Access Token Leaks](https://www.gitguardian.com/remediation/plaid-access-token)
- Full moneyy.me pitfalls research: `/home/xingdi/code/moneyy_me/.planning/research/PITFALLS.md`

---
*Pitfalls research for: Adding money tracking to BetterR.Me (v4.0)*
*Researched: 2026-02-21*
