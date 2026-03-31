import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReminderDefault, ReminderDefaultInsert, ReminderSourceType } from './types';

export class ReminderDefaultsDB {
  constructor(private supabase: SupabaseClient) {}

  async getDefaults(userId: string): Promise<ReminderDefault[]> {
    const { data, error } = await this.supabase
      .from('reminder_defaults')
      .select('*')
      .eq('user_id', userId);
    if (error) throw error;
    return data || [];
  }

  async getDefault(userId: string, sourceType: ReminderSourceType): Promise<ReminderDefault | null> {
    const { data, error } = await this.supabase
      .from('reminder_defaults')
      .select('*')
      .eq('user_id', userId)
      .eq('source_type', sourceType)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  }

  async upsertDefault(userId: string, defaultData: Omit<ReminderDefaultInsert, 'user_id'>): Promise<ReminderDefault> {
    const { data, error } = await this.supabase
      .from('reminder_defaults')
      .upsert({ ...defaultData, user_id: userId }, { onConflict: 'user_id,source_type' })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async deleteDefault(userId: string, sourceType: ReminderSourceType): Promise<void> {
    const { error } = await this.supabase
      .from('reminder_defaults')
      .delete()
      .eq('user_id', userId)
      .eq('source_type', sourceType);
    if (error) throw error;
  }
}

/** Client-side singleton. Do NOT use in API routes — create a new instance with the server client instead. */
export const reminderDefaultsDB = new ReminderDefaultsDB(createClient());
