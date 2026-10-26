"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { prepareTemplateCommand, sendTemplateCommand, type TemplateRequest } from "@/lib/fitness/template-command-client";
import type { TemplateRead, TemplateDefinition } from "@/lib/validations/train-templates";
import { definitionId, definitionName, templateDraftCommand, type TemplateDraft } from "./template-draft";
import { blankTemplateTarget, shiftRow, TemplateEntryEditor } from "./template-entry-editor";

export function TemplateRoutineForm({ ownerId, baseline, selections, onClose, onSaved }: {
  ownerId: string; baseline?: TemplateRead; selections: { definition: TemplateDefinition; archivedAt: string | null }[]; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const t = useTranslations("routines"), tt = useTranslations("routines.templates"), locale = useLocale();
  const [draft, setDraft] = useState<TemplateDraft>(() => structuredClone(baseline?.template ?? { name: "", notes: null, entries: [] }));
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false), [submitted, setSubmitted] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const sending = useRef(false), captured = useRef<TemplateRequest | null>(null), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const save = async () => {
    if (sending.current) return;
    sending.current = true; setBusy(true); setFailed(false);
    try {
      const command = captured.current?.command ?? templateDraftCommand(draft, baseline?.template);
      if (command) {
        const request = captured.current ?? prepareTemplateCommand(ownerId, command);
        captured.current = request; setSubmitted(true); await sendTemplateCommand(ownerId, request);
      }
      if (alive.current) { await onSaved(); if (alive.current) onClose(); }
    } catch { if (alive.current) setFailed(true); }
    finally { sending.current = false; if (alive.current) setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
    <DialogHeader><DialogTitle>{t(baseline ? "editRoutine" : "createRoutine")}</DialogTitle><DialogDescription>{tt("targetsNotResults")}</DialogDescription></DialogHeader>
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
      <label className="block space-y-1">{t("name")}<Input value={draft.name} disabled={submitted} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <label className="block space-y-1">{t("notes")}<Textarea value={draft.notes ?? ""} disabled={submitted} onChange={event => setDraft({ ...draft, notes: event.target.value || null })} /></label>
      {draft.entries.map((entry, index) => <TemplateEntryEditor key={entry.id} entry={entry} index={index} count={draft.entries.length} disabled={submitted}
        definition={[...selections.map(row => row.definition), ...(baseline?.definitions ?? [])].find(row => definitionId(row) === entry.exerciseId)}
        update={value => setDraft(previous => ({ ...previous, entries: previous.entries.map(row => row.id === value.id ? value : row) }))}
        remove={() => setDraft(previous => ({ ...previous, entries: previous.entries.filter(row => row.id !== entry.id) }))}
        move={direction => setDraft(previous => ({ ...previous, entries: shiftRow(previous.entries, index, direction) }))} />)}
      <Button type="button" variant="outline" disabled={submitted} onClick={() => setSelecting(value => !value)}>{t("addExercise")}</Button>
      {selecting && <div className="space-y-2">{selections.filter(row => row.archivedAt === null && row.definition.kind !== "unavailable").map(({ definition }) => <Button type="button" variant="outline" disabled={submitted} key={definitionId(definition)} onClick={() => {
        setDraft(previous => ({ ...previous, entries: [...previous.entries, { id: crypto.randomUUID(), exerciseId: definitionId(definition), notes: null, restSeconds: 90, legacySource: null,
          targets: { kind: "sets", items: [blankTemplateTarget(), blankTemplateTarget(), blankTemplateTarget()] } }] })); setSelecting(false);
      }}>{definitionName(definition, locale) ?? tt("unknown")}</Button>)}</div>}
      {submitted && <p role="status">{tt("pending")}</p>}
      {failed && <p role="alert">{submitted ? tt("commandFailed") : t("measurementInvalid")}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>{t("deleteCancel")}</Button>
        <Button type="submit" disabled={busy}>{submitted ? tt("retry") : t("save")}</Button></div>
    </form>
  </DialogContent></Dialog>;
}
