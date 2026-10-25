import { z } from "zod";
import {
  EQUIPMENT,
  EXERCISE_TYPES,
  MUSCLE_GROUPS,
} from "@/lib/constants/enums";

export const exerciseIdSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
export const exerciseVersionSchema = z
  .string()
  .refine(
    (value) =>
      /^[1-9][0-9]{0,18}$/.test(value) &&
      BigInt(value) <= BigInt("9223372036854775807"),
  );
export const exerciseConventionSchema = z.enum([
  "barbell-total",
  "per-dumbbell",
  "selected-load",
  "bodyweight-repetitions",
  "added-load",
  "assistance",
  "seconds",
]);
const instant = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)));
export const customExerciseSchema = z
  .object({
    id: exerciseIdSchema,
    ownerId: exerciseIdSchema,
    name: z.string(),
    equipment: z.enum(EQUIPMENT),
    mode: z.enum(EXERCISE_TYPES),
    convention: exerciseConventionSchema.nullable(),
    primaryMuscle: z.enum(MUSCLE_GROUPS),
    secondaryMuscles: z.array(z.string()).nullable(),
    archivedAt: instant.nullable(),
    version: exerciseVersionSchema,
    createdAt: instant.nullable(),
    updatedAt: instant.nullable(),
  })
  .strict();
export type CustomExercise = z.infer<typeof customExerciseSchema>;
export const exerciseOperationSchema = z.enum([
  "create",
  "update-metadata",
  "archive",
  "restore",
]);
export const exerciseReceiptSchema = z
  .object({
    operationId: exerciseIdSchema,
    operation: exerciseOperationSchema,
    ownerId: exerciseIdSchema,
    exerciseId: exerciseIdSchema,
    acceptedAt: instant,
    definition: customExerciseSchema,
  })
  .strict()
  .refine(
    (value) =>
      value.definition.id === value.exerciseId &&
      value.definition.ownerId === value.ownerId,
  );
export const exerciseRejectionSchema = z
  .object({
    operationId: exerciseIdSchema,
    operation: exerciseOperationSchema,
    ownerId: exerciseIdSchema,
    exerciseId: exerciseIdSchema,
    rejectedAt: instant,
    code: z.enum([
      "version_conflict",
      "invalid_definition",
      "not_found",
      "identity_conflict",
    ]),
    current: customExerciseSchema.optional(),
  })
  .strict()
  .refine((value) =>
    value.code === "version_conflict"
      ? value.current?.id === value.exerciseId &&
        value.current?.ownerId === value.ownerId
      : value.current === undefined,
  );
export const exerciseCapabilitiesSchema = z
  .object({
    protocolVersion: z.literal(1),
    customExercises: z
      .object({ contractVersion: z.literal(1), ready: z.boolean() })
      .strict(),
    completionVersions: z.array(z.number()),
  })
  .strict()
  .refine(
    (value) =>
      JSON.stringify(value.completionVersions) ===
      JSON.stringify(value.customExercises.ready ? [1, 2, 3] : [1, 2]),
  );
export type ExerciseCapabilities = z.infer<typeof exerciseCapabilitiesSchema>;
export const exerciseProtocolSchema = z
  .object({ protocolVersion: z.number().int() })
  .passthrough();
const opaqueObject = z.custom<Record<string, unknown>>(
  (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value),
);
const envelopeShape = z
  .object({
    protocolVersion: z.literal(1),
    operationId: exerciseIdSchema,
    command: opaqueObject,
  })
  .strict();
// Preserve all JSON keys and original values for the SQL first-outcome comparison,
// including keys ordinary object parsers discard. SQL owns domain rejection.
export const exerciseCommandEnvelopeSchema = z.custom<
  z.infer<typeof envelopeShape>
>(
  (value) =>
    envelopeShape.safeParse(value).success &&
    Object.keys(value as object).every((key) =>
      ["protocolVersion", "operationId", "command"].includes(key),
    ),
);

/** First evidence must describe this frozen intention, not just its identity. */
export function exerciseReceiptMatchesRequest(
  receipt: z.infer<typeof exerciseReceiptSchema>,
  request: z.infer<typeof exerciseCommandEnvelopeSchema>,
) {
  const command = request.command,
    definition = receipt.definition;
  if (command.kind === "create") {
    const submitted = opaqueObject.safeParse(command.definition);
    return (
      definition.version === "1" &&
      definition.archivedAt === null &&
      submitted.success &&
      [
        "name",
        "equipment",
        "mode",
        "convention",
        "primaryMuscle",
        "secondaryMuscles",
      ].every(
        (key) =>
          JSON.stringify(definition[key as keyof typeof definition]) ===
          JSON.stringify(submitted.data[key]),
      )
    );
  }
  if (
    !exerciseVersionSchema.safeParse(command.expectedVersion).success ||
    BigInt(definition.version) !==
      BigInt(command.expectedVersion as string) + BigInt(1)
  )
    return false;
  if (command.kind === "archive") return definition.archivedAt !== null;
  if (command.kind === "restore") return definition.archivedAt === null;
  const patch = opaqueObject.safeParse(command.patch);
  return (
    command.kind === "update-metadata" &&
    patch.success &&
    Object.keys(patch.data).length > 0 &&
    Object.entries(patch.data).every(
      ([key, value]) =>
        ["name", "primaryMuscle", "secondaryMuscles"].includes(key) &&
        JSON.stringify(definition[key as keyof typeof definition]) ===
          JSON.stringify(value),
    )
  );
}

export function exerciseConvention(equipment: string, mode: string) {
  if (mode === "weight_reps")
    return equipment === "barbell"
      ? "barbell-total"
      : equipment === "dumbbell"
        ? "per-dumbbell"
        : "selected-load";
  const conventions: Record<
    string,
    z.infer<typeof exerciseConventionSchema>
  > = {
    bodyweight_reps: "bodyweight-repetitions",
    weighted_bodyweight: "added-load",
    assisted_bodyweight: "assistance",
    duration: "seconds",
  };
  return conventions[mode] ?? null;
}
