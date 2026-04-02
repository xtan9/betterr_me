import { Text, Button, Heading, Preview } from '@react-email/components';
import { BaseLayout } from './components/base-layout';
import * as React from 'react';

const STRINGS = {
  en: {
    preview: (name: string) => `Habit reminder: ${name}`,
    heading: 'Habit Reminder',
    body: (name: string) =>
      `Don't forget to complete your habit "${name}" today!`,
    viewHabits: 'View Habits',
  },
  zh: {
    preview: (name: string) => `习惯提醒: ${name}`,
    heading: '习惯提醒',
    body: (name: string) =>
      `别忘了今天完成你的习惯"${name}"！`,
    viewHabits: '查看习惯',
  },
  'zh-TW': {
    preview: (name: string) => `習慣提醒: ${name}`,
    heading: '習慣提醒',
    body: (name: string) =>
      `別忘了今天完成你的習慣「${name}」！`,
    viewHabits: '查看習慣',
  },
} as const;

export interface HabitNudgeProps {
  habitName: string;
  actionUrl: string;
  unsubscribeUrl: string;
  locale?: string;
}

export function HabitNudgeEmail({
  habitName, actionUrl, unsubscribeUrl, locale = 'en',
}: HabitNudgeProps) {
  const s = STRINGS[locale as keyof typeof STRINGS] ?? STRINGS.en;
  return (
    <BaseLayout unsubscribeUrl={unsubscribeUrl} locale={locale}>
      <Preview>{s.preview(habitName)}</Preview>
      <Heading as="h1" style={{ fontSize: '20px', fontWeight: 600, color: '#18181b', margin: '0 0 16px 0' }}>
        {s.heading}
      </Heading>
      <Text style={{ fontSize: '16px', color: '#3f3f46', lineHeight: '24px', margin: '0 0 24px 0' }}>
        {s.body(habitName)}
      </Text>
      <Button href={actionUrl} style={{
        backgroundColor: '#0d9488', color: '#ffffff', padding: '12px 24px',
        borderRadius: '8px', fontSize: '14px', fontWeight: 600, textDecoration: 'none',
      }}>
        {s.viewHabits}
      </Button>
    </BaseLayout>
  );
}
