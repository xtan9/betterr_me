import { getResendClient } from './resend';
import { EMAIL_TEMPLATES, getSubject } from './templates';
import { getUnsubscribeUrl } from './unsubscribe';
import { createAdminClient } from '@/lib/supabase/admin';
import { ProfilesDB } from '@/lib/db';
import type { ReminderSourceType } from '@/lib/db/types';
import { log } from '@/lib/logger';

// Action URL map per source type
const ACTION_URLS: Record<ReminderSourceType, (date?: string) => string> = {
  calendar_event: (date) => `/calendar${date ? `?date=${date}` : ''}`,
  task: () => '/tasks',
  habit: () => '/habits',
};

export interface ReminderEmailPayload {
  sourceType: ReminderSourceType;
  itemName: string;
  date?: string;      // YYYY-MM-DD for event/task/bill dates
  time?: string;      // HH:MM for event/task times
  amount?: string;    // For bill amounts (formatted string like "$50.00")
}

export interface SendReminderEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  skipped?: boolean;   // true if user has email_notifications_enabled=false
}

export async function sendReminderEmail(
  userId: string,
  payload: ReminderEmailPayload,
): Promise<SendReminderEmailResult> {
  try {
    // Look up user profile (use admin client to bypass RLS since this runs from cron)
    const supabase = createAdminClient();
    const profilesDB = new ProfilesDB(supabase);
    const profile = await profilesDB.getProfile(userId);

    if (!profile) {
      return { success: false, error: 'Profile not found' };
    }

    // Check email preference
    if (!profile.email_notifications_enabled) {
      return { success: true, skipped: true };
    }

    if (!profile.email) {
      return { success: false, error: 'No email address on profile' };
    }

    const locale = (profile as unknown as Record<string, unknown>).locale as string || 'en';
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const unsubscribeUrl = getUnsubscribeUrl(userId);
    const actionPath = ACTION_URLS[payload.sourceType](payload.date);
    const actionUrl = `${baseUrl}${actionPath}`;
    const subject = getSubject(payload.sourceType, locale, payload.itemName);

    // Build template props based on source type
    const templateEntry = EMAIL_TEMPLATES[payload.sourceType];
    let templateProps: Record<string, unknown>;

    switch (payload.sourceType) {
      case 'calendar_event':
        templateProps = {
          eventTitle: payload.itemName,
          eventDate: payload.date || '',
          eventTime: payload.time,
          actionUrl,
          unsubscribeUrl,
          locale,
        };
        break;
      case 'task':
        templateProps = {
          taskTitle: payload.itemName,
          dueDate: payload.date || '',
          dueTime: payload.time,
          actionUrl,
          unsubscribeUrl,
          locale,
        };
        break;
      case 'habit':
        templateProps = {
          habitName: payload.itemName,
          actionUrl,
          unsubscribeUrl,
          locale,
        };
        break;
    }

    // Send via Resend (use function call not JSX for templates)
    const { data, error } = await getResendClient().emails.send({
      from: 'BetterR.Me <reminders@betterr.me>',
      to: [profile.email],
      subject,
      react: templateEntry.component(templateProps as never),
    });

    if (error) {
      log.error('Email send failed', { userId, sourceType: payload.sourceType, error });
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    log.error('sendReminderEmail error', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
