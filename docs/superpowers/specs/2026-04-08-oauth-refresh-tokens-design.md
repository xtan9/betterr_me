# OAuth Refresh Token Flow — Design Spec

**Date:** 2026-04-08
**Goal:** Replace the current non-expiring MCP access token with a proper short-lived access token + rotating refresh token flow, suitable for an enterprise product.

## Overview

The current OAuth flow issues a JWT access token that claims a 24-hour lifetime (`expires_in: 86400`) but actually never expires (no `exp` claim). There is no refresh token. MCP clients (e.g., Claude Code) must re-authenticate daily when the `expires_in` window passes.

This spec adds:
1. A real `exp` claim on access tokens (1 hour)
2. A refresh token issued alongside the access token (180 days, opaque, stored hashed)
3. A `grant_type=refresh_token` flow with token rotation and reuse detection
4. Opportunistic cleanup of expired/revoked tokens

## Token Lifetimes

| Token | Lifetime | Storage |
|-------|----------|---------|
| Access token (JWT) | 1 hour | Stateless (client-side) |
| Refresh token (opaque) | 180 days (6 months) | Hashed in `oauth_refresh_tokens` table |
| Authorization code | 5 minutes (unchanged) | Hashed in `oauth_codes` table |

## Database: `oauth_refresh_tokens` Table

```sql
CREATE TABLE oauth_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scopes TEXT[] NOT NULL DEFAULT '{read,write}',
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT false,
  replaced_by_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_user ON oauth_refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_expires ON oauth_refresh_tokens (expires_at);
```

- RLS enabled, no policies (service-role only, matches `oauth_codes` pattern)
- `replaced_by_hash` points to the rotated replacement token for reuse detection
- `scopes` column is a future-proofing placeholder — not enforced yet, defaults to `{read,write}`

## Access Token: Add `exp` Claim

**File:** `lib/mcp/token.ts`

`signMcpToken(userId)` payload changes:

```ts
{
  sub: userId,
  aud: "mcp",
  iat: now,
  exp: now + 3600  // 1 hour
}
```

`verifyMcpToken(token)` already validates `exp` when present (backwards-compatible). New tokens enforce the 1-hour window. Old non-expiring tokens continue to work (no `exp` = no check).

## Refresh Token Issuance (Authorization Code Exchange)

**File:** `app/api/oauth/token/route.ts`

When `grant_type=authorization_code` succeeds, additionally:

1. Generate refresh token: `crypto.randomBytes(48).toString("hex")` (96 chars)
2. Hash: `crypto.createHash("sha256").update(token).digest("hex")`
3. Insert into `oauth_refresh_tokens`: `{ token_hash, user_id, expires_at: now + 180 days }`
4. Return in response:

```json
{
  "access_token": "<jwt>",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "<opaque-96-char-string>"
}
```

## Refresh Token Exchange

**File:** `app/api/oauth/token/route.ts` — new `grant_type=refresh_token` branch

**Request:**
```
POST /api/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&refresh_token=<opaque-token>
```

**Flow:**
1. Hash the incoming refresh token
2. Query `oauth_refresh_tokens` where `token_hash` matches
3. If not found → 401 `"Invalid refresh token"`
4. If `revoked=true` or `expires_at < now` → 401 `"Refresh token expired or revoked"`
5. If `replaced_by_hash` is set → **reuse detected**: revoke ALL tokens for this `user_id`, return 401 `"Token reuse detected — all sessions revoked"`
6. If valid:
   - Generate new refresh token → hash → insert
   - Update old token: `revoked=true`, `replaced_by_hash=<new_hash>`
   - Generate new access token JWT (1-hour `exp`)
   - Return both tokens (same response format as authorization code exchange)

## Cleanup

Opportunistic cleanup at the start of the token endpoint POST handler:

```sql
DELETE FROM oauth_refresh_tokens
WHERE expires_at < now() - INTERVAL '1 day'
   OR (revoked = true AND created_at < now() - INTERVAL '7 days');
```

Revoked tokens kept for 7 days (for reuse detection audit trail), then deleted.

## OAuth Metadata Update

**File:** `app/.well-known/oauth-authorization-server/route.ts`

Add `"refresh_token"` to `grant_types_supported`:

```json
{
  "grant_types_supported": ["authorization_code", "refresh_token"]
}
```

## Scope Enforcement

Not implemented. Scopes hardcoded to `["read", "write"]`. The `scopes` column exists in the table for future use but no enforcement logic is built.

## Access Token Revocation

Not implemented. A leaked access token is valid for at most 1 hour. Refresh token revocation (via DB) handles the long-lived credential. This is the standard industry approach (Google, GitHub).

## Files Affected

| File | Action | Change |
|------|--------|--------|
| `supabase/migrations/..._oauth_refresh_tokens.sql` | Create | New table + indexes + RLS |
| `lib/mcp/token.ts` | Modify | Add `exp` claim (1h) to JWT payload |
| `app/api/oauth/token/route.ts` | Modify | Issue refresh token, add `grant_type=refresh_token` flow, cleanup |
| `app/.well-known/oauth-authorization-server/route.ts` | Modify | Add `refresh_token` grant type |
| `CLAUDE.md` | Modify | Document token lifetimes |
| `tests/lib/mcp/token.test.ts` | Modify | Test `exp` claim |
| `tests/app/api/oauth/token.test.ts` | Modify | Test refresh issuance, exchange, rotation, reuse detection, cleanup |

## Non-Goals

- Granular scope enforcement (future)
- Access token revocation/blocklist (1-hour window is acceptable)
- Admin UI for session management (future)
- Rate limiting on refresh endpoint (future, can add when needed)
