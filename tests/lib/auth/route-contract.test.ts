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
  "cron/dispatch-reminders/route.ts": "CRON_SECRET service credential",
  "email/unsubscribe/route.ts": "signed public unsubscribe token",
  "finance/cushion/events/route.ts": "public anonymous analytics event",
  "oauth/register/route.ts": "public OAuth dynamic client registration",
  "oauth/token/route.ts": "public OAuth token exchange",
};

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
      const source = readFileSync(route, "utf8");

      if (name in deliberateAuthExceptions) {
        continue;
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
  });
});
