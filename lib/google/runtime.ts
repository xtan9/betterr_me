import { createAdminClient } from '@/lib/supabase/admin';
import { GoogleConnections, type GoogleConfig } from './connections';
import { googleConnectionStore } from './store';
import { GoogleConnectionError } from './contracts';

export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CONNECTIONS_CLIENT_ID, clientSecret = process.env.GOOGLE_CONNECTIONS_CLIENT_SECRET;
  const encryptionKey = process.env.GOOGLE_CONNECTIONS_ENCRYPTION_KEY, redirectUri = process.env.GOOGLE_CONNECTIONS_REDIRECT_URI;
  if (!clientId || !clientSecret || !encryptionKey || !redirectUri || Buffer.from(encryptionKey, 'base64').length !== 32) return null;
  try { const url = new URL(redirectUri); if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return null; }
  catch { return null; }
  return { clientId, clientSecret, encryptionKey, redirectUri };
}
export function googleRuntime() {
  const config = googleConfig();
  if (!config) throw new GoogleConnectionError('not-configured');
  return new GoogleConnections(googleConnectionStore(createAdminClient()), config);
}
