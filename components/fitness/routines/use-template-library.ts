"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import { currentTemplateCommand, observeTemplateCommands } from "@/lib/fitness/template-command-client";
import { templateCapabilitiesSchema, templateDefinitionListSchema, templateListSchema, templateReadSchema, type TemplateRead } from "@/lib/validations/train-templates";

/** Session identity partitions caches; the cookie API independently authenticates
 * every read/write and checks the captured owner on commands. */
export function useTemplateAccess() {
  const [ownerId, setOwnerId] = useState<string | null | undefined>(undefined);
  const [sessionFailed, setSessionFailed] = useState(false);
  useEffect(() => {
    let active = true, events = 0;
    const client = createClient();
    const subscription = client.auth.onAuthStateChange((_event, session) => {
      events++;
      if (active) { setOwnerId(session?.user.id ?? null); setSessionFailed(false); }
    });
    void client.auth.getSession().then(({ data, error }) => {
      if (error) throw error;
      if (active && events === 0) setOwnerId(data.session?.user.id ?? null);
    }).catch(() => { if (active && events === 0) { setOwnerId(null); setSessionFailed(true); } });
    return () => { active = false; subscription.data.subscription.unsubscribe(); };
  }, []);
  const capability = useSWR(ownerId ? ["/api/routines/templates/capabilities", ownerId] : null, async ([path, owner]: [string, string]) => {
    return templateCapabilitiesSchema.parse(await templateGet(path, owner));
  });
  return { ownerId, ready: capability.data?.templates.ready, loading: ownerId === undefined || capability.isLoading,
    error: sessionFailed || ownerId === null || capability.error, refresh: capability.mutate };
}
export async function templateGet(path: string, owner: string): Promise<unknown> {
  const response = await fetch(path, { headers: { Accept: "application/json", "X-Train-Owner": owner } });
  if (!response.ok) throw new Error("Template read unavailable");
  return response.json();
}
export async function readCurrentTemplate(owner: string, id: string): Promise<TemplateRead> {
  const read = templateReadSchema.parse(await templateGet(`/api/routines/templates/${id}`, owner));
  if (read.template.ownerId !== owner || read.template.id !== id) throw new Error("Template owner changed");
  return read;
}
async function allTemplates(owner: string) {
  const templates: TemplateRead[] = []; let after: string | null = null;
  do {
    const page = templateListSchema.parse(await templateGet(`/api/routines/templates${after ? `?after=${after}` : ""}`, owner));
    if (page.templates.some((read, i) => read.template.ownerId !== owner || read.template.id <= (i ? page.templates[i - 1].template.id : after ?? ""))
      || page.templates.length > 100 || page.nextCursor !== null && page.nextCursor !== page.templates.at(-1)?.template.id) throw new Error("Template page unavailable");
    templates.push(...page.templates); after = page.nextCursor;
  } while (after);
  return templates;
}
async function allDefinitions(owner: string) {
  const definitions: ReturnType<typeof templateDefinitionListSchema.parse>["definitions"] = []; let after: string | null = null;
  do {
    const page = templateDefinitionListSchema.parse(await templateGet(`/api/routines/templates/definitions${after ? `?after=${after}` : ""}`, owner));
    const ids = page.definitions.map(row => row.definition.kind === "custom" ? row.definition.definition.id : row.definition.exerciseId);
    if (ids.length > 100 || ids.some((id, i) => id <= (i ? ids[i - 1] : after ?? "")) || page.nextCursor !== null && page.nextCursor !== ids.at(-1)
      || page.definitions.some(row => row.definition.kind === "custom" && (row.definition.definition.ownerId !== owner || row.definition.definition.archivedAt !== row.archivedAt))) throw new Error("Template definitions unavailable");
    definitions.push(...page.definitions); after = page.nextCursor;
  } while (after);
  return definitions;
}
export function useTemplateJournal(owner: string | null | undefined) {
  const text = useSyncExternalStore(observeTemplateCommands, () => {
    try { return owner ? JSON.stringify(currentTemplateCommand(owner)) : "null"; } catch { return "unavailable"; }
  }, () => "null");
  const journal = useMemo(() => text === "unavailable" ? null : JSON.parse(text) as ReturnType<typeof currentTemplateCommand>, [text]);
  return { journal, error: text === "unavailable" };
}
export function useTemplateLibrary(owner: string) {
  const { journal, error: journalError } = useTemplateJournal(owner);
  const templates = useSWR(!journalError ? ["train-template-list", owner] : null, () => allTemplates(owner));
  const definitions = useSWR(!journalError ? ["train-template-definitions", owner] : null, () => allDefinitions(owner));
  return { templates: templates.data?.filter(read => !(journal?.state === "pending" && ["create", "save-workout-as-template"].includes(String(journal.request.command.kind)) && read.template.id === journal.request.operationId)) ?? [],
    definitions: definitions.data ?? [], journal, error: journalError || templates.error || definitions.error,
    loading: templates.isLoading || definitions.isLoading, refresh: async () => { await Promise.all([templates.mutate(), definitions.mutate()]); } };
}
