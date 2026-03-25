import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApiKey, ApiKeyInsert, ApiKeyPublic } from './types';

// All columns except key_hash, used for client-facing queries
const PUBLIC_COLUMNS =
  'id, user_id, name, key_prefix, permissions, expires_at, last_used_at, created_at' as const;

export class ApiKeysDB {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get all API keys for a user (excluding key_hash).
   * Ordered by created_at desc (newest first).
   */
  async getUserKeys(userId: string): Promise<ApiKeyPublic[]> {
    const { data, error } = await this.supabase
      .from('api_keys')
      .select(PUBLIC_COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Look up a key by its hash. Returns the full row including key_hash
   * (needed for authentication). Returns null if not found.
   */
  async getKeyByHash(keyHash: string): Promise<ApiKey | null> {
    const { data, error } = await this.supabase
      .from('api_keys')
      .select('*')
      .eq('key_hash', keyHash)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  /**
   * Count keys for a user. Used to enforce the max 10 key limit.
   */
  async getKeyCount(userId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('api_keys')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) throw error;
    return count ?? 0;
  }

  /**
   * Create a new API key. Returns the public representation (no key_hash).
   */
  async createKey(key: ApiKeyInsert): Promise<ApiKeyPublic> {
    const { data, error } = await this.supabase
      .from('api_keys')
      .insert(key)
      .select(PUBLIC_COLUMNS)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Delete an API key by id AND user_id (defense in depth with RLS).
   */
  async deleteKey(keyId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('api_keys')
      .delete()
      .eq('id', keyId)
      .eq('user_id', userId);

    if (error) throw error;
  }
}
