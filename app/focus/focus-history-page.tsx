'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { PageHeader } from '@/components/layouts/page-header';
import { useRecordedHistory } from '@/lib/focus-history/use-recorded-history';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SessionList, LimitList, sessionSchema, limitSchema } from './recorded-history-lists';
import { useHistoryDate } from './history-format';

const sessionPage = z.object({ schemaVersion: z.literal(1), items: z.array(sessionSchema), nextCursor: z.string().min(1).max(100).nullable() }).strict();
const limitPage = z.object({ schemaVersion: z.literal(1), items: z.array(limitSchema), nextCursor: z.string().min(1).max(100).nullable() }).strict();

export function FocusHistoryPage({ ownerId }: { ownerId: string }) {
  return <HistoryOwner key={ownerId} ownerId={ownerId} />;
}

function HistoryOwner({ ownerId }: { ownerId: string }) {
  const t = useTranslations('focus');
  const router = useRouter();
  const [available, setAvailable] = useState(true);
  const invalidate = useCallback(() => { setAvailable(false); router.refresh(); }, [router]);
  useEffect(() => {
    const { data } = createClient().auth.onAuthStateChange((_event, session) => {
      if (session?.user.id !== ownerId) invalidate();
    });
    return () => data.subscription.unsubscribe();
  }, [ownerId, invalidate]);
  return available ? <RecordedHistory onUnauthorized={invalidate} /> : <div className="p-8"><Link href="/auth/login">{t('signIn')}</Link></div>;
}

function RecordedHistory({ onUnauthorized }: { onUnauthorized: () => void }) {
  const t = useTranslations('focus');
  const date = useHistoryDate();
  const sessions = useRecordedHistory('/api/focus/history', sessionPage, onUnauthorized);
  const limits = useRecordedHistory('/api/focus/app-limits/history', limitPage, onUnauthorized);
  const [tab, setTab] = useState('sessions');
  const history = tab === 'sessions' ? sessions : limits;
  return <div className="space-y-8 p-4 sm:p-6 lg:p-8">
    <PageHeader title={t('title')} subtitle={t('subtitle')} actions={<Button variant="outline" disabled={history.loading} onClick={history.refresh}>{t('refresh')}</Button>} />
    <p className="text-sm text-muted-foreground">{t('cloudLimits')}</p>
    {history.loading && <p role="status">{t('loading')}</p>}
    {history.error && <div role="alert">{t(history.items.length ? 'readError' : 'initialReadError')} <Button disabled={history.loading} variant="outline" onClick={history.refresh}>{t('retry')}</Button></div>}
    {history.loaded && !history.items.length && <p>{t(tab === 'sessions' ? 'emptySessions' : 'emptyLimits')}</p>}
    {history.refreshedAt && <p className="text-sm text-muted-foreground">{t('readAt', { date: date(history.refreshedAt) })}</p>}
    {history.nextCursor && <p className="text-sm text-muted-foreground">{t('partial')}</p>}
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList aria-label={t('title')}><TabsTrigger value="sessions">{t('sessions')}</TabsTrigger><TabsTrigger value="limits">{t('limits')}</TabsTrigger></TabsList>
      <TabsContent value="sessions" className="space-y-8 mt-4"><SessionList items={sessions.items} /></TabsContent>
      <TabsContent value="limits" className="space-y-8 mt-4"><LimitList items={limits.items} partial={Boolean(limits.nextCursor)} onUnauthorized={onUnauthorized} /></TabsContent>
    </Tabs>
    {history.nextCursor && <Button variant="outline" disabled={history.loading} onClick={history.more}>{t('loadMore')}</Button>}
  </div>;
}
