/**
 * Thin logger wrapper module.
 *
 * Wraps console methods now. When Sentry is added later, swap the three
 * function bodies to Sentry.captureException / captureMessage calls --
 * no other file changes needed.
 */

type LogContext = Record<string, unknown>;

function formatMessage(message: string, context?: LogContext): string {
  if (!context) return message;
  return `${message} ${JSON.stringify(context)}`;
}

export const log = {
  /** Errors that need investigation. Will route to Sentry.captureException later. */
  error(message: string, error?: unknown, context?: LogContext): void {
    console.error(formatMessage(message, context), error ?? '');
  },

  /** Degraded behavior that still works. Will route to Sentry.captureMessage later. */
  warn(message: string, context?: LogContext): void {
    console.warn(formatMessage(message, context));
  },

  /** Informational (development only). Stripped or gated in production later. */
  info(message: string, context?: LogContext): void {
    console.info(formatMessage(message, context));
  },
} as const;
