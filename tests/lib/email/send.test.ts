import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mock functions
const { mockSend, mockGetProfile, mockComponent } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockGetProfile: vi.fn(),
  mockComponent: vi.fn(() => 'rendered-email'),
}));

// Mock resend
vi.mock('@/lib/email/resend', () => ({
  getResendClient: () => ({ emails: { send: mockSend } }),
}));

// Mock admin client
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({})),
}));

// Mock profiles DB
vi.mock('@/lib/db', () => ({
  ProfilesDB: class {
    getProfile = mockGetProfile;
  },
}));

// Mock unsubscribe
vi.mock('@/lib/email/unsubscribe', () => ({
  getUnsubscribeUrl: vi.fn(() => 'http://localhost:3000/api/email/unsubscribe?token=abc'),
}));

// Mock templates
vi.mock('@/lib/email/templates', () => ({
  EMAIL_TEMPLATES: {
    calendar_event: { component: mockComponent, defaultSubject: { en: 'Event Reminder' } },
    task: { component: mockComponent, defaultSubject: { en: 'Task Due Soon' } },
    habit: { component: mockComponent, defaultSubject: { en: 'Habit Reminder' } },
    bill: { component: mockComponent, defaultSubject: { en: 'Bill Due Reminder' } },
  },
  getSubject: vi.fn((sourceType: string, _locale: string, itemName?: string) => {
    const subjects: Record<string, string> = {
      calendar_event: 'Event Reminder',
      task: 'Task Due Soon',
      habit: 'Habit Reminder',
      bill: 'Bill Due Reminder',
    };
    const base = subjects[sourceType] || 'Reminder';
    return itemName ? `${base}: ${itemName}` : base;
  }),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { sendReminderEmail } from '@/lib/email/send';

const baseProfile = {
  id: 'user-123',
  email: 'test@example.com',
  full_name: 'Test User',
  email_notifications_enabled: true,
  timezone: 'America/New_York',
  preferences: { theme: 'system', week_start_day: 0, date_format: 'YYYY-MM-DD', weight_unit: 'kg' as const },
  avatar_url: null,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

describe('sendReminderEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  });

  it('returns skipped when email_notifications_enabled is false', async () => {
    mockGetProfile.mockResolvedValue({ ...baseProfile, email_notifications_enabled: false });

    const result = await sendReminderEmail('user-123', {
      sourceType: 'task',
      itemName: 'Test Task',
    });

    expect(result).toEqual({ success: true, skipped: true });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns error when profile is not found', async () => {
    mockGetProfile.mockResolvedValue(null);

    const result = await sendReminderEmail('user-123', {
      sourceType: 'task',
      itemName: 'Test Task',
    });

    expect(result).toEqual({ success: false, error: 'Profile not found' });
  });

  it('returns error when email is missing', async () => {
    mockGetProfile.mockResolvedValue({ ...baseProfile, email: null });

    const result = await sendReminderEmail('user-123', {
      sourceType: 'task',
      itemName: 'Test Task',
    });

    expect(result).toEqual({ success: false, error: 'No email address on profile' });
  });

  it('sends email for calendar_event with correct params', async () => {
    mockGetProfile.mockResolvedValue(baseProfile);
    mockSend.mockResolvedValue({ data: { id: 'msg-001' }, error: null });

    const result = await sendReminderEmail('user-123', {
      sourceType: 'calendar_event',
      itemName: 'Team Meeting',
      date: '2024-03-15',
      time: '14:00',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg-001');
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'BetterR.Me <reminders@betterr.me>',
        to: ['test@example.com'],
        subject: 'Event Reminder: Team Meeting',
      })
    );
  });

  it('sends email for task type', async () => {
    mockGetProfile.mockResolvedValue(baseProfile);
    mockSend.mockResolvedValue({ data: { id: 'msg-002' }, error: null });

    const result = await sendReminderEmail('user-123', {
      sourceType: 'task',
      itemName: 'Finish Report',
      date: '2024-03-15',
    });

    expect(result.success).toBe(true);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Task Due Soon: Finish Report',
      })
    );
  });

  it('sends email for habit type', async () => {
    mockGetProfile.mockResolvedValue(baseProfile);
    mockSend.mockResolvedValue({ data: { id: 'msg-003' }, error: null });

    const result = await sendReminderEmail('user-123', {
      sourceType: 'habit',
      itemName: 'Morning Run',
    });

    expect(result.success).toBe(true);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Habit Reminder: Morning Run',
      })
    );
  });

  it('sends email for bill type', async () => {
    mockGetProfile.mockResolvedValue(baseProfile);
    mockSend.mockResolvedValue({ data: { id: 'msg-004' }, error: null });

    const result = await sendReminderEmail('user-123', {
      sourceType: 'bill',
      itemName: 'Electric Bill',
      date: '2024-03-20',
      amount: '$150.00',
    });

    expect(result.success).toBe(true);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Bill Due Reminder: Electric Bill',
      })
    );
  });

  it('returns error when Resend returns an error', async () => {
    mockGetProfile.mockResolvedValue(baseProfile);
    mockSend.mockResolvedValue({ data: null, error: { message: 'API rate limited' } });

    const result = await sendReminderEmail('user-123', {
      sourceType: 'task',
      itemName: 'Test Task',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('API rate limited');
  });

  it('returns error when an exception is thrown', async () => {
    mockGetProfile.mockRejectedValue(new Error('DB connection failed'));

    const result = await sendReminderEmail('user-123', {
      sourceType: 'task',
      itemName: 'Test Task',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('DB connection failed');
  });
});
