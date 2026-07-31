import { createClient } from '@/lib/supabase/client';
import type { PreferencesValues } from '@/lib/validations/preferences';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile, ProfileUpdate } from './types';

export class ProfilesDB {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get user profile
   */
  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }

    return data;
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, updates: ProfileUpdate): Promise<Profile> {
    const { data, error } = await this.supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Update user preferences
   */
  async updatePreferences(
    userId: string,
    preferences: PreferencesValues
  ): Promise<Profile> {
    const { data, error } = await this.supabase.rpc(
      'update_profile_preferences',
      {
        profile_id: userId,
        preference_patch: preferences,
      }
    );

    if (error) {
      const normalized = new Error(error.message);
      Object.assign(normalized, error);
      throw normalized;
    }
    if (!data) throw new Error(`Profile not found for user ${userId}`);
    return data as Profile;
  }
}

/** Client-side singleton. Do NOT use in API routes — create a new instance with the server client instead. */
export const profilesDB = new ProfilesDB(createClient());
