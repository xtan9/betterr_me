import { describe, it, expect, vi, beforeEach } from 'vitest';
import { profilesDB } from '@/lib/db/profiles';
import { mockSupabaseClient } from '../../setup';
import type { Profile, ProfileUpdate } from '@/lib/db/types';

describe('ProfilesDB', () => {
  const mockProfile: Profile = {
    id: 'user-123',
    email: 'test@example.com',
    full_name: 'Test User',
    avatar_url: 'https://example.com/avatar.jpg',
    preferences: {
      timezone: 'America/Los_Angeles',
      date_format: 'MM/DD/YYYY',
      week_start_day: 1,
      theme: 'dark',
    },
    created_at: '2026-01-30T10:00:00Z',
    updated_at: '2026-01-30T10:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getProfile', () => {
    it('should fetch user profile', async () => {
      mockSupabaseClient.setMockResponse(mockProfile);

      const profile = await profilesDB.getProfile('user-123');

      expect(profile).toEqual(mockProfile);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('profiles');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'user-123');
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it('should return null if profile not found', async () => {
      mockSupabaseClient.setMockResponse(null, { code: 'PGRST116' });

      const profile = await profilesDB.getProfile('nonexistent');

      expect(profile).toBeNull();
    });

    it('should throw on other errors', async () => {
      mockSupabaseClient.setMockResponse(null, { code: 'OTHER_ERROR', message: 'DB error' });

      await expect(profilesDB.getProfile('user-123')).rejects.toEqual({
        code: 'OTHER_ERROR',
        message: 'DB error',
      });
    });
  });

  describe('updateProfile', () => {
    it('should update profile', async () => {
      const updates: ProfileUpdate = {
        full_name: 'Updated Name',
        avatar_url: 'https://example.com/new-avatar.jpg',
      };

      const updatedProfile = { ...mockProfile, ...updates };
      mockSupabaseClient.setMockResponse(updatedProfile);

      const result = await profilesDB.updateProfile('user-123', updates);

      expect(result).toEqual(updatedProfile);
      expect(mockSupabaseClient.update).toHaveBeenCalledWith(updates);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'user-123');
    });

    it('should handle update errors', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'Update failed' });

      await expect(profilesDB.updateProfile('user-123', { full_name: 'Test' })).rejects.toEqual({
        message: 'Update failed',
      });
    });
  });

  describe('updatePreferences', () => {
    it('should merge and update preferences', async () => {
      // First call: getProfile
      mockSupabaseClient.setMockResponse(mockProfile);

      const newPreferences = {
        theme: 'light' as const,
        timezone: 'America/New_York',
      };

      const expectedProfile = {
        ...mockProfile,
        preferences: {
          ...mockProfile.preferences,
          ...newPreferences,
        },
      };

      // Second call: updateProfile
      mockSupabaseClient.setMockResponse(expectedProfile);

      const result = await profilesDB.updatePreferences('user-123', newPreferences);

      expect(result.preferences).toEqual(expectedProfile.preferences);
      expect(result.preferences.date_format).toBe('MM/DD/YYYY'); // Should preserve old values
      expect(result.preferences.theme).toBe('light'); // Should update new values
    });

    it('should throw if profile not found', async () => {
      mockSupabaseClient.setMockResponse(null, { code: 'PGRST116' });

      await expect(
        profilesDB.updatePreferences('nonexistent', { theme: 'dark' })
      ).rejects.toThrow('Profile not found');
    });
  });
});
