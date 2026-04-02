import { Text, Button, Heading, Preview } from '@react-email/components';
import { BaseLayout } from './components/base-layout';
import * as React from 'react';

const STRINGS = {
  en: {
    preview: (name: string) => `Bill due: ${name}`,
    heading: 'Bill Due Reminder',
    body: (name: string, amount: string, date: string) =>
      `Your bill "${name}" ($${amount}) is due on ${date}.`,
    bodyNoAmount: (name: string, date: string) =>
      `Your bill "${name}" is due on ${date}.`,
    viewBills: 'View Bills',
  },
  zh: {
    preview: (name: string) => `账单到期: ${name}`,
    heading: '账单到期提醒',
    body: (name: string, amount: string, date: string) =>
      `您的账单"${name}"（$${amount}）将于 ${date} 到期。`,
    bodyNoAmount: (name: string, date: string) =>
      `您的账单"${name}"将于 ${date} 到期。`,
    viewBills: '查看账单',
  },
  'zh-TW': {
    preview: (name: string) => `帳單到期: ${name}`,
    heading: '帳單到期提醒',
    body: (name: string, amount: string, date: string) =>
      `您的帳單「${name}」（$${amount}）將於 ${date} 到期。`,
    bodyNoAmount: (name: string, date: string) =>
      `您的帳單「${name}」將於 ${date} 到期。`,
    viewBills: '查看帳單',
  },
} as const;

export interface BillDueProps {
  billName: string;
  amount?: string;
  dueDate: string;
  actionUrl: string;
  unsubscribeUrl: string;
  locale?: string;
}

export function BillDueEmail({
  billName, amount, dueDate, actionUrl, unsubscribeUrl, locale = 'en',
}: BillDueProps) {
  const s = STRINGS[locale as keyof typeof STRINGS] ?? STRINGS.en;
  return (
    <BaseLayout unsubscribeUrl={unsubscribeUrl} locale={locale}>
      <Preview>{s.preview(billName)}</Preview>
      <Heading as="h1" style={{ fontSize: '20px', fontWeight: 600, color: '#18181b', margin: '0 0 16px 0' }}>
        {s.heading}
      </Heading>
      <Text style={{ fontSize: '16px', color: '#3f3f46', lineHeight: '24px', margin: '0 0 24px 0' }}>
        {amount ? s.body(billName, amount, dueDate) : s.bodyNoAmount(billName, dueDate)}
      </Text>
      <Button href={actionUrl} style={{
        backgroundColor: '#0d9488', color: '#ffffff', padding: '12px 24px',
        borderRadius: '8px', fontSize: '14px', fontWeight: 600, textDecoration: 'none',
      }}>
        {s.viewBills}
      </Button>
    </BaseLayout>
  );
}
