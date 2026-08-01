import { createClient } from '@/lib/supabase/client';
import type { PreferencesValues } from '@/lib/validations/preferences';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile, ProfileUpdate } from './types';
import type { CurrentProfileProjection } from '@/lib/current-profile';
import type {
  AppearancePreferenceOutcome,
  AppearancePreferenceIntent,
  FitnessPreferenceOutcome,
  FitnessPreferenceIntent,
  LocalizationPreferenceOutcome,
  LocalizationPreferenceIntent,
  NotificationPreferenceIntent,
  NotificationPreferenceOutcome,
  ProfileDetailsCommand,
  ProfileDetailsOutcome,
  UserTimeZoneCommand,
  UserTimeZoneOutcome,
} from '@/lib/preferences/commands';
import type {
  PreferenceStorage,
  WeightUnitPreference,
} from '@/lib/preferences/types';
import { isWeightUnitPreference } from '@/lib/preferences/owners';

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
   * Read only the storage projection needed to compose Current Profile.
   * Identity Email is deliberately sourced from authenticated identity.
   */
  async getCurrentProfileProjection(
    userId: string,
  ): Promise<CurrentProfileProjection | null> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select(
        'full_name, avatar_url, timezone, preferences, preference_revision',
      )
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    if (!data) return null;

    return {
      full_name: data.full_name ?? null,
      avatar_url: data.avatar_url ?? null,
      timezone: data.timezone ?? null,
      preferences: data.preferences as PreferenceStorage,
      preference_revision: data.preference_revision,
    };
  }

  async getFitnessWeightUnitPreference(
    userId: string,
  ): Promise<WeightUnitPreference | null> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('weight_unit:preferences->>weight_unit')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    const value = (data as { weight_unit?: unknown } | null)?.weight_unit;
    return isWeightUnitPreference(value) ? value : null;
  }

  async getUserTimeZone(userId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('timezone')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return (data as { timezone?: string | null } | null)?.timezone ?? null;
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

  async setAppearancePreference(
    theme: AppearancePreferenceIntent['theme'],
  ): Promise<AppearancePreferenceOutcome> {
    return this.callPreferenceCommand<AppearancePreferenceOutcome>(
      'set_appearance_preference',
      { theme },
    );
  }

  async setFitnessPreference(
    weightUnit: FitnessPreferenceIntent['weightUnit'],
  ): Promise<FitnessPreferenceOutcome> {
    return this.callPreferenceCommand<FitnessPreferenceOutcome>(
      'set_fitness_preference',
      { weight_unit: weightUnit },
    );
  }

  async updateProfileDetails(
    details: ProfileDetailsCommand,
  ): Promise<ProfileDetailsOutcome> {
    const { data, error } = await this.supabase.rpc('update_profile_details', {
      details_patch: {
        ...(details.fullName !== undefined && { full_name: details.fullName || null }),
        ...(details.avatarUrl !== undefined && { avatar_url: details.avatarUrl || null }),
      },
    });
    if (error) throw this.normalizeRpcError(error);
    if (!data) throw new Error('Profile not found');
    return data as ProfileDetailsOutcome;
  }

  async setUserTimeZone(
    timeZone: UserTimeZoneCommand['timeZone'],
  ): Promise<UserTimeZoneOutcome> {
    const { data, error } = await this.supabase.rpc('set_user_time_zone', {
      time_zone: timeZone,
    });
    if (error) throw this.normalizeRpcError(error);
    if (!data) throw new Error('Profile not found');
    return data as UserTimeZoneOutcome;
  }

  private async callPreferenceCommand<Outcome>(
    functionName: string,
    args: Record<string, unknown>,
  ): Promise<Outcome> {
    const { data, error } = await this.supabase.rpc(functionName, args);
    if (error) throw this.normalizeRpcError(error);
    if (!data) throw new Error('Profile not found');
    return data as Outcome;
  }

  private normalizeRpcError(error: unknown) {
    const normalized = new Error(
      typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error),
    );
    if (typeof error === 'object' && error !== null && 'code' in error) {
      Object.assign(normalized, { code: (error as { code: unknown }).code });
    }
    return normalized;
  }
}

/** Client-side singleton. Do NOT use in API routes — create a new instance with the server client instead. */
export const profilesDB = new ProfilesDB(createClient());
