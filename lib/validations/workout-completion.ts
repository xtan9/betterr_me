import { z } from 'zod';

/** Inspect the protocol before its version-specific envelope, preserving statuses. */
export const trainCompletionProtocolSchema = z.object({ protocolVersion: z.unknown() }).passthrough();

/** The database validates the frozen document; do not trim, coerce or strip it. */
export const trainCompletionEnvelopeSchema = z.object({
  protocolVersion: z.literal(1),
  operationId: z.string().uuid(),
  // An opaque JSON object must reach SQL byte-for-value unchanged, even keys
  // an ordinary Zod object/record parser strips (such as __proto__).
  completion: z.custom<Record<string, unknown>>(value => z.record(z.unknown()).safeParse(value).success),
}).strict();
