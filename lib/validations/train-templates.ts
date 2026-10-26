import { z } from 'zod';
import { customExerciseSchema, exerciseCommandEnvelopeSchema, exerciseIdSchema as id, exerciseVersionSchema as version } from './train-exercises';
import { EQUIPMENT, EXERCISE_TYPES } from '@/lib/constants/enums';
import { presetWorkoutDefinitionSchema, recordedExerciseDefinitionSchema } from './workout-definition';

const instant = z.string().refine(value => Number.isFinite(Date.parse(value)));
export const rawTemplateMeasurementsSchema = z.object({
  weightKg: z.string().nullable(), reps: z.string().nullable(),
  durationSeconds: z.string().nullable(), distanceMeters: z.string().nullable(),
}).strict();
export const templateTargetSchema = z.object({
  id, kind: z.enum(['working', 'warmup']), measurements: rawTemplateMeasurementsSchema,
}).strict();
export const templateEntrySchema = z.object({
  id, exerciseId: id, notes: z.string().nullable(), restSeconds: z.number().nullable(),
  targets: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('sets'), items: z.array(templateTargetSchema) }).strict(),
    z.object({ kind: z.literal('legacy-unresolved') }).strict(),
  ]),
  legacySource: z.object({ targetSets: z.string().nullable(), measurements: rawTemplateMeasurementsSchema, sortOrder: z.string() }).strict().nullable(),
}).strict();
export const templateSchema = z.object({
  id, ownerId: id, version, name: z.string(), notes: z.string().nullable(),
  archivedAt: instant.nullable(), entries: z.array(templateEntrySchema),
}).strict().refine(value => {
  const entries = value.entries.map(entry => entry.id);
  const targets = value.entries.flatMap(entry => entry.targets.kind === 'sets' ? entry.targets.items.map(target => target.id) : []);
  return new Set([...entries, ...targets]).size === entries.length + targets.length;
});
export type Template = z.infer<typeof templateSchema>;
export const templateDefinitionSchema = z.union([
  z.object({ kind: z.literal('keyed-preset'), exerciseId: id, version, definition: presetWorkoutDefinitionSchema }).strict(),
  z.object({ kind: z.literal('unkeyed-preset'), exerciseId: id, version, name: z.string(), equipment: z.enum(EQUIPMENT), mode: z.enum(EXERCISE_TYPES), convention: z.null() }).strict(),
  z.object({ kind: z.literal('custom'), definition: customExerciseSchema }).strict(),
  z.object({ kind: z.literal('unavailable'), exerciseId: id }).strict(),
]);
export type TemplateDefinition = z.infer<typeof templateDefinitionSchema>;
const reason = z.union([
  z.object({ code: z.literal('template_metadata_invalid'), field: z.enum(['name', 'notes']) }).strict(),
  z.object({ code: z.enum(['legacy_count_unresolved', 'definition_unavailable', 'mode_unsupported', 'target_count_out_of_range', 'rest_out_of_range']), entryId: id }).strict(),
  z.object({ code: z.enum(['target_value_unrepresentable', 'target_value_out_of_range']), entryId: id, targetId: id, field: z.enum(['weightKg', 'reps', 'durationSeconds']) }).strict(),
]);
export const templateReadSchema = z.object({ protocolVersion: z.literal(1), template: templateSchema,
  definitions: z.array(templateDefinitionSchema),
  startability: z.object({ templateVersion: version, ready: z.boolean(), reasons: z.array(reason) }).strict(),
  usage: z.object({ lastPerformedAt: instant.nullable() }).strict(),
}).strict().refine(value => {
  const requested = new Set(value.template.entries.map(entry => entry.exerciseId));
  const definitions = value.definitions.map(definition => definition.kind === 'custom' ? definition.definition.id : definition.exerciseId);
  return value.startability.templateVersion === value.template.version && value.startability.ready === (value.startability.reasons.length === 0)
    && definitions.length === requested.size && new Set(definitions).size === definitions.length
    && definitions.every(id => requested.has(id))
    && value.definitions.every(definition => definition.kind !== 'custom' || definition.definition.ownerId === value.template.ownerId);
});
export type TemplateRead = z.infer<typeof templateReadSchema>;
export const templateListSchema = z.object({ protocolVersion: z.literal(1), templates: z.array(templateReadSchema), nextCursor: id.nullable() }).strict();
export const templateDefinitionListSchema = z.object({ protocolVersion: z.literal(1), definitions: z.array(z.object({ definition: templateDefinitionSchema, archivedAt: instant.nullable() }).strict()), nextCursor: id.nullable() }).strict();
export const templateCapabilitiesSchema = z.object({ protocolVersion: z.literal(1),
  templates: z.object({ contractVersion: z.literal(1), ready: z.boolean() }).strict(),
}).strict();
export const templateCommandEnvelopeSchema = exerciseCommandEnvelopeSchema;
const operation = z.enum(['create', 'edit', 'archive', 'restore', 'save-workout-as-template']);
const evidence = { operationId: id, operation, ownerId: id, templateId: id };
export const templateReceiptSchema = z.object({ ...evidence, acceptedAt: instant, template: templateSchema }).strict()
  .refine(value => value.template.id === value.templateId && value.template.ownerId === value.ownerId);
export const templateRejectionSchema = z.object({ ...evidence, rejectedAt: instant,
  code: z.enum(['version_conflict', 'identity_conflict', 'not_found', 'invalid_template']), current: templateSchema.optional(),
}).strict().refine(value => value.code === 'version_conflict'
  ? value.current?.id === value.templateId && value.current?.ownerId === value.ownerId
  : value.current === undefined);
export const templateAcceptedResponseSchema = z.object({ protocolVersion: z.literal(1), receipt: templateReceiptSchema }).strict();
export const templateRejectedResponseSchema = z.object({ protocolVersion: z.literal(1),
  error: z.object({ code: z.enum(['version_conflict', 'identity_conflict', 'not_found', 'invalid_template']) }).strict(),
  rejection: templateRejectionSchema,
}).strict().refine(value => value.error.code === value.rejection.code);
export const templateRejectionStatus = { version_conflict: 409, identity_conflict: 409, not_found: 404, invalid_template: 422 } as const;

function decimalIdentity(raw: string): string | null {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw)) return null;
  const [mantissa, power = '0'] = raw.replace(/^[+-]/, '').toLowerCase().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  let digits = `${whole}${fraction}`.replace(/^0+/, '');
  if (!digits) return '0';
  let exponent = BigInt(power) - BigInt(fraction.length);
  const trailing = digits.match(/0+$/)?.[0].length ?? 0;
  if (trailing) { digits = digits.slice(0, -trailing); exponent += BigInt(trailing); }
  return `${raw.startsWith('-') ? '-' : ''}${digits}e${exponent}`;
}
/** Decimal equality, not spelling equality or a rounded database number. */
export function exactTemplateNumber(raw: string): number | null {
  const number = Number(raw), identity = decimalIdentity(raw);
  return Number.isFinite(number) && identity !== null && identity === decimalIdentity(String(number)) ? number : null;
}
export const templateOriginSchema = z.object({
  content: templateSchema,
  definitions: z.array(z.object({ entryId: id, definition: recordedExerciseDefinitionSchema }).strict()),
  bindings: z.array(z.object({ entryId: id, workoutEntryId: id,
    targets: z.array(z.object({ targetId: id, workoutSetId: id }).strict()),
  }).strict()),
}).strict().refine(value => {
  const { content, definitions, bindings } = value;
  if (definitions.length !== content.entries.length || bindings.length !== content.entries.length
    || !content.name.trim() || content.name.length > 100 || (content.notes?.length ?? 0) > 2000) return false;
  const ids = new Set([content.id, ...content.entries.flatMap(entry => [entry.id, entry.exerciseId,
    ...(entry.targets.kind === 'sets' ? entry.targets.items.map(target => target.id) : [])])]);
  const captured = new Map<string, string>();
  return content.entries.every((entry, index) => {
    const { definition, entryId } = definitions[index], binding = bindings[index];
    if (entryId !== entry.id || binding.entryId !== entry.id || ids.has(binding.workoutEntryId)
      || (entry.notes?.length ?? 0) > 2000 || entry.targets.kind !== 'sets'
      || entry.targets.items.length < 1 || entry.targets.items.length > 20
      || entry.restSeconds !== null && (!Number.isInteger(entry.restSeconds) || entry.restSeconds < 0 || entry.restSeconds > 600)
      || binding.targets.length !== entry.targets.items.length
      || 'reference' in definition && (definition.reference.exerciseId !== entry.exerciseId
        || definition.reference.kind === 'custom' && definition.reference.ownerId !== content.ownerId)) return false;
    const previous = captured.get(entry.exerciseId), current = JSON.stringify(definition);
    if (previous !== undefined && previous !== current) return false;
    captured.set(entry.exerciseId, current);
    ids.add(binding.workoutEntryId);
    return entry.targets.items.every((target, i) => {
      const mapped = binding.targets[i];
      if (mapped.targetId !== target.id || ids.has(mapped.workoutSetId)) return false;
      ids.add(mapped.workoutSetId);
      const fields = definition.mode === 'duration' ? ['durationSeconds'] as const
        : definition.mode === 'bodyweight_reps' ? ['reps'] as const : ['weightKg', 'reps'] as const;
      return fields.every(field => {
        const raw = target.measurements[field];
        if (raw === null) return true;
        const number = exactTemplateNumber(raw);
        return number !== null && number >= 0 && (field === 'weightKg' || Number.isSafeInteger(number))
          && (field !== 'durationSeconds' || number <= 86400);
      });
    });
  });
});

export type TemplateRequest = z.infer<typeof templateCommandEnvelopeSchema>;
export type TemplateReceipt = z.infer<typeof templateReceiptSchema>;
export type TemplateRejection = z.infer<typeof templateRejectionSchema>;

function targetMatches(target: z.infer<typeof templateTargetSchema> | undefined, authored: Record<string, unknown>) {
  if (!target || target.id !== authored.id || target.kind !== authored.kind || !authored.measurements || typeof authored.measurements !== 'object') return false;
  return Object.entries(authored.measurements).every(([field, number]) => {
    const raw = target.measurements[field as keyof typeof target.measurements];
    return number === null ? raw === null : typeof number === 'number' && typeof raw === 'string' && exactTemplateNumber(raw) === number;
  });
}
function entryMatches(entry: z.infer<typeof templateEntrySchema> | undefined, authored: Record<string, unknown>) {
  return !!entry && entry.id === authored.id && entry.exerciseId === authored.exerciseId && entry.notes === authored.notes
    && entry.restSeconds === authored.restSeconds && entry.legacySource === null && entry.targets.kind === 'sets' && Array.isArray(authored.targets)
    && entry.targets.items.length === authored.targets.length && entry.targets.items.every((target, i) => targetMatches(target, (authored.targets as Record<string, unknown>[])[i]));
}
export function templateReceiptMatchesRequest(receipt: TemplateReceipt, request: TemplateRequest): boolean {
  const command = request.command, content = receipt.template;
  if (receipt.operationId !== request.operationId || receipt.operation !== command.kind
    || receipt.templateId !== (['create', 'save-workout-as-template'].includes(String(command.kind)) ? request.operationId : command.templateId)) return false;
  if (typeof command.expectedVersion === 'string' && (!version.safeParse(command.expectedVersion).success || BigInt(content.version) <= BigInt(command.expectedVersion))) return false;
  if (command.kind === 'create') return content.name === command.name && content.notes === command.notes && content.archivedAt === null
    && Array.isArray(command.entries) && content.entries.length === command.entries.length && content.entries.every((entry, i) => entryMatches(entry, (command.entries as Record<string, unknown>[])[i]));
  if (command.kind === 'save-workout-as-template') return content.name === command.name && content.archivedAt === null;
  if (command.kind === 'archive') return content.archivedAt !== null;
  if (command.kind === 'restore') return content.archivedAt === null;
  // Edits can intentionally apply several changes to the same field. Their
  // final content is server-owned; revision/identity still fence acknowledgement.
  return command.kind === 'edit' && Array.isArray(command.changes) && command.changes.length > 0;
}
