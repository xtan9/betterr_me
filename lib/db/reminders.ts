import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Reminder, ReminderInsert, ReminderUpdate, ReminderSourceType, ReminderStatus } from './types';

export class RemindersDB {
  constructor(private supabase: SupabaseClient) {}

  async createReminder(userId: string, reminder: Omit<ReminderInsert, 'user_id'>): Promise<Reminder> {
    const { data, error } = await this.supabase
      .from('reminders')
      .insert({ ...reminder, user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

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

  async getPendingReminders(beforeTime: string): Promise<Reminder[]> {
    const { data, error } = await this.supabase
      .from('reminders')
      .select('*')
      .eq('status', 'pending')
      .in('source_type', ['calendar_event', 'task', 'habit'])
      .lte('fire_at', beforeTime)
      .order('fire_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async updateReminderStatus(userId: string, reminderId: string, status: ReminderStatus, sentAt?: string): Promise<Reminder> {
    const updates: ReminderUpdate = { status };
    if (sentAt) updates.sent_at = sentAt;
    const { data, error } = await this.supabase
      .from('reminders')
      .update(updates)
      .eq('id', reminderId)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateReminder(userId: string, reminderId: string, update: ReminderUpdate): Promise<Reminder> {
    const { data, error } = await this.supabase
      .from('reminders')
      .update(update)
      .eq('id', reminderId)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async deleteReminder(userId: string, reminderId: string): Promise<void> {
    const { error } = await this.supabase
      .from('reminders')
      .delete()
      .eq('id', reminderId)
      .eq('user_id', userId);
    if (error) throw error;
  }

  async deleteRemindersBySource(userId: string, sourceType: ReminderSourceType, sourceId: string): Promise<void> {
    const { error } = await this.supabase
      .from('reminders')
      .delete()
      .eq('user_id', userId)
      .eq('source_type', sourceType)
      .eq('source_id', sourceId);
    if (error) throw error;
  }
}

/** Client-side singleton. Do NOT use in API routes — create a new instance with the server client instead. */
export const remindersDB = new RemindersDB(createClient());
