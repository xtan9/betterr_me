"use client";

import { useEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { DeletionError, executeDeletion, previewDeletion, type DeletionCommand, type DeletionPreview } from '@/lib/deletion/client';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

const en = { task: 'Delete Task', project: 'Delete Project', cancel: 'Cancel', loading: 'Loading deletion details…', history: 'Past history is kept. This cannot be undone.', children: 'Tasks in this project will become standalone tasks in the same section.', count: 'Tasks kept', blocks: 'Future blocks to remove', protected: 'Protected block — included in deletion', reminders: 'Reminders to remove', kept: 'Commitments kept', retry: 'Retry deletion', review: 'Review latest details', conflict: 'This item or its schedule changed. Review the latest details.', unavailable: 'Deletion could not be confirmed. Try again.', unsupported: 'Use the routine controls for repeating tasks.', missing: 'This item is no longer available.', push: 'Push notification', email: 'Email' };
const zh: typeof en = { task: '删除任务', project: '删除项目', cancel: '取消', loading: '正在加载删除详情…', history: '过往历史会保留。此操作无法撤销。', children: '此项目中的任务将成为同一分区中的独立任务。', count: '保留的任务数量', blocks: '将移除的未来时段', protected: '固定时段 — 包含在删除范围内', reminders: '将移除的提醒', kept: '保留的日程', retry: '重试删除', review: '查看最新详情', conflict: '此项目或日程已更改，请重新查看。', unavailable: '无法确认删除结果，请重试。', unsupported: '请使用例行安排操作修改重复任务。', missing: '此项目已不可用。', push: '推送通知', email: '电子邮件' };

export function ReviewedDeleteDialog({ open, onOpenChange, kind, id, title, onSuccess }: {
  open: boolean; onOpenChange: (open: boolean) => void; kind: DeletionPreview['kind']; id: string; title: string; onSuccess?: () => void;
}) {
  const locale = useLocale(), t = locale.startsWith('zh') ? zh : en;
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  const [pending, setPending] = useState<DeletionCommand | null>(null);
  const flight = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setBusy(true); setPreview(null); setError(null);
    previewDeletion(createClient(), kind, id).then(value => { if (active) setPreview(value); })
      .catch(failure => { if (active) setError(failure instanceof DeletionError ? failure.reason : 'unavailable'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [open, kind, id, revision]);
  function close(next: boolean) { if (!flight.current && !pending && !busy) onOpenChange(next); }
  async function remove() {
    if (flight.current || (!pending && (!preview || error))) return;
    const command = pending ?? { operationId: crypto.randomUUID(), preview: preview! };
    flight.current = true; setPending(command); setBusy(true); setError(null);
    try {
      await executeDeletion(createClient(), command);
      setPending(null); onOpenChange(false); onSuccess?.();
    } catch (failure) {
      const reason = failure instanceof DeletionError ? failure.reason : 'unavailable';
      setError(reason);
      if (reason !== 'unavailable') { setPending(null); setPreview(null); }
    } finally { flight.current = false; setBusy(false); }
  }
  return <AlertDialog open={open} onOpenChange={close}>
    <AlertDialogContent ref={dialogRef} tabIndex={-1} onOpenAutoFocus={event => {
      event.preventDefault();
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialogRef.current?.focus();
    }} onCloseAutoFocus={event => {
      event.preventDefault();
      if (openerRef.current?.isConnected) openerRef.current.focus();
    }} className="max-h-[85vh] overflow-y-auto">
      <AlertDialogHeader>
        <AlertDialogTitle>{t[kind]}</AlertDialogTitle>
        <AlertDialogDescription>{kind === 'project' ? t.children : t.history}</AlertDialogDescription>
      </AlertDialogHeader>
      <p className="font-medium">{preview?.title ?? title}</p>
      {kind === 'project' && <p>{t.history}</p>}
      {busy && !pending && <p role="status">{t.loading}</p>}
      {preview && (kind === 'project' ? <p>{t.count}: {preview.children.length}</p> : <div className="space-y-3">
        <p>{t.blocks}: {preview.plan.length}</p>
        {preview.plan.map(event => <div key={event.id}><p>{event.title}</p><p>{event.start_date} {event.start_time} – {event.end_date} {event.end_time} ({event.timezone})</p>{event.is_protected && <p className="text-destructive">{t.protected}</p>}</div>)}
        {!!preview.reminders.length && <><p>{t.reminders}</p>{preview.reminders.map(reminder => <p key={reminder.id}>{new Date(reminder.fire_at).toLocaleString(locale)} ({reminder.channels.map(channel => channel === 'push' ? t.push : channel === 'email' ? t.email : channel).join(', ')})</p>)}</>}
        {!!preview.retained.length && <p>{t.kept}: {preview.retained.map(event => event.title).join(', ')}</p>}
      </div>)}
      {error && <p role="alert">{error === 'conflict' ? t.conflict : error === 'unsupported' ? t.unsupported : error === 'not-found' ? t.missing : t.unavailable}</p>}
      <AlertDialogFooter>
        <Button variant="outline" disabled={busy || !!pending} onClick={() => close(false)}>{t.cancel}</Button>
        {error && !pending && <Button disabled={busy} onClick={() => setRevision(value => value + 1)}>{t.review}</Button>}
        <Button variant="destructive" disabled={busy || (!pending && (!preview || !!error))} onClick={() => void remove()}>{pending ? t.retry : t[kind]}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
