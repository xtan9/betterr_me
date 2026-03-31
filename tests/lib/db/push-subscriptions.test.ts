import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pushSubscriptionsDB } from '@/lib/db/push-subscriptions';
import { mockSupabaseClient } from '../../setup';
import type { PushSubscription } from '@/lib/db/types';

describe('PushSubscriptionsDB', () => {
  const mockUserId = 'user-123';
  const mockSubscription: PushSubscription = {
    id: 'sub-123',
    user_id: mockUserId,
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8p8REfWM8=',
    auth: 'tBHItJI5svbpC7iq8Q==',
    user_agent: 'Mozilla/5.0',
    created_at: '2026-03-25T10:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSubscriptions', () => {
    it('should fetch all subscriptions for a user', async () => {
      mockSupabaseClient.setMockResponse([mockSubscription]);

      const subscriptions = await pushSubscriptionsDB.getSubscriptions(mockUserId);

      expect(subscriptions).toEqual([mockSubscription]);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('push_subscriptions');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
    });

    it('should return empty array when no subscriptions', async () => {
      mockSupabaseClient.setMockResponse(null);

      const subscriptions = await pushSubscriptionsDB.getSubscriptions(mockUserId);

      expect(subscriptions).toEqual([]);
    });

    it('should throw on database error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'DB error' });

      await expect(pushSubscriptionsDB.getSubscriptions(mockUserId))
        .rejects.toEqual({ message: 'DB error' });
    });
  });

  describe('upsertSubscription', () => {
    it('should upsert and return a subscription', async () => {
      mockSupabaseClient.setMockResponse(mockSubscription);

      const result = await pushSubscriptionsDB.upsertSubscription(mockUserId, {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
        p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8p8REfWM8=',
        auth: 'tBHItJI5svbpC7iq8Q==',
        user_agent: 'Mozilla/5.0',
      });

      expect(result).toEqual(mockSubscription);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('push_subscriptions');
      expect(mockSupabaseClient.upsert).toHaveBeenCalled();
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it('should throw on database error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'Upsert error' });

      await expect(pushSubscriptionsDB.upsertSubscription(mockUserId, {
        endpoint: 'https://example.com',
        p256dh: 'key',
        auth: 'auth',
        user_agent: null,
      })).rejects.toEqual({ message: 'Upsert error' });
    });
  });

  describe('deleteSubscription', () => {
    it('should delete a specific subscription', async () => {
      mockSupabaseClient.setMockResponse(null);

      await pushSubscriptionsDB.deleteSubscription(mockUserId, 'https://fcm.googleapis.com/fcm/send/abc123');

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('push_subscriptions');
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('endpoint', 'https://fcm.googleapis.com/fcm/send/abc123');
    });

    it('should throw on database error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'Delete error' });

      await expect(pushSubscriptionsDB.deleteSubscription(mockUserId, 'https://example.com'))
        .rejects.toEqual({ message: 'Delete error' });
    });
  });

  describe('deleteAllSubscriptions', () => {
    it('should delete all subscriptions for a user', async () => {
      mockSupabaseClient.setMockResponse(null);

      await pushSubscriptionsDB.deleteAllSubscriptions(mockUserId);

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('push_subscriptions');
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
    });

    it('should throw on database error', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'Delete error' });

      await expect(pushSubscriptionsDB.deleteAllSubscriptions(mockUserId))
        .rejects.toEqual({ message: 'Delete error' });
    });
  });
});
