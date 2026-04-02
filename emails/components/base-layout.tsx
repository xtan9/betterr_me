import {
  Html, Head, Body, Container, Section, Text, Link, Font,
} from '@react-email/components';
import * as React from 'react';

const STRINGS = {
  en: { unsubscribe: 'Unsubscribe from email notifications', footer: 'BetterR.Me - Your personal productivity companion' },
  zh: { unsubscribe: '取消订阅邮件通知', footer: 'BetterR.Me - 你的个人效率助手' },
  'zh-TW': { unsubscribe: '取消訂閱郵件通知', footer: 'BetterR.Me - 你的個人效率助手' },
} as const;

interface BaseLayoutProps {
  children: React.ReactNode;
  unsubscribeUrl: string;
  locale?: string;
}

export function BaseLayout({ children, unsubscribeUrl, locale = 'en' }: BaseLayoutProps) {
  const s = STRINGS[locale as keyof typeof STRINGS] ?? STRINGS.en;
  return (
    <Html lang={locale}>
      <Head>
        <Font fontFamily="Inter" fallbackFontFamily="Helvetica" />
      </Head>
      <Body style={{ backgroundColor: '#f4f4f5', fontFamily: 'Inter, Helvetica, Arial, sans-serif', margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: '560px', margin: '0 auto', padding: '40px 20px' }}>
          {/* Header with brand */}
          <Section style={{ textAlign: 'center' as const, marginBottom: '32px' }}>
            <Text style={{ fontSize: '24px', fontWeight: 700, color: '#0d9488', margin: 0 }}>
              BetterR.Me
            </Text>
          </Section>

          {/* Content card */}
          <Section style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            padding: '32px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}>
            {children}
          </Section>

          {/* Footer */}
          <Section style={{ textAlign: 'center' as const, marginTop: '32px' }}>
            <Text style={{ fontSize: '12px', color: '#71717a', margin: '0 0 8px 0' }}>
              {s.footer}
            </Text>
            <Link href={unsubscribeUrl} style={{ fontSize: '12px', color: '#a1a1aa', textDecoration: 'underline' }}>
              {s.unsubscribe}
            </Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
