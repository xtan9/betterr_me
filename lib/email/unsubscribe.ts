import crypto from 'crypto';
import { log } from '@/lib/logger';

const TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getSecret(): string {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('EMAIL_UNSUBSCRIBE_SECRET must be set and at least 32 characters');
  }
  return secret;
}

export function generateUnsubscribeToken(userId: string): string {
  const exp = Date.now() + TOKEN_MAX_AGE_MS;
  const data = `${userId}:${exp}`;
  const hmac = crypto.createHmac('sha256', getSecret()).update(data).digest('hex');
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp, sig: hmac })).toString('base64url');
  return payload;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const secret = getSecret(); // Let config errors propagate as 500, not "invalid token"
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const { uid, exp, sig } = JSON.parse(decoded);
    if (!uid || !sig) return null;
    if (typeof exp === 'number' && Date.now() > exp) return null;
    const data = `${uid}:${exp}`;
    const expected = crypto.createHmac('sha256', secret).update(data).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
    return uid;
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      log.error('Unexpected error verifying unsubscribe token', error);
    }
    return null;
  }
}

export function getUnsubscribeUrl(userId: string): string {
  const token = generateUnsubscribeToken(userId);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseUrl}/api/email/unsubscribe?token=${token}`;
}
