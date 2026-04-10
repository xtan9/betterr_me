# OAuth Refresh Token Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add rotating refresh tokens and short-lived access tokens to the MCP OAuth flow.

**Architecture:** Access tokens become 1-hour JWTs with an `exp` claim. A new `oauth_refresh_tokens` table stores hashed refresh tokens (180-day lifetime). The `/api/oauth/token` endpoint gains a `grant_type=refresh_token` flow with token rotation and reuse detection. Old non-expiring tokens remain backwards-compatible.

**Tech Stack:** Next.js 16, Supabase (PostgreSQL + service-role client), Node.js crypto, Vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/20260409000001_create_oauth_refresh_tokens.sql` | Create | New table + indexes + RLS |
| `lib/mcp/token.ts` | Modify | Add `exp` claim to JWT payload |
| `lib/mcp/refresh-token.ts` | Create | Generate, hash, store, validate, rotate refresh tokens |
| `app/api/oauth/token/route.ts` | Modify | Issue refresh token on auth code exchange, add `grant_type=refresh_token` flow, cleanup |
| `app/.well-known/oauth-authorization-server/route.ts` | Modify | Add `refresh_token` to grant_types_supported |
| `CLAUDE.md` | Modify | Document token lifetimes |
| `tests/lib/mcp/token.test.ts` | Modify | Test `exp` claim in JWT |
| `tests/lib/mcp/refresh-token.test.ts` | Create | Test refresh token generation, hashing, rotation |
| `tests/app/api/oauth/token.test.ts` | Modify | Test refresh issuance, exchange, rotation, reuse detection, cleanup |

---

### Task 1: Database Migration — `oauth_refresh_tokens` Table

**Files:**
- Create: `supabase/migrations/20260409000001_create_oauth_refresh_tokens.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260409000001_create_oauth_refresh_tokens.sql`:

```sql
-- OAuth refresh tokens for MCP authentication
-- Stores hashed refresh tokens with rotation tracking

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

-- Enable RLS (no policies — accessed via service-role only, matching oauth_codes pattern)
ALTER TABLE oauth_refresh_tokens ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260409000001_create_oauth_refresh_tokens.sql
git commit -m "feat(oauth): add oauth_refresh_tokens table migration"
```

---

### Task 2: Add `exp` Claim to Access Token JWT

**Files:**
- Modify: `lib/mcp/token.ts`
- Modify: `tests/lib/mcp/token.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/lib/mcp/token.test.ts`, update the existing test `'payload contains sub, aud:"mcp", iat — no exp'` and add a new test:

Replace the existing test at line 42-51:

```ts
  it('payload contains sub, aud:"mcp", iat, and exp (1 hour)', async () => {
    const token = await signMcpToken('user-abc');
    const payloadB64 = token.split('.')[1];
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

    expect(payload.sub).toBe('user-abc');
    expect(payload.aud).toBe('mcp');
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
    expect(payload.exp - payload.iat).toBe(3600); // 1 hour
  });
```

Add a new test after the existing `'token without exp is accepted (non-expiring)'` test:

```ts
  it('token with valid exp is accepted', async () => {
    const token = await signMcpToken('user-123');
    const result = await verifyMcpToken(token);
    expect(result).toEqual({ userId: 'user-123' });
  });

  it('token with expired exp returns null', async () => {
    const token = await signMcpToken('user-123');

    // Move time forward 2 hours — past the 1-hour exp
    const originalNow = Date.now;
    Date.now = () => originalNow() + 2 * 60 * 60 * 1000;

    const result = await verifyMcpToken(token);
    Date.now = originalNow;

    expect(result).toBeNull();
  });
```

Also update the existing test `'token without exp is accepted (non-expiring)'` — rename it to make clear it's for backwards-compat with legacy tokens:

```ts
  it('legacy token without exp is accepted (backwards-compat)', async () => {
    // Manually craft a token WITHOUT exp (old format)
    const crypto = await import('node:crypto');
    const secret = process.env.API_KEY_HMAC_SECRET!;

    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(
      JSON.stringify({ sub: 'user-123', aud: 'mcp', iat: now }),
    ).toString('base64url');
    const data = `${header}.${payload}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest()
      .toString('base64url');
    const token = `${data}.${signature}`;

    const result = await verifyMcpToken(token);
    expect(result).toEqual({ userId: 'user-123' });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/mcp/token.test.ts`
Expected: FAIL — `payload.exp` is undefined (not yet added)

- [ ] **Step 3: Add `exp` claim to `signMcpToken`**

In `lib/mcp/token.ts`, modify the `signMcpToken` function. Change the payload section (around lines 60-68):

From:
```ts
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(
    JSON.stringify({
      sub: userId,
      aud: "mcp",
      iat: now,
    }),
  );
```

To:
```ts
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(
    JSON.stringify({
      sub: userId,
      aud: "mcp",
      iat: now,
      exp: now + 3600, // 1 hour
    }),
  );
```

Also update the JSDoc comment (around lines 45-52):
From:
```ts
 * - no `exp` — tokens do not expire
```
To:
```ts
 * - `exp`  = iat + 3600 (1 hour)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/mcp/token.test.ts`
Expected: PASS

- [ ] **Step 5: Run lint**

Run: `pnpm lint`

- [ ] **Step 6: Commit**

```bash
git add lib/mcp/token.ts tests/lib/mcp/token.test.ts
git commit -m "feat(oauth): add 1-hour exp claim to MCP access token JWT"
```

---

### Task 3: Refresh Token Utility Module

**Files:**
- Create: `lib/mcp/refresh-token.ts`
- Create: `tests/lib/mcp/refresh-token.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/mcp/refresh-token.test.ts`:

```ts
// @vitest-environment node
import crypto from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// Mock Supabase — needs insert, select with chaining, update, delete
const mockSingle = vi.fn();
const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
const mockEq3 = vi.fn().mockReturnValue({ select: mockSelect });
const mockEq2 = vi.fn().mockReturnValue({ eq: mockEq3 });
const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 });
const mockInsert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: mockSingle }) });
const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 });
const mockLt = vi.fn().mockResolvedValue({ error: null });
const mockOr = vi.fn().mockReturnValue({ lt: mockLt });
const mockDelete = vi.fn().mockReturnValue({ or: mockOr });

const mockFrom = vi.fn().mockReturnValue({
  insert: mockInsert,
  select: mockSelect,
  update: mockUpdate,
  delete: mockDelete,
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}));

import {
  generateRefreshToken,
  hashToken,
  REFRESH_TOKEN_EXPIRY_DAYS,
} from '@/lib/mcp/refresh-token';

describe('refresh-token utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generateRefreshToken returns a 96-character hex string', () => {
    const token = generateRefreshToken();
    expect(token).toHaveLength(96);
    expect(/^[a-f0-9]+$/.test(token)).toBe(true);
  });

  it('hashToken returns SHA-256 hex digest', () => {
    const token = 'test-token';
    const expected = crypto.createHash('sha256').update(token).digest('hex');
    expect(hashToken(token)).toBe(expected);
  });

  it('two calls to generateRefreshToken produce different tokens', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
  });

  it('REFRESH_TOKEN_EXPIRY_DAYS is 180', () => {
    expect(REFRESH_TOKEN_EXPIRY_DAYS).toBe(180);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/mcp/refresh-token.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

Create `lib/mcp/refresh-token.ts`:

```ts
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const REFRESH_TOKEN_EXPIRY_DAYS = 180;

// ---------------------------------------------------------------------------
// Token generation & hashing
// ---------------------------------------------------------------------------

/** Generate a cryptographically random refresh token (96-char hex string). */
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

/** SHA-256 hash of a token string (hex digest). */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/mcp/refresh-token.test.ts`
Expected: PASS

- [ ] **Step 5: Run lint**

Run: `pnpm lint`

- [ ] **Step 6: Commit**

```bash
git add lib/mcp/refresh-token.ts tests/lib/mcp/refresh-token.test.ts
git commit -m "feat(oauth): add refresh token utility module"
```

---

### Task 4: Issue Refresh Token on Authorization Code Exchange

**Files:**
- Modify: `app/api/oauth/token/route.ts`
- Modify: `tests/app/api/oauth/token.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/app/api/oauth/token.test.ts`, update the existing `'returns access_token for valid request'` test to also check for `refresh_token` and the new `expires_in`:

```ts
  it('returns access_token and refresh_token for valid authorization_code request', async () => {
    const { code, pkce, stored } = makeStoredCode();
    mockSingle.mockResolvedValue({ data: stored, error: null });

    // Mock the refresh token insert
    const mockInsertSingle = vi.fn().mockResolvedValue({ data: { id: 'rt-1' }, error: null });
    const mockInsertSelect = vi.fn().mockReturnValue({ single: mockInsertSingle });
    mockServiceFrom.mockImplementation((table: string) => {
      if (table === 'oauth_refresh_tokens') {
        return {
          insert: vi.fn().mockReturnValue({ select: mockInsertSelect }),
          delete: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              lt: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        };
      }
      return { update: mockUpdate };
    });

    const request = makeRequest({
      grant_type: 'authorization_code',
      code,
      code_verifier: pkce.codeVerifier,
      redirect_uri: REDIRECT_URI,
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.access_token).toBe('mock-access-token');
    expect(data.token_type).toBe('bearer');
    expect(data.expires_in).toBe(3600);
    expect(typeof data.refresh_token).toBe('string');
    expect(data.refresh_token.length).toBe(96);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/app/api/oauth/token.test.ts`
Expected: FAIL — `data.refresh_token` is undefined, `data.expires_in` is 86400

- [ ] **Step 3: Implement refresh token issuance**

In `app/api/oauth/token/route.ts`:

Add imports at the top:
```ts
import {
  generateRefreshToken,
  hashToken,
  REFRESH_TOKEN_EXPIRY_DAYS,
} from "@/lib/mcp/refresh-token";
```

After the `accessToken` generation (around line 127), add refresh token creation and cleanup:

```ts
    // --- Issue access token ---
    const accessToken = await signMcpToken(storedCode.user_id);

    // --- Issue refresh token ---
    const rawRefreshToken = generateRefreshToken();
    const refreshTokenHash = hashToken(rawRefreshToken);
    const refreshExpiresAt = new Date(
      Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    await serviceClient.from("oauth_refresh_tokens").insert({
      token_hash: refreshTokenHash,
      user_id: storedCode.user_id,
      expires_at: refreshExpiresAt,
    });

    // --- Opportunistic cleanup ---
    await serviceClient
      .from("oauth_refresh_tokens")
      .delete()
      .or(
        `expires_at.lt.${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()},and(revoked.eq.true,created_at.lt.${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()})`,
      );

    return NextResponse.json({
      access_token: accessToken,
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: rawRefreshToken,
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/app/api/oauth/token.test.ts`
Expected: PASS

- [ ] **Step 5: Run lint**

Run: `pnpm lint`

- [ ] **Step 6: Commit**

```bash
git add app/api/oauth/token/route.ts tests/app/api/oauth/token.test.ts
git commit -m "feat(oauth): issue refresh token on authorization code exchange"
```

---

### Task 5: Refresh Token Exchange (`grant_type=refresh_token`)

**Files:**
- Modify: `app/api/oauth/token/route.ts`
- Modify: `tests/app/api/oauth/token.test.ts`

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block in `tests/app/api/oauth/token.test.ts` for refresh token exchange:

```ts
describe('POST /api/oauth/token — grant_type=refresh_token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when refresh_token param is missing', async () => {
    const request = makeRequest({
      grant_type: 'refresh_token',
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('invalid_request');
    expect(data.error_description).toContain('refresh_token is required');
  });

  it('returns error for unknown refresh token', async () => {
    // Token lookup returns no match
    const mockRefreshSelect = vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    });
    const mockRefreshEq = vi.fn().mockReturnValue({ select: mockRefreshSelect });
    mockServiceFrom.mockImplementation((table: string) => {
      if (table === 'oauth_refresh_tokens') {
        return { select: vi.fn().mockReturnValue({ eq: mockRefreshEq }) };
      }
      return { update: mockUpdate };
    });

    const request = makeRequest({
      grant_type: 'refresh_token',
      refresh_token: 'invalid-token',
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('invalid_grant');
  });

  it('returns error for expired refresh token', async () => {
    const tokenHash = crypto.createHash('sha256').update('expired-token').digest('hex');
    const mockRefreshSingle = vi.fn().mockResolvedValue({
      data: {
        token_hash: tokenHash,
        user_id: 'user-123',
        expires_at: new Date(Date.now() - 1000).toISOString(),
        revoked: false,
        replaced_by_hash: null,
      },
      error: null,
    });
    const mockRefreshSelect = vi.fn().mockReturnValue({ single: mockRefreshSingle });
    const mockRefreshEq = vi.fn().mockReturnValue({ select: mockRefreshSelect });
    mockServiceFrom.mockImplementation((table: string) => {
      if (table === 'oauth_refresh_tokens') {
        return { select: vi.fn().mockReturnValue({ eq: mockRefreshEq }) };
      }
      return { update: mockUpdate };
    });

    const request = makeRequest({
      grant_type: 'refresh_token',
      refresh_token: 'expired-token',
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('invalid_grant');
    expect(data.error_description).toContain('expired');
  });

  it('returns error and revokes all tokens on reuse detection', async () => {
    const tokenHash = crypto.createHash('sha256').update('reused-token').digest('hex');
    const mockRevokeUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const mockRefreshSingle = vi.fn().mockResolvedValue({
      data: {
        token_hash: tokenHash,
        user_id: 'user-123',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        revoked: false,
        replaced_by_hash: 'some-other-hash', // already rotated!
      },
      error: null,
    });
    const mockRefreshSelect = vi.fn().mockReturnValue({ single: mockRefreshSingle });
    const mockRefreshEq = vi.fn().mockReturnValue({ select: mockRefreshSelect });
    mockServiceFrom.mockImplementation((table: string) => {
      if (table === 'oauth_refresh_tokens') {
        return {
          select: vi.fn().mockReturnValue({ eq: mockRefreshEq }),
          update: mockRevokeUpdate,
        };
      }
      return { update: mockUpdate };
    });

    const request = makeRequest({
      grant_type: 'refresh_token',
      refresh_token: 'reused-token',
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('invalid_grant');
    expect(data.error_description).toContain('reuse');
    // Verify all tokens for user were revoked
    expect(mockRevokeUpdate).toHaveBeenCalledWith({ revoked: true });
  });

  it('rotates token and returns new access + refresh tokens on valid refresh', async () => {
    const rawToken = crypto.randomBytes(48).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const mockRefreshSingle = vi.fn().mockResolvedValue({
      data: {
        token_hash: tokenHash,
        user_id: 'user-123',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        revoked: false,
        replaced_by_hash: null,
      },
      error: null,
    });
    const mockRefreshSelect = vi.fn().mockReturnValue({ single: mockRefreshSingle });
    const mockRefreshEq = vi.fn().mockReturnValue({ select: mockRefreshSelect });
    const mockRotateUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const mockInsertSingle = vi.fn().mockResolvedValue({ data: { id: 'rt-new' }, error: null });
    const mockInsertSelect = vi.fn().mockReturnValue({ single: mockInsertSingle });
    const mockInsert = vi.fn().mockReturnValue({ select: mockInsertSelect });

    mockServiceFrom.mockImplementation((table: string) => {
      if (table === 'oauth_refresh_tokens') {
        return {
          select: vi.fn().mockReturnValue({ eq: mockRefreshEq }),
          update: mockRotateUpdate,
          insert: mockInsert,
          delete: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              lt: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        };
      }
      return { update: mockUpdate };
    });

    const request = makeRequest({
      grant_type: 'refresh_token',
      refresh_token: rawToken,
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.access_token).toBe('mock-access-token');
    expect(data.token_type).toBe('bearer');
    expect(data.expires_in).toBe(3600);
    expect(typeof data.refresh_token).toBe('string');
    expect(data.refresh_token.length).toBe(96);
    expect(data.refresh_token).not.toBe(rawToken); // rotated
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/app/api/oauth/token.test.ts`
Expected: FAIL — grant_type=refresh_token returns `unsupported_grant_type`

- [ ] **Step 3: Implement refresh token exchange**

In `app/api/oauth/token/route.ts`, change the grant_type check (around line 59) from rejecting everything except `authorization_code` to handling both:

Replace:
```ts
    if (grant_type !== "authorization_code") {
      return oauthError(
        "unsupported_grant_type",
        "grant_type must be 'authorization_code'",
      );
    }
```

With:
```ts
    if (grant_type !== "authorization_code" && grant_type !== "refresh_token") {
      return oauthError(
        "unsupported_grant_type",
        "grant_type must be 'authorization_code' or 'refresh_token'",
      );
    }

    // --- Refresh token flow ---
    if (grant_type === "refresh_token") {
      return handleRefreshToken(body, serviceClient);
    }
```

Move the `serviceClient` creation before the grant_type check so it's available for both flows:

```ts
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
```

Add the `handleRefreshToken` function at the bottom of the file (before the export or as a separate function):

```ts
async function handleRefreshToken(
  body: Record<string, string>,
  serviceClient: ReturnType<typeof createClient>,
) {
  const { refresh_token } = body;

  if (!refresh_token) {
    return oauthError("invalid_request", "refresh_token is required");
  }

  const tokenHash = hashToken(refresh_token);

  // Look up the refresh token
  const { data: storedToken, error: lookupError } = await serviceClient
    .from("oauth_refresh_tokens")
    .select("*")
    .eq("token_hash", tokenHash)
    .single();

  if (lookupError || !storedToken) {
    return oauthError("invalid_grant", "Invalid refresh token", 401);
  }

  // Check expiry
  if (new Date(storedToken.expires_at) < new Date()) {
    return oauthError("invalid_grant", "Refresh token expired", 401);
  }

  // Check revoked
  if (storedToken.revoked) {
    return oauthError("invalid_grant", "Refresh token revoked", 401);
  }

  // Reuse detection: if already rotated, revoke ALL tokens for this user
  if (storedToken.replaced_by_hash) {
    await serviceClient
      .from("oauth_refresh_tokens")
      .update({ revoked: true })
      .eq("user_id", storedToken.user_id);

    log.error("[oauth] Refresh token reuse detected", {
      userId: storedToken.user_id,
      tokenHash,
    });

    return oauthError(
      "invalid_grant",
      "Token reuse detected — all sessions revoked",
      401,
    );
  }

  // --- Rotate: issue new refresh token ---
  const newRawToken = generateRefreshToken();
  const newTokenHash = hashToken(newRawToken);
  const newExpiresAt = new Date(
    Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Mark old token as replaced
  await serviceClient
    .from("oauth_refresh_tokens")
    .update({ revoked: true, replaced_by_hash: newTokenHash })
    .eq("token_hash", tokenHash);

  // Insert new token
  await serviceClient.from("oauth_refresh_tokens").insert({
    token_hash: newTokenHash,
    user_id: storedToken.user_id,
    expires_at: newExpiresAt,
  });

  // --- Issue new access token ---
  const accessToken = await signMcpToken(storedToken.user_id);

  // --- Opportunistic cleanup ---
  await serviceClient
    .from("oauth_refresh_tokens")
    .delete()
    .or(
      `expires_at.lt.${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()},and(revoked.eq.true,created_at.lt.${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()})`,
    );

  return NextResponse.json({
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    refresh_token: newRawToken,
  });
}
```

Make sure `hashToken`, `generateRefreshToken`, and `REFRESH_TOKEN_EXPIRY_DAYS` are imported at the top of the file.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/app/api/oauth/token.test.ts`
Expected: PASS

- [ ] **Step 5: Run lint**

Run: `pnpm lint`

- [ ] **Step 6: Commit**

```bash
git add app/api/oauth/token/route.ts tests/app/api/oauth/token.test.ts
git commit -m "feat(oauth): add grant_type=refresh_token with rotation and reuse detection"
```

---

### Task 6: OAuth Metadata + CLAUDE.md Updates

**Files:**
- Modify: `app/.well-known/oauth-authorization-server/route.ts`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update OAuth metadata**

In `app/.well-known/oauth-authorization-server/route.ts`, change line 11:

From:
```ts
    grant_types_supported: ['authorization_code'],
```

To:
```ts
    grant_types_supported: ['authorization_code', 'refresh_token'],
```

- [ ] **Step 2: Update CLAUDE.md**

In `CLAUDE.md`, find the `### AI Chat Architecture` section. After the conversation API bullet, add:

```markdown
- **OAuth Token Lifetimes**: Access tokens expire after 1 hour (`exp` claim in JWT). Refresh tokens last 180 days, stored hashed in `oauth_refresh_tokens`, rotated on every use with reuse detection.
```

- [ ] **Step 3: Run lint**

Run: `pnpm lint`

- [ ] **Step 4: Commit**

```bash
git add app/.well-known/oauth-authorization-server/route.ts CLAUDE.md
git commit -m "docs(oauth): update metadata and CLAUDE.md with token lifetimes"
```

---

### Task 7: Final Integration Test & Cleanup

- [ ] **Step 1: Run full test suite**

Run: `pnpm test:run`
Expected: PASS (excluding pre-existing email test failures)

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: No errors

- [ ] **Step 3: Commit any remaining fixes**

If any fixes were needed, commit with descriptive messages.

- [ ] **Step 4: Push branch and create PR**

```bash
git push -u origin feat/oauth-refresh-tokens
```

Create PR with summary of the refresh token flow.
