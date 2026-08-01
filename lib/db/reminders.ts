import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Reminder, ReminderSourceType } from './types';

export class RemindersDB {
  constructor(private supabase: SupabaseClient) {}

  async getRemindersBySource(userId: string, sourceType: ReminderSourceType, sourceId: string): Promise<Reminder[]> {
    const { data, error } = await this.supabase
      .from('reminders')
      .select('*')
      .eq('user_id', userId)
      .eq('source_type', sourceType)
      .eq('source_id', sourceId)
      .order('fire_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async getReminder(userId: string, reminderId: string): Promise<Reminder | null> {
    const { data, error } = await this.supabase
      .from('reminders')
      .select('*')
      .eq('id', reminderId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async getPendingReminders(beforeTime: string): Promise<Reminder[]> {
    const { data, error } = await this.supabase
      .from('reminders')
      .select('*')
      .eq('status', 'pending')
      .lte('fire_at', beforeTime)
      .order('fire_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }

}

/** Client-side singleton. Do NOT use in API routes — create a new instance with the server client instead. */
export const remindersDB = new RemindersDB(createClient());
