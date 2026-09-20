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

const SAFE_PROVIDER_TYPES = new Set([
  "api_error",
  "authentication_error",
  "bad_request_error",
  "invalid_request_error",
  "rate_limit_error",
  "server_error",
]);

const SAFE_PROVIDER_PARAMS = new Set([
  "input",
  "max_output_tokens",
  "max_tokens",
  "messages",
  "model",
  "response_format",
  "stream",
  "tools",
]);

const SAFE_SCHEMA_FIELDS = new Set(['intent','message','actions','planning','horizon','startDate','endDate','timezone','facts','dimension','state','detail','questions','question','assumptions','draft','skipDiscovery','reopenDiscovery','memoryUpdates','operation','memoryId','replacement','kind','key','content','confidence','temporality','validFor','amount','unit','nextActionWindow','start','end','available']);
const SAFE_ISSUE_CODES = new Set(['invalid_type','invalid_union','invalid_value','too_small','too_big','invalid_format','unrecognized_keys','custom']);

function read(error: object, property: string): unknown {
  try {
    return Reflect.get(error, property);
  } catch {
    return undefined;
  }
}

function readProviderError(diagnostic: object): Record<string, unknown> | undefined {
  const responseBody = read(diagnostic, "responseBody");
  if (typeof responseBody !== "string" || responseBody.length > 8192) return undefined;
  try {
    const parsed: unknown = JSON.parse(responseBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const providerError = read(parsed, "error");
    return providerError && typeof providerError === "object" && !Array.isArray(providerError)
      ? providerError as Record<string, unknown>
      : parsed as Record<string, unknown>;
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
  const providerError = readProviderError(diagnostic);
  const providerCode = providerError ? read(providerError, "code") : undefined;
  const providerType = providerError ? read(providerError, "type") : undefined;
  const providerParam = providerError ? read(providerError, "param") : undefined;
  const context: Record<string, string | number> = {
    name: typeof rawName === "string" && SAFE_NAMES.has(rawName) ? rawName : "UnknownFailure",
  };
  const finishReason = read(diagnostic, "finishReason");
  if (typeof finishReason === "string" && ["stop", "length", "content-filter", "tool-calls", "error", "other", "unknown"].includes(finishReason)) context.finishReason = finishReason;
  const usage = read(diagnostic, "usage");
  const outputTokens = usage && typeof usage === "object" ? read(usage, "outputTokens") : undefined;
  if (typeof outputTokens === "number" && Number.isSafeInteger(outputTokens) && outputTokens >= 0) context.outputTokens = outputTokens;
  const cause = read(diagnostic, "cause");
  const causeName = cause && typeof cause === "object" ? read(cause, "name") : undefined;
  if (typeof causeName === "string" && ["AI_TypeValidationError", "AI_JSONParseError", "ZodError"].includes(causeName)) context.causeName = causeName;
  // Never expose issue messages, received values, arbitrary keys, or model text.
  try {
    const validation = cause && typeof cause === 'object' ? read(cause, 'cause') : undefined;
    const issues = validation && typeof validation === 'object' ? read(validation, 'issues') : undefined;
    const issue = Array.isArray(issues) ? issues[0] : undefined;
    if (issue && typeof issue === 'object') {
      const code = read(issue, 'code'), path = read(issue, 'path');
      if (typeof code === 'string' && SAFE_ISSUE_CODES.has(code)) context.validationCode = code;
      if (Array.isArray(path)) context.validationPath = path.slice(0,8).map(part=>typeof part==='string'&&SAFE_SCHEMA_FIELDS.has(part)?part:'*').join('.');
    }
  } catch { /* Diagnostics must not change the failure boundary. */ }
  if (typeof rawCode === "string" && SAFE_CODES.has(rawCode)) context.code = rawCode;
  if (typeof providerCode === "string" && SAFE_CODES.has(providerCode)) context.providerCode = providerCode;
  if (typeof providerType === "string" && SAFE_PROVIDER_TYPES.has(providerType)) context.providerType = providerType;
  if (typeof providerParam === "string" && SAFE_PROVIDER_PARAMS.has(providerParam)) context.providerParam = providerParam;
  if (typeof rawStatusCode === "number" && Number.isInteger(rawStatusCode) && rawStatusCode >= 100 && rawStatusCode <= 599) {
    context.statusCode = rawStatusCode;
  }
  return context;
}
