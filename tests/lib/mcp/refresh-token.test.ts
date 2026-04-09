// @vitest-environment node
import crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';

import {
  generateRefreshToken,
  hashToken,
  REFRESH_TOKEN_EXPIRY_DAYS,
} from '@/lib/mcp/refresh-token';

describe('refresh-token utils', () => {
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
