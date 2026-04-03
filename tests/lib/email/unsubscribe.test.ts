import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';

// Set secret before importing module (module reads env at call time)
beforeAll(() => {
  process.env.EMAIL_UNSUBSCRIBE_SECRET = 'test-secret-for-unsubscribe-tokens-32chars';
});

describe('unsubscribe tokens', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generateUnsubscribeToken returns a non-empty base64url string', async () => {
    const { generateUnsubscribeToken } = await import('@/lib/email/unsubscribe');
    const token = generateUnsubscribeToken('user-123');
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    // base64url characters only
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('verifyUnsubscribeToken returns the original userId for a valid token', async () => {
    const { generateUnsubscribeToken, verifyUnsubscribeToken } = await import('@/lib/email/unsubscribe');
    const token = generateUnsubscribeToken('user-123');
    const result = verifyUnsubscribeToken(token);
    expect(result).toBe('user-123');
  });

  it('verifyUnsubscribeToken returns null for a tampered token', async () => {
    const { generateUnsubscribeToken, verifyUnsubscribeToken } = await import('@/lib/email/unsubscribe');
    const token = generateUnsubscribeToken('user-123');

    // Decode, modify signature, re-encode
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString());
    decoded.sig = 'a'.repeat(decoded.sig.length); // Replace sig with all 'a's
    const tampered = Buffer.from(JSON.stringify(decoded)).toString('base64url');

    const result = verifyUnsubscribeToken(tampered);
    expect(result).toBeNull();
  });

  it('verifyUnsubscribeToken returns null for an expired token', async () => {
    const { generateUnsubscribeToken, verifyUnsubscribeToken } = await import('@/lib/email/unsubscribe');

    // Generate a token, then advance time past expiry
    const token = generateUnsubscribeToken('user-123');

    // Decode and set exp to the past
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString());
    decoded.exp = Date.now() - 1000; // expired 1 second ago
    // Re-sign with correct HMAC for the new exp
    const crypto = await import('crypto');
    const data = `${decoded.uid}:${decoded.exp}`;
    decoded.sig = crypto.createHmac('sha256', process.env.EMAIL_UNSUBSCRIBE_SECRET!).update(data).digest('hex');
    const expired = Buffer.from(JSON.stringify(decoded)).toString('base64url');

    const result = verifyUnsubscribeToken(expired);
    expect(result).toBeNull();
  });

  it('verifyUnsubscribeToken returns null for a completely invalid string', async () => {
    const { verifyUnsubscribeToken } = await import('@/lib/email/unsubscribe');
    expect(verifyUnsubscribeToken('not-valid')).toBeNull();
  });

  it('verifyUnsubscribeToken returns null for empty string', async () => {
    const { verifyUnsubscribeToken } = await import('@/lib/email/unsubscribe');
    expect(verifyUnsubscribeToken('')).toBeNull();
  });

  it('different user IDs produce different tokens', async () => {
    const { generateUnsubscribeToken } = await import('@/lib/email/unsubscribe');
    const tokenA = generateUnsubscribeToken('user-A');
    const tokenB = generateUnsubscribeToken('user-B');
    expect(tokenA).not.toBe(tokenB);
  });

  it('getUnsubscribeUrl returns a URL with /api/email/unsubscribe?token=', async () => {
    const { getUnsubscribeUrl } = await import('@/lib/email/unsubscribe');
    const url = getUnsubscribeUrl('user-123');
    expect(url).toContain('/api/email/unsubscribe?token=');
  });

  it('throws when EMAIL_UNSUBSCRIBE_SECRET is missing', async () => {
    const originalSecret = process.env.EMAIL_UNSUBSCRIBE_SECRET;
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    try {
      const { generateUnsubscribeToken } = await import('@/lib/email/unsubscribe');
      expect(() => generateUnsubscribeToken('user-123')).toThrow('EMAIL_UNSUBSCRIBE_SECRET');
    } finally {
      process.env.EMAIL_UNSUBSCRIBE_SECRET = originalSecret;
    }
  });
});
