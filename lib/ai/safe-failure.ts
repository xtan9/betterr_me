const SAFE_NAMES = new Set([
  "AbortError",
  "AI_APICallError",
  "AI_InvalidResponseDataError",
  "AI_JSONParseError",
  "AI_NoObjectGeneratedError",
  "AI_RetryError",
  "Error",
  "TypeError",
  "ZodError",
]);

const SAFE_CODES = new Set([
  "authentication_error",
  "connection_error",
  "content_filter",
  "context_length_exceeded",
  "insufficient_quota",
  "invalid_api_key",
  "invalid_model",
  "invalid_response",
  "model_not_found",
  "permission_denied",
  "rate_limit_exceeded",
  "timeout",
  "unsupported_model",
]);

function read(error: object, property: string): unknown {
  try {
    return Reflect.get(error, property);
  } catch {
    return undefined;
  }
}

/**
 * Keep provider diagnostics useful without logging prompts, response bodies, or
 * exception messages, any of which can contain private planner text.
 */
export function safeAiFailure(error: unknown): Record<string, string | number> {
  if (!error || typeof error !== "object") return { name: "UnknownFailure" };

  const rawName = read(error, "name");
  const lastError = rawName === "AI_RetryError" ? read(error, "lastError") : undefined;
  const diagnostic = lastError && typeof lastError === "object" ? lastError : error;
  const rawCode = read(diagnostic, "code");
  const rawStatusCode = read(diagnostic, "statusCode") ?? read(diagnostic, "status");
  const context: Record<string, string | number> = {
    name: typeof rawName === "string" && SAFE_NAMES.has(rawName) ? rawName : "UnknownFailure",
  };
  if (typeof rawCode === "string" && SAFE_CODES.has(rawCode)) context.code = rawCode;
  if (typeof rawStatusCode === "number" && Number.isInteger(rawStatusCode) && rawStatusCode >= 100 && rawStatusCode <= 599) {
    context.statusCode = rawStatusCode;
  }
  return context;
}
