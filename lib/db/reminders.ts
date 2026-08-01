import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Reminder, ReminderUpdate, ReminderSourceType, ReminderStatus } from './types';

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

  async transitionCalendarEventReminder(
    userId: string,
    reminderId: string,
    transition: { status: "pending" | "sent" | "failed" | "snoozed"; fire_at?: string; sent_at?: string | null },
  ): Promise<Reminder> {
    const { data, error } = await this.supabase
      .rpc("transition_calendar_event_reminder", {
        p_user_id: userId,
        p_reminder_id: reminderId,
        p_status: transition.status,
        p_fire_at: transition.fire_at ?? null,
        p_sent_at: transition.sent_at ?? null,
      })
      .single();
    if (error) throw error;
    return data as Reminder;
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

}

/** Client-side singleton. Do NOT use in API routes — create a new instance with the server client instead. */
export const remindersDB = new RemindersDB(createClient());
