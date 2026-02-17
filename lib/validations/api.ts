import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";
import { log } from "@/lib/logger";

export interface ValidationSuccess<T> {
  success: true;
  data: T;
}

export interface ValidationFailure {
  success: false;
  response: NextResponse;
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

/**
 * Validate a request body against a Zod schema.
 * Returns a discriminated union: success with parsed data, or failure with a NextResponse.
 */
export function validateRequestBody<T>(
  body: unknown,
  schema: ZodSchema<T>
): ValidationResult<T> {
  const result = schema.safeParse(body);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const { fieldErrors, formErrors } = result.error.flatten();
  const details = {
    ...fieldErrors,
    ...(formErrors.length > 0 && { _errors: formErrors }),
  };
  log.warn("Validation failed", { errors: details });

  return {
    success: false,
    response: NextResponse.json(
      { error: "Validation failed", details },
      { status: 400 }
    ),
  };
}
