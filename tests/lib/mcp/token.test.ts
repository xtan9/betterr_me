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
const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}));

import { signMcpToken, verifyMcpToken, verifyMcpAuth } from '@/lib/mcp/token';

// ---------------------------------------------------------------------------
// signMcpToken
// ---------------------------------------------------------------------------
describe('signMcpToken', () => {
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

  it('payload contains sub, aud:"mcp", iat, and exp (1 hour)', async () => {
    const token = await signMcpToken('user-abc');
    const payloadB64 = token.split('.')[1];
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

    expect(payload.sub).toBe('user-abc');
    expect(payload.aud).toBe('mcp');
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
    expect(payload.exp - payload.iat).toBe(3600);
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
    // Default: user exists
    mockFrom.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ single: mockSingle });
    mockSingle.mockResolvedValue({ data: { id: 'user-123' }, error: null });
  });

  it('valid token returns { userId }', async () => {
    const token = await signMcpToken('user-123');
    const result = await verifyMcpToken(token);

    expect(result).toEqual({ userId: 'user-123' });
  });

  it('legacy token without exp is accepted (backwards-compat)', async () => {
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
});

// ---------------------------------------------------------------------------
// verifyMcpAuth
// ---------------------------------------------------------------------------
describe('verifyMcpAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({ select: mockSelect });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ single: mockSingle });
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
