import { Text, Button, Heading, Preview } from '@react-email/components';
import { BaseLayout } from './components/base-layout';
import * as React from 'react';

const STRINGS = {
  en: {
    preview: (title: string) => `Reminder: ${title}`,
    heading: 'Event Reminder',
    body: (title: string, date: string, time: string) =>
      `Your event "${title}" is coming up on ${date} at ${time}.`,
    bodyAllDay: (title: string, date: string) =>
      `Your all-day event "${title}" is on ${date}.`,
    viewEvent: 'View Event',
  },
  zh: {
    preview: (title: string) => `提醒: ${title}`,
    heading: '活动提醒',
    body: (title: string, date: string, time: string) =>
      `您的活动"${title}"将于 ${date} ${time} 开始。`,
    bodyAllDay: (title: string, date: string) =>
      `您的全天活动"${title}"在 ${date}。`,
    viewEvent: '查看活动',
  },
  'zh-TW': {
    preview: (title: string) => `提醒: ${title}`,
    heading: '活動提醒',
    body: (title: string, date: string, time: string) =>
      `您的活動「${title}」將於 ${date} ${time} 開始。`,
    bodyAllDay: (title: string, date: string) =>
      `您的全天活動「${title}」在 ${date}。`,
    viewEvent: '查看活動',
  },
} as const;

export interface EventReminderProps {
  eventTitle: string;
  eventDate: string;
  eventTime?: string;
  actionUrl: string;
  unsubscribeUrl: string;
  locale?: string;
}

export function EventReminderEmail({
  eventTitle, eventDate, eventTime, actionUrl, unsubscribeUrl, locale = 'en',
}: EventReminderProps) {
  const s = STRINGS[locale as keyof typeof STRINGS] ?? STRINGS.en;
  return (
    <BaseLayout unsubscribeUrl={unsubscribeUrl} locale={locale}>
      <Preview>{s.preview(eventTitle)}</Preview>
      <Heading as="h1" style={{ fontSize: '20px', fontWeight: 600, color: '#18181b', margin: '0 0 16px 0' }}>
        {s.heading}
      </Heading>
      <Text style={{ fontSize: '16px', color: '#3f3f46', lineHeight: '24px', margin: '0 0 24px 0' }}>
        {eventTime ? s.body(eventTitle, eventDate, eventTime) : s.bodyAllDay(eventTitle, eventDate)}
      </Text>
      <Button href={actionUrl} style={{
        backgroundColor: '#0d9488', color: '#ffffff', padding: '12px 24px',
        borderRadius: '8px', fontSize: '14px', fontWeight: 600, textDecoration: 'none',
      }}>
        {s.viewEvent}
      </Button>
    </BaseLayout>
  );
}
