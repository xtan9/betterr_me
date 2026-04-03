import { Resend } from 'resend';
import { log } from '@/lib/logger';

if (!process.env.RESEND_API_KEY) {
  log.warn('RESEND_API_KEY environment variable is not set. Email sending will fail.');
}

export const resend = new Resend(process.env.RESEND_API_KEY);
