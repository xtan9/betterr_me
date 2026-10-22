/** Preserve preference RPC messages and conflict codes in ordinary Error objects. */
export function normalizePreferenceRpcError(error: unknown) {
    const normalized = new Error(
      typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error),
    );
    if (typeof error === "object" && error !== null && "code" in error) {
      Object.assign(normalized, { code: (error as { code: unknown }).code });
    }
    return normalized;
  }
