// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const apiRoot = join(process.cwd(), "app", "api");

/**
 * These endpoints deliberately do not use the authenticated request context:
 * they are public protocol endpoints or use a separate service credential.
 * Keep this list narrow and reviewed whenever a route is added.
 */
const deliberateAuthExceptions: Record<string, string> = {
  "mobile/train/prior-results/route.ts": "authenticateNativeRequest verifies bearer owner; owner-filtered completed parent pages and compatible captured performed facts, no mutation",
  "mobile/train/templates/route.ts": "authenticateNativeRequest verifies bearer owner; gated versioned template content and scoped definitions",
  "mobile/train/templates/[id]/route.ts": "authenticateNativeRequest verifies bearer owner; explicit owned template read including archived references",
  "mobile/train/templates/capabilities/route.ts": "authenticateNativeRequest verifies bearer session; private rollout state, no caller-controlled gate",
  "mobile/train/templates/commands/route.ts": "authenticateNativeRequest verifies bearer owner; durable first outcomes and versioned owner-only SQL commands",
  "mobile/train/templates/definitions/route.ts": "authenticateNativeRequest verifies bearer owner; only public presets or owned custom selection references",
  "mobile/train/exercises/route.ts": "authenticateNativeRequest verifies bearer owner; gated owner-only custom library with no cookie or service fallback",
  "mobile/train/exercises/[id]/route.ts": "authenticateNativeRequest verifies bearer owner; gated explicit owned definition read including archived references",
  "mobile/train/exercises/capabilities/route.ts": "authenticateNativeRequest verifies bearer session; private server rollout state only, no caller-controlled gate",
  "mobile/train/exercises/commands/route.ts": "authenticateNativeRequest verifies bearer owner; gated exact first outcomes and versioned owner-only SQL commands",
  "mobile/train/completions/route.ts": "authenticateNativeRequest verifies captured user JWT; owner-checked atomic completion, immutable receipt and projection; no cookie or service fallback",
  "mobile/focus/app-limits/continuations/route.ts": "authenticateNativeRequest verifies bearer owner; immutable version-checked continuation receipts with owner RLS, no cookie fallback",
  "mobile/focus/app-limits/continuations/context/route.ts": "authenticateNativeRequest verifies bearer owner; owner RLS current journal versions only, no cookie fallback",
  "mobile/focus/app-limits/history/route.ts": "authenticateNativeRequest verifies bearer owner; sanitized immutable native journal commands and owner RLS history, no cookie fallback",
  "mobile/focus/history/route.ts": "authenticateNativeRequest verifies native bearer owner; owner RLS history and private transactional immutable receipts, no cookie fallback",
  "mobile/sleep/route.ts": "authenticateNativeRequest verifies native bearer owner; owner RLS reads and service-only atomic sleep commands after fresh calendar conflict verification",
  "mobile/connections/route.ts": "authenticateNativeRequest verifies native bearer owner before server-only encrypted Google storage; no cookie fallback",
  "mobile/connections/callback/route.ts": "public redirect-only OAuth callback, fixed native destination; no token exchange or mutation until native bearer and one-time state verification",
  "mobile/planning/command/route.ts": "authenticateNativeRequest verifies native bearer; owner-filtered proposal, external conflict read and owner RLS command",
  "mobile/execution/route.ts": "verified native Supabase user JWT through authenticateNativeRequest; owner RLS and versioned execution commands",
  "mobile/execution/settings/route.ts": "verified native Supabase user JWT through authenticateNativeRequest; owner-private notification settings",
  "cron/assistant-reminders/route.ts": "CRON_SECRET service credential; service-only owner-scoped snapshot and atomic reminder claims",
  "mobile/next-action/route.ts": "verified native Supabase user JWT through authenticateNativeRequest; read-only owner RLS context",
  "mobile/planning/route.ts": "verified native Supabase user JWT through authenticateNativeRequest; immutable owner RLS proposal",
  "cron/dispatch-reminders/route.ts": "CRON_SECRET service credential",
  "cron/prewarm-recurring-tasks/route.ts": "CRON_SECRET service credential",
  "email/unsubscribe/route.ts": "signed public unsubscribe token",
  "finance/cushion/events/route.ts": "public anonymous analytics event",
  "oauth/register/route.ts": "public OAuth dynamic client registration",
  "oauth/token/route.ts": "public OAuth token exchange",
  "mobile/assistant/route.ts": "verified native Supabase user JWT only; public RLS client via authenticateNativeRequest, no cookie/MCP/API-key fallback",
  "mobile/assistant/history/route.ts": "verified native Supabase user JWT only through authenticateNativeRequest; read-only owner RLS history, no cookie/MCP/API-key fallback",
  "mobile/assistant/command/route.ts": "authenticateNativeRequest verifies native bearer; owner-filtered capture proposal, fresh external conflict read and owner RLS command",
};
const sharedCookieTemplateRoutes = new Set([
  'routines/templates/route.ts', 'routines/templates/[id]/route.ts', 'routines/templates/capabilities/route.ts',
  'routines/templates/commands/route.ts', 'routines/templates/definitions/route.ts',
]);

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return routeFiles(path);
    }

    return entry.name === "route.ts" ? [path] : [];
  });
}

function routeName(path: string): string {
  return relative(apiRoot, path).replaceAll("\\", "/");
}

describe("API authentication route contract", () => {
  it("requires shared policy-aware authentication on every route except documented exceptions", () => {
    const routes = routeFiles(apiRoot);

    for (const route of routes) {
      const name = routeName(route);
      let source = readFileSync(route, "utf8");

      if (name in deliberateAuthExceptions) {
        continue;
      }

      if (sharedCookieTemplateRoutes.has(name)) {
        expect(source).toContain('templateCookieRoute');
        expect(source).toContain(name.endsWith('commands/route.ts') ? "'write'" : "'read'");
        source = readFileSync(join(process.cwd(), 'lib/fitness/template-cookie-route.ts'), 'utf8');
        expect(source).toContain("allowedCredentials: ['cookie']");
        expect(source).toContain("request.headers.get('X-Train-Owner') !== auth.principal.userId");
      }

      expect(source, `${name} should use the shared request context`).toContain(
        "authenticateRequest",
      );
      expect(source, `${name} should declare an explicit credential policy`).toContain(
        "allowedCredentials",
      );
      expect(source, `${name} should declare an explicit permission policy`).toContain(
        "requiredPermission",
      );
      expect(source, `${name} should not create a route-local server client`).not.toContain(
        "@/lib/supabase/server",
      );
      expect(source, `${name} should not resolve the principal locally`).not.toContain(
        "auth.getUser",
      );
    }
  });

  it("keeps the exception list pointed at real API routes", () => {
    const routes = new Set(routeFiles(apiRoot).map(routeName));

    for (const [name, reason] of Object.entries(deliberateAuthExceptions)) {
      expect(routes.has(name), `${name} (${reason}) should exist`).toBe(true);
    }
    for (const name of sharedCookieTemplateRoutes) expect(routes.has(name)).toBe(true);
  });
});

