'use client';

import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { storedHistoryItemSchema } from '@/lib/focus-history/contract';
import { storedAppLimitItemSchema } from '@/lib/app-limit-history/contract';
import { useHistoryDate, useHistoryNames } from './history-format';
import { ContinuationOrigin } from './continuation-origin';

export const sessionSchema = storedHistoryItemSchema.omit({ position: true });
export const limitSchema = storedAppLimitItemSchema.omit({ position: true });
type Session = z.infer<typeof sessionSchema>;
export type Limit = z.infer<typeof limitSchema>;
type Recorded = Session | Limit;
function groups<T extends Recorded>(items: T[]) {
  const sources = new Map<string, { source: T['source']; items: T[] }>();
  for (const item of items) {
    const key = item.source.id.toLowerCase();
    const group = sources.get(key) ?? { source: item.source, items: [] as T[] };
    group.items.push(item); sources.set(key, group);
  }
  // Receipt pages append in order, so an earlier history keeps its readable number.
  return [...sources.values()].map((group, index) => ({ ...group, ordinal: index + 1 }));
}
function DeviceHeading({ source, ordinal }: { source: Recorded['source']; ordinal: number }) {
  const t = useTranslations('focus');
  const names = useHistoryNames();
  return <header><h2 className="text-section-heading">{source.label}</h2><p className="text-xs text-muted-foreground">{t('sourceIdentity', { platform: names.platform(source.platform), number: ordinal })}</p></header>;
}
function ObservationDates({ item }: { item: Recorded }) {
  const t = useTranslations('focus'); const date = useHistoryDate();
  return <div className="text-sm text-muted-foreground space-y-1"><p>{t('observedAt', { date: date(item.event.observedAt) })}</p><p>{t('receivedAt', { date: date(item.receivedAt) })}</p></div>;
}
export function SessionList({ items }: { items: Session[] }) {
  const t = useTranslations('focus'); const date = useHistoryDate(); const names = useHistoryNames();
  return groups(items).map(({ source, ordinal, items: records }) => <section key={source.id} className="space-y-4" aria-label={names.source(source.label, ordinal)}>
    <DeviceHeading source={source} ordinal={ordinal} />
    {records.sort((a, b) => b.event.sequence - a.event.sequence).map(item => <article key={item.event.id} className="rounded-xl border p-4 space-y-2">
      <h3 className="font-medium">{item.event.session.link?.title || t('unlinkedSession')}</h3>
      {item.event.session.link?.projectName && <p>{item.event.session.link.projectName}</p>}
      <p>{t('sessionSummary', { minutes: Math.round(item.event.session.segments.reduce((sum, segment) => sum + segment.end - segment.start, 0) / 60000), rounds: item.event.session.completedRounds })}</p>
      <p className="text-sm">{t('completedAt', { date: date(item.event.session.endedAt) })}</p>
      {item.event.kind === 'focus-session-baseline' && <p className="text-sm">{t('baseline')}</p>}
      <ObservationDates item={item} />
    </article>)}
  </section>);
}
export function LimitList({ items, partial, onUnauthorized }: { items: Limit[]; partial: boolean; onUnauthorized: () => void }) {
  const t = useTranslations('focus'); const names = useHistoryNames();
  const histories = groups(items);
  function originNumbers(sourceId: string, ruleId: string) {
    const history = histories.find(group => group.source.id.toLowerCase() === sourceId.toLowerCase());
    if (!history) return;
    const ruleIndex = [...new Set(history.items.map(item => item.event.ruleId.toLowerCase()))].indexOf(ruleId.toLowerCase());
    return ruleIndex < 0 ? undefined : { history: history.ordinal, rule: ruleIndex + 1 };
  }
  return histories.map(({ source, ordinal, items: records }) => {
    const rules = new Map<string, Limit[]>();
    for (const item of records) { const key = item.event.ruleId.toLowerCase(); rules.set(key, [...(rules.get(key) ?? []), item]); }
    const checkpoint = Math.max(...records.map(item => item.acknowledgedThrough));
    return <section key={source.id} className="space-y-4" aria-label={names.source(source.label, ordinal)}>
      <DeviceHeading source={source} ordinal={ordinal} />
      {[...rules.entries()].map(([ruleId, changes], ruleIndex) => {
        changes.sort((a, b) => b.event.sequence - a.event.sequence);
        const latest = changes[0];
        const label = names.rule(latest.event.after.label, ruleIndex + 1);
        const unconfirmed = latest.event.sequence > checkpoint;
        return <section key={ruleId} className="rounded-xl border p-4 space-y-4" aria-label={label}>
          <header className="space-y-1"><h3 className="font-medium">{label}</h3>
            <p>{t(partial || unconfirmed ? 'latestLoaded' : 'latestConfirmed', { current: latest.event.after.current, best: latest.event.after.best })}</p>
            <p className="text-sm text-muted-foreground">{t('status', { status: t(`statuses.${latest.event.after.status}`) })}</p>
            <ObservationDates item={latest} />
            {unconfirmed && <p className="text-sm text-amber-700 dark:text-amber-300">{t('gap')}</p>}
          </header>
          <ol className="space-y-4">{changes.map(item => <li key={item.event.id} className="border-t pt-4 space-y-2">
            <h4 className="font-medium">{t(`reasons.${item.event.reason}`)}</h4>
            <p>{t('streakChange', { before: item.event.before?.current ?? '—', after: item.event.after.current })}</p>
            <ObservationDates item={item} />
            {item.event.reason === 'baseline' && <p className="text-sm text-muted-foreground">{t('baseline')}</p>}
            <details><summary className="cursor-pointer text-sm font-medium">{t('changeDetails')}</summary>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                {(['label', 'day', 'current', 'best', 'dailyUnlocks', 'minutes', 'usedToday', 'overridesToday', 'status'] as const).map(field => <div key={field} className="contents"><dt>{t(`fields.${field}`)}</dt><dd className="break-words">{field === 'status' ? `${item.event.before ? t(`statuses.${item.event.before.status}`) : '—'} → ${t(`statuses.${item.event.after.status}`)}` : `${item.event.before?.[field] ?? '—'} → ${item.event.after[field] ?? '—'}`}</dd></div>)}
              </dl>
            </details>
            {['limitCreated', 'resumed'].includes(item.event.reason) && <ContinuationOrigin item={item} originNumbers={originNumbers} onUnauthorized={onUnauthorized} />}
          </li>)}</ol>
        </section>;
      })}
    </section>;
  });
}
