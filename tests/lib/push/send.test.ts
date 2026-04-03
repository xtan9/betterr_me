import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mocks
const {
  mockSendNotification,
  mockSetVapidDetails,
  mockGetVapidDetails,
  mockGetNotificationUrl,
  mockGetSubscriptions,
  mockDeleteSubscription,
  mockCreateAdminClient,
} = vi.hoisted(() => ({
  mockSendNotification: vi.fn(),
  mockSetVapidDetails: vi.fn(),
  mockGetVapidDetails: vi.fn(),
  mockGetNotificationUrl: vi.fn(),
  mockGetSubscriptions: vi.fn(),
  mockDeleteSubscription: vi.fn(),
  mockCreateAdminClient: vi.fn(),
}));

vi.mock("web-push", () => ({
  default: {
    sendNotification: mockSendNotification,
    setVapidDetails: mockSetVapidDetails,
  },
  sendNotification: mockSendNotification,
  setVapidDetails: mockSetVapidDetails,
}));

vi.mock("@/lib/push/vapid", () => ({
  getVapidDetails: mockGetVapidDetails,
}));

vi.mock("@/lib/push/notification-urls", () => ({
  getNotificationUrl: mockGetNotificationUrl,
}));

vi.mock("@/lib/db/push-subscriptions", () => ({
  PushSubscriptionsDB: class {
    getSubscriptions = mockGetSubscriptions;
    deleteSubscription = mockDeleteSubscription;
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mockCreateAdminClient,
}));

vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { sendPushNotification, PushPayload } from "@/lib/push/send";

const mockSubs = [
  {
    id: "sub-1",
    user_id: "user-1",
    endpoint: "https://push.example.com/sub1",
    p256dh: "key1",
    auth: "auth1",
    user_agent: null,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "sub-2",
    user_id: "user-1",
    endpoint: "https://push.example.com/sub2",
    p256dh: "key2",
    auth: "auth2",
    user_agent: null,
    created_at: "2026-01-01T00:00:00Z",
  },
];

describe("sendPushNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetVapidDetails.mockReturnValue({
      subject: "mailto:test@test.com",
      publicKey: "pub-key",
      privateKey: "priv-key",
    });
    mockGetNotificationUrl.mockReturnValue("/tasks");
    mockCreateAdminClient.mockReturnValue({});
  });

  const payload: PushPayload = {
    title: "Reminder",
    body: "Time for your task",
    sourceType: "task",
  };

  it("sends to all subscriptions and returns correct counts", async () => {
    mockGetSubscriptions.mockResolvedValue(mockSubs);
    mockSendNotification.mockResolvedValue({});

    const result = await sendPushNotification("user-1", payload);

    expect(result).toEqual({ sent: 2, failed: 0 });
    expect(mockSendNotification).toHaveBeenCalledTimes(2);
  });

  it("cleans up expired subscriptions on 410 response", async () => {
    mockGetSubscriptions.mockResolvedValue([mockSubs[0]]);
    const error410 = new Error("Gone");
    (error410 as unknown as Record<string, unknown>).statusCode = 410;
    mockSendNotification.mockRejectedValue(error410);

    const result = await sendPushNotification("user-1", payload);

    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(mockDeleteSubscription).toHaveBeenCalledWith("user-1", "https://push.example.com/sub1");
  });

  it("increments failed on non-410 errors without throwing", async () => {
    mockGetSubscriptions.mockResolvedValue([mockSubs[0]]);
    mockSendNotification.mockRejectedValue(new Error("Network error"));

    const result = await sendPushNotification("user-1", payload);

    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(mockDeleteSubscription).not.toHaveBeenCalled();
  });

  it("handles mixed success and failure", async () => {
    mockGetSubscriptions.mockResolvedValue(mockSubs);
    mockSendNotification
      .mockResolvedValueOnce({}) // first sub succeeds
      .mockRejectedValueOnce(new Error("fail")); // second fails

    const result = await sendPushNotification("user-1", payload);

    expect(result).toEqual({ sent: 1, failed: 1 });
  });

  it("returns sent:0 failed:0 when user has no subscriptions", async () => {
    mockGetSubscriptions.mockResolvedValue([]);

    const result = await sendPushNotification("user-1", payload);

    expect(result).toEqual({ sent: 0, failed: 0 });
  });

  it("passes correct notification payload to web-push", async () => {
    mockGetSubscriptions.mockResolvedValue([mockSubs[0]]);
    mockSendNotification.mockResolvedValue({});
    mockGetNotificationUrl.mockReturnValue("/calendar?date=2026-04-01");

    await sendPushNotification("user-1", {
      ...payload,
      sourceType: "calendar_event",
      date: "2026-04-01",
    });

    expect(mockSendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://push.example.com/sub1",
      }),
      expect.any(String)
    );

    const sentPayload = JSON.parse(mockSendNotification.mock.calls[0][1]);
    expect(sentPayload).toEqual({
      title: "Reminder",
      body: "Time for your task",
      url: "/calendar?date=2026-04-01",
    });
  });
});
