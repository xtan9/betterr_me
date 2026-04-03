import { Text, Button, Heading, Preview } from '@react-email/components';
import { BaseLayout } from './components/base-layout';
import * as React from 'react';

const STRINGS = {
  en: {
    preview: (title: string) => `Task due: ${title}`,
    heading: 'Task Due Soon',
    body: (title: string, date: string, time: string) =>
      `Your task "${title}" is due on ${date} at ${time}.`,
    bodyNoTime: (title: string, date: string) =>
      `Your task "${title}" is due on ${date}.`,
    viewTasks: 'View Tasks',
  },
  zh: {
    preview: (title: string) => `任务到期: ${title}`,
    heading: '任务即将到期',
    body: (title: string, date: string, time: string) =>
      `您的任务"${title}"将于 ${date} ${time} 到期。`,
    bodyNoTime: (title: string, date: string) =>
      `您的任务"${title}"将于 ${date} 到期。`,
    viewTasks: '查看任务',
  },
  'zh-TW': {
    preview: (title: string) => `任務到期: ${title}`,
    heading: '任務即將到期',
    body: (title: string, date: string, time: string) =>
      `您的任務「${title}」將於 ${date} ${time} 到期。`,
    bodyNoTime: (title: string, date: string) =>
      `您的任務「${title}」將於 ${date} 到期。`,
    viewTasks: '查看任務',
  },
} as const;

export interface TaskDueProps {
  taskTitle: string;
  dueDate: string;
  dueTime?: string;
  actionUrl: string;
  unsubscribeUrl: string;
  locale?: string;
}

export function TaskDueEmail({
  taskTitle, dueDate, dueTime, actionUrl, unsubscribeUrl, locale = 'en',
}: TaskDueProps) {
  const s = STRINGS[locale as keyof typeof STRINGS] ?? STRINGS.en;
  return (
    <BaseLayout unsubscribeUrl={unsubscribeUrl} locale={locale}>
      <Preview>{s.preview(taskTitle)}</Preview>
      <Heading as="h1" style={{ fontSize: '20px', fontWeight: 600, color: '#18181b', margin: '0 0 16px 0' }}>
        {s.heading}
      </Heading>
      <Text style={{ fontSize: '16px', color: '#3f3f46', lineHeight: '24px', margin: '0 0 24px 0' }}>
        {dueTime ? s.body(taskTitle, dueDate, dueTime) : s.bodyNoTime(taskTitle, dueDate)}
      </Text>
      <Button href={actionUrl} style={{
        backgroundColor: '#0d9488', color: '#ffffff', padding: '12px 24px',
        borderRadius: '8px', fontSize: '14px', fontWeight: 600, textDecoration: 'none',
      }}>
        {s.viewTasks}
      </Button>
    </BaseLayout>
  );
}
