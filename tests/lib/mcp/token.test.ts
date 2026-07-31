// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set env vars before import
process.env.API_KEY_HMAC_SECRET = 'test-secret-for-mcp-token-tests-32chars';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

// Mock logger
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// Mock Supabase service client for user-exists check in verifyMcpToken
const mockSingle = vi.fn();
const profileQueryLog: Array<{
  table: string;
  method: string;
  args: unknown[];
}> = [];
let profileTable = '';
const mockEq = vi.fn((...args: unknown[]) => {
  profileQueryLog.push({ table: profileTable, method: 'eq', args });
  return {
    single: (...singleArgs: unknown[]) => {
      profileQueryLog.push({
        table: profileTable,
        method: 'single',
        args: singleArgs,
      });
      return mockSingle(...singleArgs);
    },
  };
});
const mockSelect = vi.fn((...args: unknown[]) => {
  profileQueryLog.push({ table: profileTable, method: 'select', args });
  return { eq: mockEq };
});
const mockFrom = vi.fn((table: string) => {
  profileTable = table;
  profileQueryLog.push({ table, method: 'from', args: [table] });
  return { select: mockSelect };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}));

import {
  verifyMcpToken,
  verifyMcpTokenCredential,
  verifyMcpAuth,
} from '@/lib/mcp/token';
import {
  ACCESS_TOKEN_POLICY,
  issueAccessToken,
} from '@/lib/oauth/access-token';

async function signMcpToken(
  userId: string,
  clientId = userId,
  scopes: readonly string[] = ACCESS_TOKEN_POLICY.defaultScopes,
): Promise<string> {
  const credential = await issueAccessToken({ userId, clientId, scopes });
  return credential.accessToken;
}

async function signPayload(payload: unknown): Promise<string> {
  const crypto = await import('node:crypto');
  const secret = process.env.API_KEY_HMAC_SECRET!;
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const data = `${header}.${payloadB64}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest()
    .toString('base64url');

  return `${data}.${signature}`;
}

// ---------------------------------------------------------------------------
// signMcpToken
// ---------------------------------------------------------------------------
describe('access-token issuance used by MCP verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a valid JWT string (3 dot-separated parts)', async () => {
    const token = await signMcpToken('user-123');
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
    // Each part should be non-empty
    parts.forEach((p) => expect(p.length).toBeGreaterThan(0));
  });

  it('payload contains the required issuer, subject, audience, client, scopes, and lifetime', async () => {
    const token = await signMcpToken('user-abc');
    const payloadB64 = token.split('.')[1];
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

    expect(payload.iss).toBe('https://betterr.me');
    expect(payload.sub).toBe('user-abc');
    expect(payload.aud).toBe('mcp');
    expect(payload.client_id).toBe('user-abc');
    expect(payload.scope).toBe('read write');
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
    expect(payload.exp - payload.iat).toBe(3600);
  });

  it('preserves the intended client and scopes in the credential outcome', async () => {
    const token = await signMcpToken('user-abc', 'client-123', ['read']);
    const payloadB64 = token.split('.')[1];
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

    expect(payload.client_id).toBe('client-123');
    expect(payload.scope).toBe('read');
  });

  it('two calls with same userId produce different tokens (different iat)', async () => {
    const token1 = await signMcpToken('user-123');
    // Advance time slightly
    const originalNow = Date.now;
    Date.now = () => originalNow() + 1000;
    const token2 = await signMcpToken('user-123');
    Date.now = originalNow;

    expect(token1).not.toBe(token2);
  });
});

// ---------------------------------------------------------------------------
// verifyMcpToken
// ---------------------------------------------------------------------------
describe('verifyMcpToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profileQueryLog.length = 0;
    // Default: user exists
    mockSingle.mockResolvedValue({ data: { id: 'user-123' }, error: null });
  });

  it('valid token returns { userId }', async () => {
    const token = await signMcpToken('user-123');
    const result = await verifyMcpToken(token);

    expect(result).toEqual({
      userId: 'user-123',
      clientId: 'user-123',
      scopes: ['read', 'write'],
    });
    expect(profileQueryLog).toEqual([
      { table: 'profiles', method: 'from', args: ['profiles'] },
      { table: 'profiles', method: 'select', args: ['id'] },
      { table: 'profiles', method: 'eq', args: ['id', 'user-123'] },
      { table: 'profiles', method: 'single', args: [] },
    ]);
  });

  it('rejects a legacy token without the required policy claims', async () => {
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
    expect(result).toBeNull();
  });

  it('token with expired exp returns null', async () => {
    const token = await signMcpToken('user-123');

    const originalNow = Date.now;
    Date.now = () => originalNow() + 2 * 60 * 60 * 1000;

    const result = await verifyMcpToken(token);
    Date.now = originalNow;

    expect(result).toBeNull();
  });

  it('wrong audience returns null', async () => {
    // Manually craft a token with aud:"wrong"
    const crypto = await import('node:crypto');
    const secret = process.env.API_KEY_HMAC_SECRET!;

    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(
      JSON.stringify({ sub: 'user-123', aud: 'wrong', iat: now, exp: now + 86400 }),
    ).toString('base64url');
    const data = `${header}.${payload}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest()
      .toString('base64url');
    const token = `${data}.${signature}`;

    const result = await verifyMcpToken(token);
    expect(result).toBeNull();
  });

  it('wrong issuer returns null', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signPayload({
      iss: 'https://other-issuer.test',
      sub: 'user-123',
      aud: 'mcp',
      client_id: 'client-123',
      scope: 'read',
      iat: now,
      exp: now + 3600,
    });

    await expect(verifyMcpToken(token)).resolves.toBeNull();
  });

  it('rejects a signed token with a lifetime outside the shared policy', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signPayload({
      iss: 'https://betterr.me',
      sub: 'user-123',
      aud: 'mcp',
      client_id: 'client-123',
      scope: 'read',
      iat: now,
      exp: now + 7200,
    });

    await expect(verifyMcpToken(token)).resolves.toBeNull();
  });

  it('invalid signature returns null', async () => {
    const token = await signMcpToken('user-123');
    // Tamper with the signature
    const parts = token.split('.');
    parts[2] = parts[2].slice(0, -4) + 'XXXX';
    const tampered = parts.join('.');

    const result = await verifyMcpToken(tampered);
    expect(result).toBeNull();
  });

  it('non-existent user returns null', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

    const token = await signMcpToken('user-nonexistent');
    const result = await verifyMcpToken(token);

    expect(result).toBeNull();
  });

  it.each([
    ['a non-object payload', null],
    ['an array payload', []],
    ['a non-string subject', { sub: 123, aud: 'mcp' }],
    ['a missing issuer', { sub: 'user-123', aud: 'mcp', client_id: 'client-123', scope: 'read', iat: 1, exp: 2 }],
    ['a non-string audience', { sub: 'user-123', aud: 123 }],
    ['a non-number expiry', { sub: 'user-123', aud: 'mcp', exp: 'never' }],
    ['a non-number issued-at time', { sub: 'user-123', aud: 'mcp', iat: 'now' }],
    ['a non-string client ID', { sub: 'user-123', aud: 'mcp', client_id: 123 }],
    ['a non-string scope', { sub: 'user-123', aud: 'mcp', scope: ['read'] }],
  ])('classifies %s as invalid claims', async (_description, payload) => {
    const token = await signPayload(payload);

    await expect(verifyMcpTokenCredential(token)).resolves.toEqual({
      outcome: 'invalid',
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('classifies profile infrastructure failures as misconfigured', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: 'XX000', message: 'database unavailable' },
    });

    const token = await signMcpToken('user-123');
    const result = await verifyMcpTokenCredential(token);

    expect(result).toEqual({ outcome: 'misconfigured' });
  });
});

// ---------------------------------------------------------------------------
// verifyMcpAuth
// ---------------------------------------------------------------------------
describe('verifyMcpAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profileQueryLog.length = 0;
    mockSingle.mockResolvedValue({ data: { id: 'user-123' }, error: null });
  });

  it('no bearer token returns undefined', async () => {
    const req = new Request('http://localhost:3000/api/mcp');
    const result = await verifyMcpAuth(req, undefined);

    expect(result).toBeUndefined();
  });

  it('valid token returns AuthInfo with userId in extra', async () => {
    const token = await signMcpToken('user-123');
    const req = new Request('http://localhost:3000/api/mcp');
    const result = await verifyMcpAuth(req, token);

    expect(result).toBeDefined();
    expect(result!.token).toBe(token);
    expect(result!.scopes).toEqual(['read', 'write']);
    expect(result!.clientId).toBe('user-123');
    expect(result!.extra).toEqual({ userId: 'user-123' });
  });

  it('invalid token returns undefined', async () => {
    const req = new Request('http://localhost:3000/api/mcp');
    const result = await verifyMcpAuth(req, 'not-a-valid-token');

    expect(result).toBeUndefined();
  });
});
