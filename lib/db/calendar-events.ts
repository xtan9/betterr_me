import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CalendarEvent, CalendarEventInsert, CalendarEventUpdate } from './types';

export class CalendarEventsDB {
  constructor(private supabase: SupabaseClient) {}

  async getUserEvents(userId: string, startDate: string, endDate: string): Promise<CalendarEvent[]> {
    const { data, error } = await this.supabase
      .from('calendar_events')
      .select('*')
      .eq('user_id', userId)
      .lte('start_date', endDate)
      .gte('end_date', startDate)
      .order('start_date', { ascending: true })
      .order('start_time', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async getEvent(eventId: string, userId: string): Promise<CalendarEvent | null> {
    const { data, error } = await this.supabase
      .from('calendar_events')
      .select('*')
      .eq('id', eventId)
      .eq('user_id', userId)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  }

  async createEvent(userId: string, event: Omit<CalendarEventInsert, 'user_id'>): Promise<CalendarEvent> {
    const { data, error } = await this.supabase
      .from('calendar_events')
      .insert({ ...event, user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateEvent(eventId: string, userId: string, updates: CalendarEventUpdate): Promise<CalendarEvent> {
    const { data, error } = await this.supabase
      .from('calendar_events')
      .update(updates)
      .eq('id', eventId)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async deleteEvent(eventId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('calendar_events')
      .delete()
      .eq('id', eventId)
      .eq('user_id', userId);
    if (error) throw error;
  }

  async getRecurringEvents(userId: string): Promise<CalendarEvent[]> {
    const { data, error } = await this.supabase
      .from('calendar_events')
      .select('*')
      .eq('user_id', userId)
      .eq('is_recurring', true)
      .order('start_date', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async getExceptions(userId: string, recurringEventId: string): Promise<CalendarEvent[]> {
    const { data, error } = await this.supabase
      .from('calendar_events')
      .select('*')
      .eq('user_id', userId)
      .eq('recurring_event_id', recurringEventId)
      .eq('is_exception', true);
    if (error) throw error;
    return data || [];
  }
}

/** Client-side singleton. Do NOT use in API routes — create a new instance with the server client instead. */
export const calendarEventsDB = new CalendarEventsDB(createClient());
