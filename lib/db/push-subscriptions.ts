import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PushSubscription, PushSubscriptionInsert } from './types';

export class PushSubscriptionsDB {
  constructor(private supabase: SupabaseClient) {}

  async getSubscriptions(userId: string): Promise<PushSubscription[]> {
    const { data, error } = await this.supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async upsertSubscription(userId: string, subscription: Omit<PushSubscriptionInsert, 'user_id'>): Promise<PushSubscription> {
    const { data, error } = await this.supabase
      .from('push_subscriptions')
      .upsert({ ...subscription, user_id: userId }, { onConflict: 'user_id,endpoint' })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async deleteSubscription(userId: string, endpoint: string): Promise<void> {
    const { error } = await this.supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', endpoint);
    if (error) throw error;
  }

  async deleteAllSubscriptions(userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId);
    if (error) throw error;
  }
}

/** Client-side singleton. Do NOT use in API routes — create a new instance with the server client instead. */
export const pushSubscriptionsDB = new PushSubscriptionsDB(createClient());
