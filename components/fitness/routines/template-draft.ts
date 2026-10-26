import { exactTemplateNumber, templateEntrySchema, templateTargetSchema, templateSchema, type Template, type TemplateDefinition } from "@/lib/validations/train-templates";

export type TemplateDraft = Pick<Template, "name" | "notes" | "entries">;
export type TemplateEntry = Template["entries"][number];
export type TemplateTarget = Extract<TemplateEntry["targets"], { kind: "sets" }>["items"][number];
export const definitionId = (definition: TemplateDefinition) => definition.kind === "custom" ? definition.definition.id : definition.exerciseId;
export function definitionName(definition: TemplateDefinition | undefined, locale: string): string | null {
  if (!definition || definition.kind === "unavailable") return null;
  if (definition.kind === "keyed-preset") return definition.definition.name[locale === "zh" || locale === "zh-TW" ? "zh" : "en"];
  return definition.kind === "custom" ? definition.definition.name : definition.name;
}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function authored(target: TemplateTarget) {
  const measurements = Object.fromEntries(Object.entries(target.measurements).map(([field, raw]) => {
    const value = raw === null ? null : exactTemplateNumber(raw);
    if (raw !== null && (value === null || value < 0 || field === "reps" && (!Number.isSafeInteger(value) || value < 1)
      || field === "durationSeconds" && (!Number.isSafeInteger(value) || value < 1 || value > 86400) || field === "distanceMeters" && value > 999999.99)) throw new Error("Invalid target");
    return [field, value];
  }));
  return { id: target.id, kind: target.kind, measurements };
}
function authoredEntry(entry: TemplateEntry) {
  if (entry.targets.kind !== "sets" || entry.targets.items.length < 1 || entry.targets.items.length > 20) throw new Error("Invalid target count");
  return { id: entry.id, exerciseId: entry.exerciseId, notes: entry.notes, restSeconds: entry.restSeconds, targets: entry.targets.items.map(authored) };
}
/** Only changed fields cross the write boundary. Legacy raw values remain exact. */
export function templateDraftCommand(draft: TemplateDraft, baseline?: Template): Record<string, unknown> | null {
  if ((!baseline || draft.name !== baseline.name) && (!draft.name.trim() || draft.name.trim().length > 100)
    || (!baseline || draft.notes !== baseline.notes) && draft.notes !== null && draft.notes.length > 2000
    || draft.entries.some(entry => {
      const old = baseline?.entries.find(row => row.id === entry.id);
      return (!old || old.notes !== entry.notes) && entry.notes !== null && entry.notes.length > 2000
        || (!old || old.restSeconds !== entry.restSeconds) && entry.restSeconds !== null && (!Number.isInteger(entry.restSeconds) || entry.restSeconds < 0 || entry.restSeconds > 600);
    })) throw new Error("Invalid template");
  if (!baseline) return { kind: "create", name: draft.name.trim(), notes: draft.notes, entries: draft.entries.map(authoredEntry) };
  const changes: Record<string, unknown>[] = [], patch: Record<string, unknown> = {};
  if (draft.name !== baseline.name) patch.name = draft.name.trim();
  if (draft.notes !== baseline.notes) patch.notes = draft.notes;
  if (Object.keys(patch).length) changes.push({ kind: "patch-template", patch });
  for (const old of baseline.entries) if (!draft.entries.some(entry => entry.id === old.id)) changes.push({ kind: "remove-entry", entryId: old.id });
  for (const entry of draft.entries) {
    const old = baseline.entries.find(previous => previous.id === entry.id);
    if (!old) { changes.push({ kind: "add-entry", entry: authoredEntry(entry) }); continue; }
    if (old.exerciseId !== entry.exerciseId || !equal(old.legacySource, entry.legacySource)) throw new Error("Entry identity changed");
    const patch: Record<string, unknown> = {};
    if (old.notes !== entry.notes) patch.notes = entry.notes;
    if (old.restSeconds !== entry.restSeconds) patch.restSeconds = entry.restSeconds;
    if (Object.keys(patch).length) changes.push({ kind: "patch-entry", entryId: entry.id, patch });
    if (entry.targets.kind === "legacy-unresolved") { if (old.targets.kind !== "legacy-unresolved") throw new Error("Invalid targets"); continue; }
    if (old.targets.kind === "legacy-unresolved") { changes.push({ kind: "replace-targets", entryId: entry.id, targets: entry.targets.items.map(authored) }); continue; }
    const original = old.targets.items, targets = entry.targets.items;
    if (targets.length !== original.length && (targets.length < 1 || targets.length > 20)) throw new Error("Invalid target count");
    for (const target of original) if (!targets.some(row => row.id === target.id)) changes.push({ kind: "remove-target", entryId: entry.id, targetId: target.id });
    for (const target of targets) {
      const previous = original.find(row => row.id === target.id);
      if (!previous) { changes.push({ kind: "add-target", entryId: entry.id, target: authored(target) }); continue; }
      const patch: Record<string, unknown> = {}, measurements: Record<string, number | null> = {};
      if (previous.kind !== target.kind) patch.kind = target.kind;
      for (const field of Object.keys(target.measurements) as (keyof TemplateTarget["measurements"])[]) if (target.measurements[field] !== previous.measurements[field]) {
        // Validate only this explicitly changed field, not untouched legacy zero.
        const isolated = { ...target, measurements: { weightKg: null, reps: null, durationSeconds: null, distanceMeters: null, [field]: target.measurements[field] } };
        measurements[field] = authored(isolated).measurements[field];
      }
      if (Object.keys(measurements).length) patch.measurements = measurements;
      if (Object.keys(patch).length) changes.push({ kind: "patch-target", entryId: entry.id, targetId: target.id, patch });
    }
    const appended = [...original.filter(row => targets.some(t => t.id === row.id)), ...targets.filter(row => !original.some(t => t.id === row.id))].map(row => row.id);
    if (!equal(appended, targets.map(row => row.id))) changes.push({ kind: "order-targets", entryId: entry.id, targetIds: targets.map(row => row.id) });
  }
  const appended = [...baseline.entries.filter(entry => draft.entries.some(row => row.id === entry.id)), ...draft.entries.filter(entry => !baseline.entries.some(row => row.id === entry.id))].map(entry => entry.id);
  if (!equal(appended, draft.entries.map(entry => entry.id))) changes.push({ kind: "order-entries", entryIds: draft.entries.map(entry => entry.id) });
  return changes.length ? { kind: "edit", templateId: baseline.id, expectedVersion: baseline.version, changes } : null;
}

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
function rawTarget(value: unknown): TemplateTarget {
  if (!object(value) || !object(value.measurements)) throw new Error("Invalid target");
  const raw = Object.fromEntries(Object.entries(value.measurements).map(([field, number]) => {
    if (number !== null && (typeof number !== "number" || !Number.isFinite(number))) throw new Error("Invalid measurement");
    return [field, number === null ? null : String(number)];
  }));
  const target = templateTargetSchema.parse({ ...value, measurements: raw }); authored(target); return target;
}
function rawEntry(value: unknown): TemplateEntry {
  if (!object(value) || !Array.isArray(value.targets)) throw new Error("Invalid entry");
  return templateEntrySchema.parse({ ...value, targets: { kind: "sets", items: value.targets.map(rawTarget) }, legacySource: null });
}
/** Review is a local projection of the exact retained request on fresh content.
 * Missing identities/order never become guessed replacements. */
export function reviewedTemplateDraft(command: Record<string, unknown>, current?: Template): TemplateDraft | null {
  try {
    if (command.kind === "create") {
      if (typeof command.name !== "string" || command.notes !== null && typeof command.notes !== "string" || !Array.isArray(command.entries)) return null;
      const next = { name: command.name, notes: command.notes as string | null, entries: command.entries.map(rawEntry) };
      templateDraftCommand(next); return next;
    }
    if (command.kind !== "edit" || !current || command.templateId !== current.id || !Array.isArray(command.changes)) return null;
    const next = structuredClone(current);
    const order = <T extends { id: string }>(rows: T[], ids: unknown): T[] => {
      if (!Array.isArray(ids) || ids.length !== rows.length || new Set(ids).size !== rows.length || rows.some(row => !ids.includes(row.id))) throw new Error("Order changed");
      return ids.map(id => rows.find(row => row.id === id)!);
    };
    for (const change of command.changes) {
      if (!object(change)) return null;
      if (change.kind === "patch-template") {
        if (!object(change.patch) || Object.keys(change.patch).some(key => !["name", "notes"].includes(key))) return null;
        Object.assign(next, change.patch); continue;
      }
      if (change.kind === "add-entry") { next.entries.push(rawEntry(change.entry)); continue; }
      if (change.kind === "order-entries") { next.entries = order(next.entries, change.entryIds); continue; }
      const entry = next.entries.find(entry => entry.id === change.entryId); if (!entry) return null;
      if (change.kind === "remove-entry") { next.entries = next.entries.filter(row => row !== entry); continue; }
      if (change.kind === "patch-entry") {
        if (!object(change.patch) || Object.keys(change.patch).some(key => !["notes", "restSeconds"].includes(key))) return null;
        Object.assign(entry, change.patch); continue;
      }
      if (change.kind === "replace-targets") {
        if (entry.targets.kind !== "legacy-unresolved" || !Array.isArray(change.targets)) return null;
        entry.targets = { kind: "sets", items: change.targets.map(rawTarget) }; continue;
      }
      if (entry.targets.kind !== "sets") return null;
      if (change.kind === "add-target") { entry.targets.items.push(rawTarget(change.target)); continue; }
      if (change.kind === "order-targets") { entry.targets.items = order(entry.targets.items, change.targetIds); continue; }
      const target = entry.targets.items.find(target => target.id === change.targetId); if (!target) return null;
      if (change.kind === "remove-target") { entry.targets.items = entry.targets.items.filter(row => row !== target); continue; }
      if (change.kind !== "patch-target" || !object(change.patch) || Object.keys(change.patch).some(key => !["kind", "measurements"].includes(key))) return null;
      if (change.patch.kind !== undefined) {
        if (change.patch.kind !== "working" && change.patch.kind !== "warmup") return null;
        target.kind = change.patch.kind;
      }
      if (change.patch.measurements !== undefined) {
        if (!object(change.patch.measurements)) return null;
        const parsed = rawTarget({ id: target.id, kind: target.kind, measurements: { weightKg: null, reps: null, durationSeconds: null, distanceMeters: null, ...change.patch.measurements } });
        for (const field of Object.keys(change.patch.measurements) as (keyof TemplateTarget["measurements"])[]) target.measurements[field] = parsed.measurements[field];
      }
    }
    templateSchema.parse(next); templateDraftCommand(next, current); return next;
  } catch { return null; }
}
