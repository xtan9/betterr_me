import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CalendarEvent } from './types';

export class CalendarEventsDB {
  constructor(private supabase: SupabaseClient) {}

  async getUserEvents(userId: string, startDate: string, endDate: string): Promise<CalendarEvent[]> {
    // Fetch standalone events in range OR recurring parents that could have
    // occurrences in range OR exceptions for those recurring parents.
    // Recurring parents may start before the range but generate occurrences within it.
    const { data, error } = await this.supabase
      .from('calendar_events')
      .select('*')
      .eq('user_id', userId)
      .or(`and(start_date.lte.${endDate},end_date.gte.${startDate},is_recurring.eq.false,is_exception.eq.false),and(is_recurring.eq.true,start_date.lte.${endDate}),and(is_exception.eq.true)`)
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
