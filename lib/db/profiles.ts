import { createClient } from '@/lib/supabase/client';
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
    preferences: Partial<Profile['preferences']>
  ): Promise<Profile> {
    // Get current profile to merge preferences
    const profile = await this.getProfile(userId);
    if (!profile) throw new Error('Profile not found');

    const updatedPreferences = {
      ...profile.preferences,
      ...preferences,
    };

    return this.updateProfile(userId, { preferences: updatedPreferences });
  }
}

/** Client-side singleton. Do NOT use in API routes — create a new instance with the server client instead. */
export const profilesDB = new ProfilesDB(createClient());
