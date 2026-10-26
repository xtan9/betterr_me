"use client";

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { weightInputText } from '@/lib/fitness/units';
import type { PriorPerformed } from '@/lib/validations/train-prior-results';
import { webPriorReference, webPriorResponseMatchesRequest, webPriorResponseSchema, type WebPriorRead } from '@/lib/validations/web-prior-results';
import type { WeightUnit } from '@/lib/db/types';

type PickerProps = {
  read: WebPriorRead; weightUnit: WeightUnit; disabled: boolean; onUse: (performed: PriorPerformed) => Promise<void>;
};
export function PriorResultsPicker(props: PickerProps) {
  // A new accepted active-workout read replaces cached references, including a
  // correction, deletion or account/target change while the picker was open.
  return <PriorResultsSession key={JSON.stringify(props.read)} {...props} />;
}
function PriorResultsSession({ read, weightUnit, disabled, onUse }: PickerProps) {
  const t = useTranslations('workouts.prior');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(read.page);
  const [known, setKnown] = useState(() => webPriorReference(read.page, read.request.target));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const load = async (continueSearch: boolean) => {
    setBusy(true); setFailed(false);
    try {
      const response = await fetch('/api/workouts/prior-results', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...read.request, protocolVersion: page.protocolVersion, before: continueSearch && page.status === 'searching' ? page.nextCursor : null }) });
      const parsed = webPriorResponseSchema.safeParse(await response.json());
      if (response.status !== 200 || !parsed.success || !webPriorResponseMatchesRequest(parsed.data, read.request)) throw new Error('Prior read unavailable');
      setPage(parsed.data);
      if (parsed.data.status === 'found') setKnown(webPriorReference(parsed.data, read.request.target));
      else if (parsed.data.protocolVersion === 2 && parsed.data.status === 'searching'
        || parsed.data.status === 'exhausted' || parsed.data.status === 'unavailable' && parsed.data.reason !== 'service_unavailable') setKnown(null);
    } catch { setFailed(true); }
    finally { setBusy(false); }
  };
  const use = async (performed: PriorPerformed) => {
    setBusy(true); setFailed(false);
    try { await onUse(performed); setOpen(false); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  };
  const measurement = (value: PriorPerformed) => {
    if (value.mode === 'duration') return t('seconds', { value: value.durationSeconds });
    if (value.mode === 'bodyweight_reps') return t('repetitions', { value: value.reps });
    const kg = value.mode === 'weight_reps' ? value.weightKg : value.mode === 'weighted_bodyweight' ? value.addedWeightKg : value.assistanceKg;
    return `${t(value.mode === 'assisted_bodyweight' ? 'assistance' : value.mode === 'weighted_bodyweight' ? 'addedLoad' : 'load')}: ${weightInputText(kg, weightUnit)} ${weightUnit} · ${t('repetitions', { value: value.reps })}`;
  };
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button type="button" variant="ghost" size="sm" className="h-auto whitespace-normal text-caption">{t('title')}</Button></DialogTrigger>
    <DialogContent className="max-h-[85vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{t('title')}</DialogTitle><DialogDescription>{t('description')}</DialogDescription></DialogHeader>
      {failed && <p role="alert">{t('failed')}</p>}
      {known && <section aria-label={t('saved')} className="space-y-4">
        <p>{t('saved')} · {known.workoutDay}</p>
        {known.groups.map((group, index) => <section key={group.exerciseEntryId} className="space-y-2 rounded border p-3">
          <h3>{typeof group.definition.name === 'string' ? group.definition.name : locale.startsWith('zh') ? group.definition.name.zh : group.definition.name.en}</h3>
          <p>{t('occurrence', { value: index + 1 })}</p>
          {group.sets.map(set => <div key={set.setId} className="space-y-1 border-t pt-2">
            <p>{t(set.performed.kind === 'warmup' ? 'warmup' : 'working')}</p>
            <p>{measurement(set.performed)}</p>
            <Button type="button" variant="outline" disabled={busy || disabled} onClick={() => void use(set.performed)}>{t('use')}</Button>
          </div>)}
        </section>)}
      </section>}
      {page.status === 'searching' && <><p>{t('searching')}</p><Button disabled={busy} onClick={() => void load(true)}>{t('continue')}</Button></>}
      {page.status === 'exhausted' && !known && <p>{t('none')}</p>}
      {page.status === 'unavailable' && <p>{t('unavailable')}</p>}
      <Button variant="ghost" disabled={busy} onClick={() => void load(false)}>{t('refresh')}</Button>
    </DialogContent>
  </Dialog>;
}
