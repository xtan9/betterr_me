import crypto from 'crypto';

const SECRET = process.env.EMAIL_UNSUBSCRIBE_SECRET || '';

export function generateUnsubscribeToken(userId: string): string {
  const hmac = crypto.createHmac('sha256', SECRET).update(userId).digest('hex');
  const payload = Buffer.from(JSON.stringify({ uid: userId, sig: hmac })).toString('base64url');
  return payload;
}

export function verifyUnsubscribeToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const { uid, sig } = JSON.parse(decoded);
    if (!uid || !sig) return null;
    const expected = crypto.createHmac('sha256', SECRET).update(uid).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
    return uid;
  } catch {
    return null;
  }
}

export function getUnsubscribeUrl(userId: string): string {
  const token = generateUnsubscribeToken(userId);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseUrl}/api/email/unsubscribe?token=${token}`;
}
