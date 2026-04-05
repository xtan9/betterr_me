import { Resend } from 'resend';
import { log } from '@/lib/logger';

let _resend: Resend | null = null;

export function getResendClient(): Resend {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) {
      log.warn('RESEND_API_KEY environment variable is not set. Email sending will fail.');
    }
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}
