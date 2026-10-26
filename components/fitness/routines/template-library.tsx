"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TemplateRead } from "@/lib/validations/train-templates";
import { prepareTemplateCommand, sendTemplateCommand, resolveTemplateRejection, type TemplateRequest } from "@/lib/fitness/template-command-client";
import { readCurrentTemplate, useTemplateLibrary } from "./use-template-library";
import { TemplateRoutineForm } from "./template-form";
import { TemplateFacts } from "./template-facts";
import { reviewedTemplateDraft } from "./template-draft";

export function TemplateRoutineLibrary({ ownerId, compact = false }: { ownerId: string; compact?: boolean }) {
  const t = useTranslations("routines"), tt = useTranslations("routines.templates"), router = useRouter(), { mutate } = useSWRConfig();
  const library = useTemplateLibrary(ownerId);
  const [editing, setEditing] = useState<TemplateRead | "create" | null>(null), [detail, setDetail] = useState<TemplateRead | null>(null);
  const [failed, setFailed] = useState<"command" | "read" | "start" | "active" | null>(null);
  const [filter, setFilter] = useState("active"), [archive, setArchive] = useState<TemplateRead | null>(null), [busy, setBusy] = useState(false);
  const [review, setReview] = useState<{ operationId: string; command: Record<string, unknown>; current?: TemplateRead } | null>(null);
  const alive = useRef(true), sending = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const send = async (request: () => TemplateRequest) => {
    if (sending.current) return;
    sending.current = true; setBusy(true); setFailed(null);
    try { await sendTemplateCommand(ownerId, request()); if (alive.current) await library.refresh(); }
    catch { if (alive.current) setFailed("command"); }
    finally { sending.current = false; if (alive.current) { setBusy(false); setArchive(null); } }
  };
  const reviewProposal = async () => {
    const row = library.journal; if (!row || row.state !== "rejected" || sending.current) return;
    setBusy(true); setFailed(null);
    try {
      const current = typeof row.request.command.templateId === "string" ? await readCurrentTemplate(ownerId, row.request.command.templateId) : undefined;
      if (alive.current) setReview({ operationId: row.request.operationId, current, command: { ...row.request.command, ...(current ? { expectedVersion: current.template.version } : {}) } });
    } catch { if (alive.current) setFailed("read"); }
    finally { if (alive.current) setBusy(false); }
  };
  const start = async (id: string) => {
    setFailed(null);
    try {
      const response = await fetch(`/api/routines/${id}/start`, { method: "POST", headers: { "X-Train-Owner": ownerId } });
      if (response.status === 409) { if (alive.current) setFailed("active"); return; }
      if (!response.ok) throw new Error("Cannot start");
      if (alive.current) { await mutate("/api/workouts/active"); if (alive.current) router.push("/workouts/active"); }
    } catch { if (alive.current) setFailed("start"); }
  };
  if (library.loading) return <Skeleton className="h-32 w-full" />;
  if (library.error) return <p role="alert">{tt("unavailable")}</p>;
  const rows = library.templates.filter(row => filter === "active" ? row.template.archivedAt === null : row.template.archivedAt !== null);
  const proposed = review ? reviewedTemplateDraft(review.command, review.current?.template) : null;
  const requiresPreview = review?.command.kind === "create" || review?.command.kind === "edit";
  return <div className="space-y-4">
    <div className="flex justify-between items-center"><h2 className="text-section-heading">{t("myRoutines")}</h2>
      {compact ? <Button variant="link" onClick={() => router.push("/workouts/routines")}>{t("manageRoutines")}</Button>
        : <Button onClick={() => setEditing("create")} disabled={!!library.journal}>{t("createRoutine")}</Button>}</div>
    {failed && <p role="alert">{failed === "command" ? tt("commandFailed") : failed === "read" ? tt("unavailable") : t(failed === "active" ? "activeWorkoutExists" : "startError")}</p>}
    {library.journal && <section className="rounded-card border p-3 space-y-2" aria-live="polite"><p>{tt(library.journal.state === "pending" ? "pending" : "conflict")}</p>
      {library.journal.state === "pending" ? <Button disabled={busy} onClick={() => void send(() => library.journal!.request)}>{tt("retry")}</Button>
        : <><Button disabled={busy} onClick={() => void reviewProposal()}>{tt("review")}</Button>
          <Button disabled={busy} onClick={() => { try { resolveTemplateRejection(ownerId); } catch { setFailed("command"); } }}>{tt("keepCurrent")}</Button></>}
    </section>}
    {!compact && <Tabs value={filter} onValueChange={setFilter}><TabsList><TabsTrigger value="active">{tt("active")}</TabsTrigger><TabsTrigger value="archived">{tt("archived")}</TabsTrigger></TabsList></Tabs>}
    {rows.length === 0 && <p>{t("emptyDescription")}</p>}
    <div className="grid gap-card-gap sm:grid-cols-2 lg:grid-cols-3">{(compact ? rows.slice(0, 3) : rows).map(read => <Card key={read.template.id}>
      <CardHeader><CardTitle className="break-words"><h3>{read.template.name}</h3></CardTitle></CardHeader>
      <CardContent className="space-y-3"><p>{t("exerciseCount", { count: read.template.entries.length })}</p>
        {read.startability.reasons.some(reason => reason.code !== "mode_unsupported") && <p className="text-sm text-muted-foreground">{tt("startBlocked")}</p>}
        <div className="flex flex-wrap gap-2"><Button onClick={() => void start(read.template.id)} disabled={read.startability.reasons.some(reason => reason.code !== "mode_unsupported")}>{t("start")}</Button>
          <Button variant="outline" onClick={() => setDetail(read)}>{tt("details")}</Button>
          {!compact && <Button variant="ghost" disabled={!!library.journal} onClick={() => setEditing(structuredClone(read))}>{t("edit")}</Button>}</div>
        {!compact && (read.template.archivedAt === null ? <Button variant="ghost" disabled={busy || !!library.journal} onClick={() => setArchive(read)}>{tt("archive")}</Button>
          : <Button variant="ghost" disabled={busy || !!library.journal} onClick={() => void send(() => prepareTemplateCommand(ownerId, { kind: "restore", templateId: read.template.id, expectedVersion: read.template.version }))}>{tt("restore")}</Button>)}
      </CardContent></Card>)}</div>
    {editing && <TemplateRoutineForm key={editing === "create" ? "create" : `${editing.template.id}:${editing.template.version}`} ownerId={ownerId}
      baseline={editing === "create" ? undefined : editing} selections={library.definitions} onClose={() => setEditing(null)} onSaved={library.refresh} />}
    {detail && <Dialog open onOpenChange={open => { if (!open) setDetail(null); }}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader><DialogTitle>{tt("details")}</DialogTitle><DialogDescription>{tt("targetsNotResults")}</DialogDescription></DialogHeader>
      <h3 className="break-words font-semibold">{detail.template.name}</h3>{detail.template.notes !== null && <p className="whitespace-pre-wrap break-words">{detail.template.notes}</p>}
      {detail.startability.reasons.some(reason => reason.code !== "mode_unsupported") && <p>{tt("startBlocked")}</p>}
      <TemplateFacts template={detail.template} definitions={detail.definitions} /><Button onClick={() => setDetail(null)}>{tt("close")}</Button>
    </DialogContent></Dialog>}
    {review && <Dialog open onOpenChange={open => { if (!open) setReview(null); }}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader><DialogTitle>{tt("review")}</DialogTitle><DialogDescription>{tt("conflict")}</DialogDescription></DialogHeader>
      {review.current && <section><h3>{tt("current")}</h3><p className="break-words">{review.current.template.name}</p>
        {review.current.template.notes !== null && <p className="whitespace-pre-wrap break-words">{review.current.template.notes}</p>}<TemplateFacts template={review.current.template} definitions={review.current.definitions} /></section>}
      {proposed ? <section><h3>{tt("proposed")}</h3><p className="break-words">{proposed.name}</p>{proposed.notes !== null && <p className="whitespace-pre-wrap break-words">{proposed.notes}</p>}
        <TemplateFacts template={proposed} definitions={[...library.definitions.map(row => row.definition), ...(review.current?.definitions ?? [])]} /></section>
        : requiresPreview ? <p>{tt("noMatch")}</p> : <p>{review.command.kind === "archive" ? tt("archive") : review.command.kind === "restore" ? tt("restore") : t("saveAsRoutine")}</p>}
      {review.command.kind === "save-workout-as-template" && <><p>{String(review.command.name)}</p><p>{tt("saveAsDisclosure")}</p></>}
      <div className="flex gap-2 justify-end"><Button variant="ghost" onClick={() => setReview(null)}>{t("deleteCancel")}</Button>
        <Button disabled={busy || requiresPreview && !proposed || library.journal?.request.operationId !== review.operationId || library.journal?.state !== "rejected"} onClick={() => {
          const command = review.command; void send(() => resolveTemplateRejection(ownerId, command)!).then(() => { if (alive.current) setReview(null); });
        }}>{tt("apply")}</Button></div>
    </DialogContent></Dialog>}
    <AlertDialog open={!!archive} onOpenChange={open => { if (!open) setArchive(null); }}><AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{tt("archiveTitle")}</AlertDialogTitle><AlertDialogDescription>{tt("archiveDescription")}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel>{t("deleteCancel")}</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={() => {
        if (archive) { const current = archive.template; void send(() => prepareTemplateCommand(ownerId, { kind: "archive", templateId: current.id, expectedVersion: current.version })); }
      }}>{tt("archive")}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </div>;
}
