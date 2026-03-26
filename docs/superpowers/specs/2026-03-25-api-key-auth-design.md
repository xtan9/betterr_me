# API Key Authentication for BetterR.Me

## Goal

Add personal API key authentication so external tools (like the betterrme-mcp server) can access BetterR.Me API routes without storing user passwords. Keys support two permission levels: read-only and read-write, with per-feature scoping planned for a future iteration.

## Database

New `api_keys` table:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key, default gen_random_uuid() |
| `user_id` | UUID | FK to profiles, ON DELETE CASCADE |
| `name` | TEXT | User-given label (e.g., "Claude Code"), max 50 chars |
| `key_hash` | TEXT | HMAC-SHA-256 hash of the full key (using server-side secret) |
| `key_prefix` | TEXT | First 12 chars for display (e.g., `brm_a1b2c3d4`) |
| `permissions` | TEXT | `read` or `read_write`, default `read_write` |
| `expires_at` | TIMESTAMPTZ | Optional expiry date, nullable (null = never expires) |
| `last_used_at` | TIMESTAMPTZ | Updated on each use, nullable |
| `created_at` | TIMESTAMPTZ | default now() |

Indexes:
- `idx_api_keys_key_hash` on `key_hash` (unique) — for fast lookup during auth
- `idx_api_keys_user_id` on `user_id` — for listing user's keys

RLS policies: users can SELECT, INSERT, DELETE their own keys only. No UPDATE — `last_used_at` is updated via a fire-and-forget async call using the service-role client during authentication (non-blocking, errors logged but not thrown).

## Key Format

- Format: `brm_` + 32 random hex characters = 36 characters total
- Example: `brm_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6`
- Random bytes MUST be generated via `crypto.randomBytes(16)` (Node.js) — never `Math.random()`
- The full key is shown exactly once at creation time
- The `key_prefix` stores the first 12 chars (e.g., `brm_a1b2c3d4`) — 8 random hex chars = ~4 billion values, sufficient to distinguish keys visually
- The `key_hash` is an HMAC-SHA-256 of the full key using a server-side secret (`API_KEY_HMAC_SECRET` env var). This means a database leak alone cannot be used to verify keys without the server secret.

## Auth Flow

### Current Flow (unchanged for browser users)

```
Request → createClient() → supabase.auth.getUser() → user or 401
```

### New Flow (API key + fallback to cookies)

```
Request arrives
  → Has "Authorization: Bearer brm_xxx" header?
    → Yes (API key takes precedence over any cookies present):
      → HMAC-SHA-256 hash the key with server secret
      → Look up api_keys by key_hash
      → Found:
        → Check expires_at — if expired, return 401
        → Check permissions vs HTTP method → return user_id or 403
        → Fire-and-forget: update last_used_at (async, non-blocking)
      → Not found: return 401
    → No: fall back to existing createClient() + getUser() cookie auth
```

**Precedence rule:** If both an `Authorization: Bearer` header and session cookies are present, the API key path is used and cookies are ignored.

### Implementation

A new helper function `authenticateRequest(request)` encapsulates this logic:

```typescript
// lib/auth/api-key.ts
async function authenticateRequest(request: NextRequest): Promise<{
  userId: string;
  permissions: 'read' | 'read_write';
  supabase: SupabaseClient;
} | null>
```

- Returns `userId`, `permissions`, and a Supabase client
- **For API key auth:** returns a service-role client. IMPORTANT: all DB classes already filter by `user_id` in every query (enforced by the existing `userId` parameter pattern). The service-role client bypasses RLS but the application-level filtering remains. This is an acceptable trade-off — RLS provides defense-in-depth, but the primary access control is the `user_id` filter in every DB method.
- **For cookie auth:** returns the user's session client (RLS enforced as before). Permissions default to `read_write`.
- API routes call this instead of the current `createClient() + getUser()` pattern

### Permission Enforcement

- `read` keys: only `GET` requests succeed. `POST`, `PATCH`, `DELETE` return 403 Forbidden.
- `read_write` keys: all HTTP methods allowed.
- Enforcement happens in `authenticateRequest` — routes don't need to check permissions individually.

## API Routes

### Important: `/api/api-keys` routes are cookie-auth ONLY

The API key management routes (`/api/api-keys`) do NOT accept API key authentication — only cookie session auth. This prevents a compromised key from creating or revoking other keys (privilege escalation). These routes continue to use the existing `createClient() + getUser()` pattern directly.

### `GET /api/api-keys`

Returns the user's API keys (never the full key or hash):

```json
{
  "keys": [
    {
      "id": "uuid",
      "name": "Claude Code",
      "key_prefix": "brm_a1b2c3d4",
      "permissions": "read_write",
      "expires_at": null,
      "last_used_at": "2026-03-25T10:00:00Z",
      "created_at": "2026-03-25T09:00:00Z"
    }
  ]
}
```

### `POST /api/api-keys`

Creates a new key. Request body:

```json
{
  "name": "Claude Code",
  "permissions": "read_write",
  "expires_at": null
}
```

Response (201):

```json
{
  "key": {
    "id": "uuid",
    "name": "Claude Code",
    "key_prefix": "brm_a1b2c3d4",
    "permissions": "read_write",
    "expires_at": null,
    "full_key": "brm_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
    "created_at": "2026-03-25T09:00:00Z"
  }
}
```

`full_key` is returned only in this response, never again.

Validation:
- `name`: 1-50 chars, trimmed
- `permissions`: `read` or `read_write`
- `expires_at`: optional ISO 8601 datetime, must be in the future if provided
- Max 10 keys per user (prevent abuse)

### `DELETE /api/api-keys/[id]`

Revokes (deletes) a key. Returns `{ success: true }`.

## Migration Strategy

### Which routes to migrate

Only routes that the MCP server needs are migrated to use `authenticateRequest()` in the initial rollout:

- `/api/tasks` (GET, POST)
- `/api/tasks/[id]` (GET, PATCH, DELETE)
- `/api/tasks/[id]/toggle` (GET)
- `/api/projects` (GET, POST)
- `/api/projects/[id]` (GET, PATCH, DELETE)

### Routes explicitly excluded from API key auth

These routes MUST NOT accept API key authentication:

- `/api/api-keys/**` — cookie-only (see above)
- `/api/money/plaid/webhook` — uses its own Plaid signature verification
- All other routes — remain cookie-only until explicitly migrated

### Migration pattern per route

```typescript
// Before:
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

// After:
const auth = await authenticateRequest(request);
if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
const { userId, supabase } = auth;
```

Routes continue to pass `userId` to DB classes as before — no other changes needed.

## UI

New "API Keys" section added to the existing `/dashboard/settings` page:

### Components

- **ApiKeysSection** — container with heading, description, key list, and create button
- **ApiKeyCreateDialog** — dialog with name input, permissions toggle (read-only / read-write), optional expiry date picker, create button
- **ApiKeyCreatedDialog** — shows the full key once with copy button and warning
- **ApiKeyRow** — displays name, prefix, permissions badge, expiry, last used date, delete button with confirmation

### Behavior

1. Settings page loads → fetches `GET /api/api-keys` via SWR
2. User clicks "Create API Key" → ApiKeyCreateDialog opens
3. User enters name, selects permissions, optionally sets expiry, clicks Create → `POST /api/api-keys`
4. ApiKeyCreatedDialog shows full key with copy button and warning: "This key will only be shown once. Copy it now."
5. User closes dialog → key list refreshes, showing only prefix
6. User clicks delete on a key → confirmation dialog → `DELETE /api/api-keys/[id]` → list refreshes

### i18n

New translation keys added to all three locales (en, zh, zh-TW) for:
- Section title, description
- Create dialog labels
- Permission labels
- Expiry labels
- Warning messages
- Delete confirmation

## MCP Server Update (betterrme-mcp)

The MCP server changes from direct Supabase access to calling BetterR.Me API routes:

### Before

```
env: SUPABASE_URL, SUPABASE_ANON_KEY, BETTERRME_EMAIL, BETTERRME_PASSWORD
→ supabase.auth.signInWithPassword()
→ supabase.from('tasks').select(...)
```

### After

```
env: BETTERRME_URL (app URL), BETTERRME_API_KEY
→ fetch('https://betterr.me/api/tasks', { headers: { Authorization: 'Bearer brm_xxx' } })
```

- Simpler: 2 env vars instead of 4
- Safer: no password stored
- Revocable: user can delete the key anytime

### Config change

```json
{
  "mcpServers": {
    "betterrme": {
      "command": "npx",
      "args": ["-y", "betterrme-mcp"],
      "env": {
        "BETTERRME_URL": "https://betterr.me",
        "BETTERRME_API_KEY": "brm_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
      }
    }
  }
}
```

## Environment Variables

New env vars required on the server:

| Variable | Purpose |
|----------|---------|
| `API_KEY_HMAC_SECRET` | Server-side secret for HMAC-SHA-256 key hashing. Generate with `openssl rand -hex 32`. Required in production. |

## Security Considerations

- Keys are hashed with HMAC-SHA-256 using a server-side secret — a database leak alone cannot verify keys
- Key bytes generated via `crypto.randomBytes()` (CSPRNG) — 128 bits of entropy
- Full key shown once at creation only
- Keys are scoped to a single user; DB classes enforce user_id filtering on every query
- API key management routes are cookie-auth only — a compromised key cannot create/revoke other keys
- `last_used_at` tracking helps users identify stale keys
- Optional `expires_at` for time-limited keys
- Max 10 keys per user prevents abuse
- Rate limiting: deferred — the 128-bit key entropy makes brute-force infeasible. If needed later, add rate limiting at the middleware/CDN layer.

## Testing

- Unit tests for `authenticateRequest` helper (API key path + cookie fallback + both present)
- Unit tests for API key generation (format, CSPRNG, HMAC hashing)
- Unit tests for permission enforcement (read vs read_write, expired keys)
- Unit tests for precedence (API key header wins over cookies)
- API route tests for `/api/api-keys` CRUD (cookie-only enforcement)
- API route tests for migrated task/project routes (API key + cookie paths)
- Component tests for settings UI (create, list, delete flows)
