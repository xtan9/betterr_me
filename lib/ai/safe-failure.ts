type FailureWithMetadata = {
  name?: unknown;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

function safeScalar(value: unknown): string | number | undefined {
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

/**
 * Keep provider diagnostics useful without logging prompts, response bodies, or
 * exception messages, any of which can contain private planner text.
 */
export function safeAiFailure(error: unknown): Record<string, string | number> {
  if (!error || typeof error !== "object") return { name: "UnknownFailure" };

  const failure = error as FailureWithMetadata;
  const context: Record<string, string | number> = {
    name: typeof failure.name === "string" && failure.name ? failure.name : "UnknownFailure",
  };
  const code = safeScalar(failure.code);
  const statusCode = safeScalar(failure.statusCode) ?? safeScalar(failure.status);
  if (code !== undefined) context.code = code;
  if (statusCode !== undefined) context.statusCode = statusCode;
  return context;
}
