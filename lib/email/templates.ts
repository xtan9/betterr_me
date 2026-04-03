import { ReminderSourceType } from '@/lib/db/types';
import { EventReminderEmail } from '@/emails/event-reminder';
import { TaskDueEmail } from '@/emails/task-due';
import { HabitNudgeEmail } from '@/emails/habit-nudge';
import { BillDueEmail } from '@/emails/bill-due';

export const EMAIL_TEMPLATES = {
  calendar_event: {
    component: EventReminderEmail,
    defaultSubject: {
      en: 'Event Reminder',
      zh: '活动提醒',
      'zh-TW': '活動提醒',
    },
  },
  task: {
    component: TaskDueEmail,
    defaultSubject: {
      en: 'Task Due Soon',
      zh: '任务即将到期',
      'zh-TW': '任務即將到期',
    },
  },
  habit: {
    component: HabitNudgeEmail,
    defaultSubject: {
      en: 'Habit Reminder',
      zh: '习惯提醒',
      'zh-TW': '習慣提醒',
    },
  },
  bill: {
    component: BillDueEmail,
    defaultSubject: {
      en: 'Bill Due Reminder',
      zh: '账单到期提醒',
      'zh-TW': '帳單到期提醒',
    },
  },
} as const satisfies Record<ReminderSourceType, { component: unknown; defaultSubject: Record<string, string> }>;

export type EmailTemplateKey = keyof typeof EMAIL_TEMPLATES;

export function getSubject(sourceType: ReminderSourceType, locale: string, itemName?: string): string {
  const template = EMAIL_TEMPLATES[sourceType];
  const subject = template.defaultSubject[locale as keyof typeof template.defaultSubject]
    ?? template.defaultSubject.en;
  return itemName ? `${subject}: ${itemName}` : subject;
}
