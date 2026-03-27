# Hosted MCP Server with OAuth on BetterR.Me

## Goal

Host the MCP server on BetterR.Me itself (Vercel/Next.js) so users connect with a single command — `claude mcp add --transport http betterrme https://betterr.me/api/mcp` — and authenticate via browser-based OAuth. No npm install, no API keys, no env vars.

## User Experience

```
claude mcp add --transport http betterrme https://betterr.me/api/mcp
→ Claude Code opens browser → user logs into BetterR.Me
→ Redirected back → connected. Done.
```

Any BetterR.Me user can connect. Full access to all features.

## Architecture

### 1. OAuth Server

Standard OAuth 2.0 authorization code flow, wrapping Supabase auth.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/oauth/authorize` | GET | Shows login or redirects to Supabase auth; returns authorization code via redirect |
| `/api/oauth/token` | POST | Exchanges authorization code for access token (signed JWT) |
| `/.well-known/oauth-authorization-server` | GET | OAuth server metadata discovery |
| `/.well-known/oauth-protected-resource` | GET | Tells MCP clients where to find the auth server |

### 2. MCP Handler

Hosted as a Next.js API route using `mcp-handler` package.

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/mcp/[transport]` | GET, POST | MCP Streamable HTTP endpoint |

Wrapped with `withMcpAuth` for bearer token verification. The `verifyToken` function decodes the JWT to extract `user_id`.

### 3. Tools

All tools run inside the app — they query Supabase directly (service-role client scoped to the authenticated user), not through HTTP API routes. This means full access to all features, not just the subset that was migrated to `authenticateRequest`.

Tools:

| Tool | Description |
|------|-------------|
| `list-projects` | List all projects (filterable by section/status) |
| `get-project-tasks` | Get tasks for a project (filterable by status/priority) |
| `get-task` | Get full details of a single task |
| `create-task` | Create a new task in a project |
| `update-task` | Update task fields (status, title, priority, etc.) |
| `delete-task` | Permanently delete a task |

Additional tools can be added later for habits, journal, money, etc.

## OAuth Flow

```
Claude Code                    BetterR.Me                    Supabase
    │                              │                              │
    ├─ GET /.well-known/           │                              │
    │  oauth-protected-resource ──►│                              │
    │◄── { auth_server URLs }      │                              │
    │                              │                              │
    ├─ GET /.well-known/           │                              │
    │  oauth-authorization-server ►│                              │
    │◄── { authorize, token URLs } │                              │
    │                              │                              │
    ├─ Opens browser ──────────────┤                              │
    │  /api/oauth/authorize?       │                              │
    │   client_id=...&             │                              │
    │   redirect_uri=...&          │                              │
    │   code_challenge=...&        │                              │
    │   state=...                  │                              │
    │                              ├─ Check Supabase session ────►│
    │                              │  (or show login page)        │
    │                              │◄── user authenticated ───────┤
    │                              │                              │
    │◄── redirect to redirect_uri  │                              │
    │    with ?code=xxx&state=...  │                              │
    │                              │                              │
    ├─ POST /api/oauth/token ─────►│                              │
    │   grant_type=authorization_code                              │
    │   code=xxx                   │                              │
    │   code_verifier=...          │                              │
    │◄── { access_token: JWT,      │                              │
    │      token_type: bearer,     │                              │
    │      expires_in: 86400 }     │                              │
    │                              │                              │
    ├─ POST /api/mcp/sse ─────────►│  (with Bearer JWT)           │
    │   (MCP protocol messages)    ├─ Verify JWT → user_id ──────►│
    │◄── tool results              │◄── query as user ────────────┤
```

## OAuth Endpoints Detail

### `GET /api/oauth/authorize`

Query params (per OAuth 2.0 + PKCE):
- `client_id` — any string (we don't register clients, MCP is public)
- `redirect_uri` — where to redirect after auth. **Must match the allowlist**: only `http://localhost:*` patterns are accepted (Claude Code uses localhost callbacks). Reject all other redirect URIs with 400.
- `response_type` — must be `code`
- `state` — opaque value passed through for CSRF protection. **Must be present and non-empty** — reject with 400 if missing.
- `code_challenge` — PKCE challenge
- `code_challenge_method` — must be `S256`
- `scope` — optional, ignored (full access for all users)

Behavior:
1. Validate `redirect_uri` against allowlist (`http://localhost:*`). Reject if not matching.
2. Validate `state` is present and non-empty. Reject if missing.
3. Check if user has an active Supabase session (cookie)
4. If yes → generate authorization code, hash it (SHA-256) for storage, store the hash (with user_id, code_challenge, redirect_uri, expiry) in `oauth_codes`, redirect to `redirect_uri?code=xxx&state=yyy`
5. If no → redirect to `/auth/login?returnTo=/api/oauth/authorize?...` (user logs in, then gets redirected back to authorize)

### `POST /api/oauth/token`

Body params:
- `grant_type` — must be `authorization_code`
- `code` — the authorization code from the authorize step
- `code_verifier` — PKCE verifier (verified against stored code_challenge)
- `redirect_uri` — must match the one from the authorize step

Response:
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "expires_in": 86400
}
```

### `GET /.well-known/oauth-authorization-server`

Returns:
```json
{
  "issuer": "https://betterr.me",
  "authorization_endpoint": "https://betterr.me/api/oauth/authorize",
  "token_endpoint": "https://betterr.me/api/oauth/token",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none"]
}
```

### `GET /.well-known/oauth-protected-resource`

Uses `protectedResourceHandler` from `mcp-handler`:
```json
{
  "resource": "https://betterr.me",
  "authorization_servers": ["https://betterr.me"]
}
```

## Token Design

The access token is a signed JWT using `API_KEY_HMAC_SECRET` (already exists in env):

```json
{
  "sub": "user-uuid",
  "aud": "mcp",
  "iat": 1234567890,
  "exp": 1234654290
}
```

- Algorithm: HS256 (HMAC-SHA-256)
- Expiry: 24 hours
- `aud: "mcp"` — prevents token reuse across different auth systems (API keys use HMAC on the key itself, not JWTs)
- No refresh tokens — Claude Code re-auths when expired (the flow is fast)
- Signed with `API_KEY_HMAC_SECRET` env var (reuses existing secret)

**Token verification** in `verifyMcpToken` must check: signature, expiry, `aud === "mcp"`, and that `sub` (user_id) still exists in the `profiles` table. The user-exists check prevents deleted accounts from using tokens for up to 24h.

**Accepted tradeoff:** No token revocation. If a user changes their password, existing MCP tokens remain valid until expiry. This is acceptable for a 24h window.

Verification in `verifyToken`: decode JWT, check signature, check expiry, extract `sub` as `user_id`.

## Authorization Code Storage

Authorization codes are short-lived (5 minutes) and single-use. Storage options:

Use an `oauth_codes` table in Supabase:

| Column | Type | Description |
|--------|------|-------------|
| `code_hash` | TEXT | SHA-256 hash of the authorization code (never store plaintext) |
| `user_id` | UUID | The authenticated user |
| `code_challenge` | TEXT | PKCE S256 challenge |
| `redirect_uri` | TEXT | Must match on token exchange |
| `expires_at` | TIMESTAMPTZ | 5 minutes from creation |
| `used` | BOOLEAN | Single-use flag |

Cleaned up periodically (expired codes deleted). No RLS needed — only accessed by server-side code via service-role client.

## MCP Handler

Uses `mcp-handler` package with `withMcpAuth`:

```typescript
// app/api/mcp/[transport]/route.ts
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerTools } from "@/lib/mcp/tools";
import { verifyMcpToken } from "@/lib/mcp/token";

const handler = createMcpHandler((server) => {
  registerTools(server);
});

const authHandler = withMcpAuth(handler, verifyMcpToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { authHandler as GET, authHandler as POST };
```

The `verifyMcpToken` function:
1. Decodes the JWT bearer token
2. Verifies signature with `API_KEY_HMAC_SECRET`
3. Checks expiry
4. Returns `AuthInfo` with `userId` in `extra`

Tool implementations use a service-role Supabase client, scoped by `user_id` from the token (same pattern as API key auth).

## Tool Implementations

Tools query Supabase directly (not through API routes):

```typescript
// lib/mcp/tools.ts
import { createClient } from "@supabase/supabase-js";

// Module-level singleton — service-role client is stateless (no per-request cookies).
// This is different from the SSR client in lib/supabase/server.ts which must be per-request.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Inside each tool handler, get userId from extra.authInfo:
const userId = extra.authInfo?.extra?.userId;
const supabase = getServiceClient();
const { data } = await supabase
  .from("tasks")
  .select("*")
  .eq("user_id", userId);
```

## New Dependencies

- `mcp-handler` — Vercel's MCP adapter for Next.js (handles HTTP transport + auth wrapping)

No `jsonwebtoken` needed — use Node.js native `crypto.subtle` for JWT signing/verification.

## File Structure

```
app/
  api/
    mcp/
      [transport]/route.ts        ← MCP handler + auth
    oauth/
      authorize/route.ts          ← OAuth authorization endpoint
      token/route.ts              ← OAuth token endpoint
  .well-known/
    oauth-authorization-server/route.ts
    oauth-protected-resource/route.ts
lib/
  mcp/
    tools.ts                      ← tool definitions
    token.ts                      ← JWT sign/verify helpers
supabase/
  migrations/
    XXXXXX_create_oauth_codes_table.sql
```

## Migration

New `oauth_codes` table:

```sql
CREATE TABLE oauth_codes (
  code_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code_challenge TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_oauth_codes_expires ON oauth_codes (expires_at);
```

No RLS — accessed only via service-role client.

**Cleanup:** Expired codes are deleted lazily — before inserting a new code, delete all rows where `expires_at < now()`. No cron job needed.

## What Gets Deprecated

- `betterrme-mcp` npm package — README updated to point to `claude mcp add --transport http betterrme https://betterr.me/api/mcp`
- The MCP config in `~/.claude.json` with env vars — replaced by the single URL

## What Stays

- API key auth — still works for scripts, curl, non-MCP integrations
- All existing API routes — unchanged
- The `authenticateRequest` helper — unchanged

## Security Considerations

- PKCE (S256) required — prevents authorization code interception
- Authorization codes are single-use and expire in 5 minutes
- JWT access tokens expire in 24 hours
- JWT signed with `API_KEY_HMAC_SECRET` (existing secret, never exposed)
- No client secrets — MCP is a public client (like a mobile app)
- Service-role client used for DB queries, scoped by `user_id` from JWT
- `oauth_codes` table has no RLS (only server-side access)

## Testing

- Unit tests for JWT sign/verify (`lib/mcp/token.ts`)
- Unit tests for OAuth endpoints (authorize, token exchange, PKCE verification)
- Integration test: full OAuth flow (authorize → token → MCP tool call)
- Test expired codes, used codes, wrong code_verifier, wrong redirect_uri
