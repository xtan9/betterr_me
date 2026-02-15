import type { SupabaseClient } from '@supabase/supabase-js';
import type { HabitMilestone } from './types';
import type { MilestoneThreshold } from '@/lib/habits/milestones';
import { getNextDateString } from '@/lib/utils';

export class HabitMilestonesDB {
  constructor(private supabase: SupabaseClient) {}

  async recordMilestone(habitId: string, userId: string, milestone: MilestoneThreshold): Promise<void> {
    const { error } = await this.supabase
      .from('habit_milestones')
      .upsert(
        { habit_id: habitId, user_id: userId, milestone },
        { onConflict: 'habit_id,milestone' }
      );

    if (error) throw error;
  }

  async getHabitMilestones(habitId: string, userId: string): Promise<HabitMilestone[]> {
    const { data, error } = await this.supabase
      .from('habit_milestones')
      .select('*')
      .eq('habit_id', habitId)
      .eq('user_id', userId)
      .order('milestone', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async getTodaysMilestones(userId: string, date: string): Promise<HabitMilestone[]> {
    const todayStart = `${date}T00:00:00`;
    const tomorrowStart = `${getNextDateString(date)}T00:00:00`;

    const { data, error } = await this.supabase
      .from('habit_milestones')
      .select('*')
      .eq('user_id', userId)
      .gte('achieved_at', todayStart)
      .lt('achieved_at', tomorrowStart)
      .order('milestone', { ascending: false });

    if (error) throw error;
    return data || [];
  }
}
