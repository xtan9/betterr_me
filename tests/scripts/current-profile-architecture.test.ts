import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function trackedSourceFiles(directory: string): string[] {
  return execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", directory],
    {
    encoding: "utf8",
    },
  )
    .split("\0")
    .filter((path) => /\.(?:ts|tsx)$/.test(path) && existsSync(path));
}

function source(path: string): string {
  return readFileSync(path, "utf8").replaceAll("\r\n", "\n");
}

// These are the only browser modules allowed to spell profile HTTP routes.
// Current Profile and the named owner commands are the complete browser
// contract after legacy retirement.
const BROWSER_PROFILE_ROUTE_ADAPTERS: Record<string, readonly RegExp[]> = {
  "lib/hooks/use-current-profile.ts": [/^\/api\/current-profile$/],
  "lib/hooks/use-profile-preferences.ts": [
    /^\/api\/preferences\/[a-z-]+$/,
    /^\/api\/profile-details$/,
    /^\/api\/user-time-zone$/,
  ],
};

function browserTransportSources(): string[] {
  return trackedSourceFiles("components")
    .concat(trackedSourceFiles("app"))
    .concat(trackedSourceFiles("hooks"))
    .concat(trackedSourceFiles("lib/hooks"))
    .filter((path) => !path.startsWith("app/api/"));
}

function sourcePathsMatching(
  paths: readonly string[],
  pattern: RegExp,
): string[] {
  return paths.filter((path) => pattern.test(source(path)));
}

describe("Current Profile architecture boundaries", () => {
  it("keeps browser profile transport inside the domain hook adapters", () => {
    const browserSources = trackedSourceFiles("components").concat(
      trackedSourceFiles("app"),
    );

    for (const path of browserSources) {
      if (path.startsWith("app/api/")) continue;
      const contents = source(path);
      expect(contents, path).not.toMatch(
        /\/api\/(?:current-profile|preferences\/|profile-details|user-time-zone)/,
      );
      expect(contents, path).not.toMatch(/\buser_metadata\b/);
      expect(contents, path).not.toMatch(
        /import\s+type\s+\{[\s\S]*?\bProfile\b[\s\S]*?\}\s+from\s+["']@\/lib\/db\/types["']|import\s+\{[\s\S]*?\bProfile\b[\s\S]*?\}\s+from\s+["']@\/lib\/db\/types["']/,
      );
    }
  });

  it("keeps direct browser profile routes inside documented adapters", () => {
    const routePattern =
      /\/api\/(?:current-profile|preferences\/[a-z-]+|profile-details|user-time-zone)(?=["'`?)]|$)/g;
    const violations: string[] = [];

    for (const path of browserTransportSources()) {
      for (const match of source(path).matchAll(routePattern)) {
        const route = match[0];
        const adapters = BROWSER_PROFILE_ROUTE_ADAPTERS[path];
        if (!adapters || !adapters.some((pattern) => pattern.test(route))) {
          violations.push(`${path}: ${route}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps raw database profile types and storage-shaped profile interfaces out of browser code", () => {
    const rawProfileTypeImport =
      /import(?:\s+type)?[\s\S]{0,300}\bProfile(?:[A-Z]\w*)?\b[\s\S]{0,200}from\s+["']@\/(?:lib\/db\/types|lib\/types\/database)["']/;
    const storageShapedProfileType =
      /(?:interface|type)\s+\w*Profile\w*\b[\s\S]{0,800}?(?:\bfull_name\b|\bavatar_url\b|\bpreference_revision\b|\bemail_notifications_enabled\b|\bpreferences\s*:\s*(?:\{|Profile))/;

    for (const path of browserTransportSources()) {
      const contents = source(path);
      expect(contents, path).not.toMatch(rawProfileTypeImport);
      expect(contents, path).not.toMatch(storageShapedProfileType);
      expect(contents, path).not.toMatch(
        /\b(?:full_name|avatar_url|preference_revision|email_notifications_enabled)\b/,
      );
    }
  });

  it("keeps raw profile reads out of server consumers", () => {
    const serverSources = trackedSourceFiles("app").concat(
      trackedSourceFiles("lib"),
    );

    for (const path of serverSources) {
      expect(source(path), path).not.toMatch(/\.getProfile\(/);
    }
  });

  it("removes the broad profile repository in favor of explicit owner modules", () => {
    const serverSources = trackedSourceFiles("app").concat(
      trackedSourceFiles("lib"),
    );
    expect(
      serverSources.filter((path) => /\bProfilesDB\b/.test(source(path))),
    ).toEqual([]);
    expect(
      sourcePathsMatching(serverSources, /\bCurrentProfileDB\b/).sort(),
    ).toEqual([
      "app/api/current-profile/route.ts",
      "app/dashboard/settings/page.tsx",
      "lib/db/current-profile.ts",
    ]);
  });

  it("keeps profile-owned server behavior on narrow readers and private persistence", () => {
    const serverSources = trackedSourceFiles("app").concat(
      trackedSourceFiles("lib"),
    );

    expect(
      sourcePathsMatching(serverSources, /\.getCurrentProfileProjection\(/).sort(),
    ).toEqual([
      "app/api/current-profile/route.ts",
      "app/dashboard/settings/page.tsx",
    ]);
    expect(
      sourcePathsMatching(serverSources, /\.getNotificationPreferenceProjection\(/).sort(),
    ).toEqual(["lib/db/notifications.ts"]);
    expect(
      sourcePathsMatching(serverSources, /\.getFitnessWeightUnitPreference\(/),
    ).toEqual([]);
    expect(sourcePathsMatching(serverSources, /\bupdatePreferences\b|\bupdate_profile_preferences\b/)).toEqual([]);
    expect(sourcePathsMatching(serverSources, /setAppearancePreference/).sort()).toEqual([
      "app/api/preferences/appearance/route.ts",
      "lib/db/appearance.ts",
    ]);
    expect(sourcePathsMatching(serverSources, /setFitnessPreference/).sort()).toEqual([
      "app/api/preferences/fitness/route.ts",
      "lib/db/fitness.ts",
    ]);
    expect(sourcePathsMatching(serverSources, /updateProfileDetails/).sort()).toEqual([
      "app/api/profile-details/route.ts",
      "lib/db/profile-details.ts",
      "lib/hooks/use-profile-preferences.ts",
    ]);
    expect(sourcePathsMatching(serverSources, /setUserTimeZone/).sort()).toEqual([
      "app/api/user-time-zone/route.ts",
      "lib/db/user-time-zone.ts",
      "lib/hooks/use-profile-preferences.ts",
    ]);
    expect(
      sourcePathsMatching(serverSources, /\.getReminderEmailPreference\(/),
    ).toEqual(["lib/email/send.ts"]);
    expect(
      sourcePathsMatching(serverSources, /\.getWeekStartPreference\(/).sort(),
    ).toEqual([
      "app/api/habits/[id]/stats/route.ts",
      "app/api/insights/weekly/route.ts",
      "lib/ai/tools/habits.ts",
      "lib/dashboard/dashboard-snapshot.ts",
    ]);
  });

  it("keeps Current Profile assembly and composition behind the compositor", () => {
    const sourceFiles = trackedSourceFiles("app").concat(
      trackedSourceFiles("components"),
      trackedSourceFiles("lib"),
    );

    expect(
      sourcePathsMatching(sourceFiles, /\bidentity\s*:\s*\{/),
    ).toEqual(["lib/current-profile.ts"]);
    expect(
      sourcePathsMatching(sourceFiles, /\bcomposeCurrentProfileResponse\(/).sort(),
    ).toEqual([
      "app/api/current-profile/route.ts",
      "app/dashboard/settings/page.tsx",
      "lib/current-profile.ts",
    ]);
  });

  it.each([
    ["app/workouts/[id]/page.tsx", ["FitnessDB", "getWeightUnitPreference"]],
    ["lib/dashboard/dashboard-snapshot.ts", ["getWeekStartPreference"]],
    ["app/api/insights/weekly/route.ts", ["LocalizationDB", "getWeekStartPreference"]],
    ["app/api/habits/[id]/stats/route.ts", ["LocalizationDB", "getWeekStartPreference"]],
    ["app/api/cron/dispatch-reminders/route.ts", ["NotificationsDB", "getPushQuietWindow"]],
    ["lib/email/send.ts", ["NotificationsDB", "getReminderEmailPreference"]],
    ["app/api/current-profile/route.ts", ["getCurrentProfileProjection", "composeCurrentProfileResponse"]],
    ["app/dashboard/settings/page.tsx", ["getCurrentProfileProjection", "composeCurrentProfileResponse"]],
  ])("keeps %s on its documented profile boundary", (path, required) => {
    const contents = source(path);
    for (const token of required) {
      expect(contents, `${path}: ${token}`).toContain(token);
    }
  });

  it("keeps push quiet-window evaluation behind the Notifications reader", () => {
    const dispatchSource = source("app/api/cron/dispatch-reminders/route.ts");

    expect(dispatchSource).toContain("getPushQuietWindow");
    expect(dispatchSource).toContain("isPushQuietWindowActive");
    expect(dispatchSource).not.toContain("getNotificationPreferenceProjection");
    expect(dispatchSource).not.toContain("decodeNotificationPreferences");
    expect(dispatchSource).not.toContain("lib/push/quiet-hours");
  });

  it("keeps reminder-email delivery behind a narrow Notifications reader", () => {
    const emailSource = source("lib/email/send.ts");

    expect(emailSource).toContain("getReminderEmailPreference");
    expect(emailSource).not.toContain("getNotificationPreferenceProjection");
    expect(emailSource).not.toContain("decodeNotificationPreferences");
    expect(emailSource).not.toContain("PreferenceStorage");
  });

  it("removes legacy Profile route telemetry and browser compatibility adapters", () => {
    expect(existsSync("lib/legacy-telemetry.ts")).toBe(false);
    expect(existsSync("lib/submit-profile-preference-intent.ts")).toBe(false);
    expect(existsSync("app/api/profile/route.ts")).toBe(false);
    expect(existsSync("app/api/profile/preferences/route.ts")).toBe(false);
  });

  it("keeps Current Profile transport and cache controls inside its adapters", () => {
    const commandSources = trackedSourceFiles("app")
      .concat(trackedSourceFiles("components"))
      .concat(trackedSourceFiles("hooks"))
      .concat(trackedSourceFiles("lib"));
    const commandUsages = sourcePathsMatching(
      commandSources,
      /useCurrentProfileCommands|\b(runCommand|pendingIntents|applyAcceptedPreferenceOutcome)\b/,
    );

    expect(commandUsages.sort()).toEqual([
      "lib/hooks/use-current-profile.ts",
      "lib/hooks/use-profile-preferences.ts",
    ]);
    expect(source("components/layouts/sidebar-user-footer.tsx")).not.toMatch(
      /const\s+\{[^}]*\bdata\b[^}]*\}\s*=\s*useCurrentProfile\(/,
    );
  });

  it("keeps Fitness SSR on its owner reader instead of the broad profile repository", () => {
    const workoutSource = source("app/workouts/[id]/page.tsx");

    expect(workoutSource).toContain("FitnessDB");
    expect(workoutSource).not.toContain("ProfilesDB");
    expect(workoutSource).not.toContain("getProfile(");
  });
});
