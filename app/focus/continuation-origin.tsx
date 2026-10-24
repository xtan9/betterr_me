'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { continuationReadSchema } from '@/lib/app-limit-continuations/contract';
import { useHistoryDate } from './history-format';
import type { Limit } from './recorded-history-lists';

export function ContinuationOrigin({ item, onUnauthorized }: { item: Limit; onUnauthorized: () => void }) {
  const t = useTranslations('focus'); const date = useHistoryDate();
  const [state, setState] = useState<'idle' | 'loading' | 'missing' | 'error' | z.infer<typeof continuationReadSchema>>('idle');
  const request = useRef<{ generation: number; controller?: AbortController }>({ generation: 0 });
  useEffect(() => () => { ++request.current.generation; request.current.controller?.abort(); }, []);
  async function read() {
    const generation = ++request.current.generation;
    const controller = new AbortController(); request.current.controller = controller;
    setState('loading');
    try {
      const query = new URLSearchParams({ destinationSourceId: item.source.id, applyEventId: item.event.id });
      const response = await fetch(`/api/focus/app-limits/continuations?${query}`, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      if (generation !== request.current.generation) return;
      if (response.status === 401) { onUnauthorized(); return; }
      const body = await response.json();
      if (generation !== request.current.generation) return;
      if (response.status === 404 && body?.error === 'not_found') { setState('missing'); return; }
      if (!response.ok) throw new Error('unavailable');
      const value = continuationReadSchema.parse(body);
      if (value.application.state !== 'recorded' || value.application.eventId.toLowerCase() !== item.event.id.toLowerCase()
        || value.application.sequence !== item.event.sequence || value.receipt.destination.source.id.toLowerCase() !== item.source.id.toLowerCase()
        || value.receipt.destination.ruleId.toLowerCase() !== item.event.ruleId.toLowerCase()
        || value.receipt.destination.applyEventId.toLowerCase() !== item.event.id.toLowerCase()) throw new Error('unrelated');
      setState(value);
    } catch { if (generation === request.current.generation) setState('error'); }
  }
  if (typeof state === 'object') return <aside className="rounded-lg bg-muted p-3 space-y-2 text-sm">
    <p className="font-medium">{t('continuedFrom', { device: state.receipt.source.source.label, rule: state.receipt.source.snapshot.label ?? t('unnamedLimit', { id: state.receipt.source.ruleId.slice(-8) }) })}</p>
    <p>{t('continuedDays', { days: state.receipt.restored.current })}</p>
    <p>{t('sourceObservation', { date: date(state.receipt.source.observedAt) })}</p>
    <p>{t('confirmedAt', { date: date(state.receipt.confirmedAt) })}</p>
    <p className="break-all text-muted-foreground">{t('originIdentity', { device: state.receipt.source.source.id, rule: state.receipt.source.ruleId })}</p>
    <p className="text-muted-foreground">{t('independentContinuation')}</p>
  </aside>;
  if (state === 'missing') return <p className="text-sm text-muted-foreground">{t('noContinuation')}</p>;
  return <div className="space-y-2">{state === 'error' && <p role="alert" className="text-sm">{t('lineageError')}</p>}
    <Button variant="outline" size="sm" disabled={state === 'loading'} onClick={() => void read()}>{t(state === 'error' ? 'retryLineage' : state === 'loading' ? 'loading' : 'viewOrigin')}</Button>
  </div>;
}
