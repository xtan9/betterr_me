import { log } from '@/lib/logger';

export type HistoryFailureScope = 'focus-history.read' | 'focus-history.upload' | 'app-limit-history.read' | 'app-limit-history.upload'
  | 'app-limit-continuations.confirm' | 'app-limit-continuations.read' | 'app-limit-continuations.context';
export type HistoryFailureDiagnostic = { category: 'rpc_error' | 'invalid_response' | 'unavailable' | 'unexpected'; rpcCode?: string };

/** Database messages, details, hints and exception objects can contain private history or credentials. */
export function rpcFailureDiagnostic(error: { code?: unknown }): HistoryFailureDiagnostic {
  const code = error.code;
  return { category: 'rpc_error', ...(typeof code === 'string' && /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(code) ? { rpcCode: code } : {}) };
}
export function logHistoryFailure(scope: HistoryFailureScope, diagnostic: HistoryFailureDiagnostic = { category: 'unexpected' }) {
  log.error(`[${scope}] request failed`, undefined, diagnostic);
}
