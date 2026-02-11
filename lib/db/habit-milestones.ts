import type { SupabaseClient } from '@supabase/supabase-js';
import type { HabitMilestone } from './types';
import type { MilestoneThreshold } from '@/lib/habits/milestones';

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

  async getTodaysMilestones(userId: string): Promise<HabitMilestone[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    const { data, error } = await this.supabase
      .from('habit_milestones')
      .select('*')
      .eq('user_id', userId)
      .gte('achieved_at', todayStr)
      .order('milestone', { ascending: false });

    if (error) throw error;
    return data || [];
  }
}
