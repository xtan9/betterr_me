import type { SupabaseClient } from "@supabase/supabase-js";
import type { HabitGraduation, HabitGraduationInsert } from "./types";
import { log } from "@/lib/logger";

export class HabitGraduationsDB {
  constructor(private supabase: SupabaseClient) {}

  async insertGraduation(row: HabitGraduationInsert): Promise<HabitGraduation> {
    const { data, error } = await this.supabase
      .from("habit_graduations")
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return data as HabitGraduation;
  }

  /** Stamp reactivated_at on the most recent open graduation row for a habit. */
  async markReactivated(habitId: string, userId: string): Promise<void> {
    const { data: latest, error: selErr } = await this.supabase
      .from("habit_graduations")
      .select("id")
      .eq("habit_id", habitId)
      .eq("user_id", userId)
      .is("reactivated_at", null)
      .order("graduated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!latest) {
      log.warn("[habits] markReactivated: no open graduation row found", {
        habitId,
        userId,
      });
      return;
    }

    const { error } = await this.supabase
      .from("habit_graduations")
      .update({ reactivated_at: new Date().toISOString() })
      .eq("id", latest.id)
      .eq("user_id", userId);
    if (error) throw error;
  }

  async getForHabit(habitId: string, userId: string): Promise<HabitGraduation[]> {
    const { data, error } = await this.supabase
      .from("habit_graduations")
      .select("*")
      .eq("habit_id", habitId)
      .eq("user_id", userId)
      .order("graduated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as HabitGraduation[];
  }
}
