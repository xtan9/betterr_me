import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function trackedSourceFiles(directory: string): string[] {
  return execFileSync("git", ["ls-files", "-z", "--", directory], {
    encoding: "utf8",
    })
    .split("\0")
    .filter((path) => /\.(?:ts|tsx)$/.test(path) && existsSync(path));
}

function source(path: string): string {
  return readFileSync(path, "utf8").replaceAll("\r\n", "\n");
}

// These are the only browser modules allowed to spell profile HTTP routes.
// The first three are canonical/domain adapters; the last is the retained
// legacy adapter used by old deployed clients.
const BROWSER_PROFILE_ROUTE_ADAPTERS: Record<string, readonly RegExp[]> = {
  "lib/hooks/use-current-profile.ts": [/^\/api\/current-profile$/],
  "lib/hooks/use-profile-preferences.ts": [
    /^\/api\/preferences\/[a-z-]+$/,
    /^\/api\/profile-details$/,
    /^\/api\/user-time-zone$/,
  ],
  "lib/submit-profile-preference-intent.ts": [/^\/api\/profile\/preferences$/],
};

// These imports are server-side adapters, not domain dependencies. Keeping
// the exception list explicit prevents a new server domain from reaching the
// broad repository just because it needs one profile-owned value.
const PROFILE_REPOSITORY_ADAPTERS: Record<string, string> = {
  "app/api/current-profile/route.ts": "Current Profile compositor adapter",
  "app/api/preferences/appearance/route.ts": "Appearance command adapter",
  "app/api/preferences/fitness/route.ts": "Fitness command adapter",
  "app/api/profile-details/route.ts": "Profile Details command adapter",
  "app/api/user-time-zone/route.ts": "User Time Zone command adapter",
  "app/api/profile/route.ts": "legacy profile compatibility adapter",
  "app/api/profile/preferences/route.ts":
    "legacy generic Preference compatibility adapter",
  "app/dashboard/settings/page.tsx":
    "settings SSR Current Profile hydration adapter",
  "lib/db/profiles.ts": "profile repository and compatibility implementation",
};

function browserTransportSources(): string[] {
  return trackedSourceFiles("components")
    .concat(trackedSourceFiles("app"))
    .concat(trackedSourceFiles("hooks"))
    .concat(trackedSourceFiles("lib/hooks"))
    .concat(
      existsSync("lib/submit-profile-preference-intent.ts")
        ? ["lib/submit-profile-preference-intent.ts"]
        : [],
    )
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
      /\/api\/(?:current-profile|preferences\/[a-z-]+|profile\/preferences|profile|profile-details|user-time-zone)(?=["'`?)]|$)/g;
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

  it("keeps broad ProfileDB reads in compatibility adapters only", () => {
    const serverSources = trackedSourceFiles("app").concat(
      trackedSourceFiles("lib"),
    );
    const broadReaders = serverSources.filter(
      (path) =>
        !path.startsWith("lib/db/profiles.ts") &&
        path !== "app/api/profile/route.ts" &&
        !path.startsWith("tests/"),
    );

    for (const path of broadReaders) {
      expect(source(path), path).not.toMatch(/\.getProfile\(/);
    }
  });

  it("keeps broad profile repository imports inside documented server adapters", () => {
    const serverSources = trackedSourceFiles("app").concat(
      trackedSourceFiles("lib"),
    );
    const actual = serverSources.filter((path) =>
      /\bProfilesDB\b/.test(source(path)),
    );

    expect(actual.sort()).toEqual(Object.keys(PROFILE_REPOSITORY_ADAPTERS).sort());
    for (const path of actual) {
      expect(PROFILE_REPOSITORY_ADAPTERS[path], path).toBeTruthy();
    }
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
    expect(
      sourcePathsMatching(serverSources, /\.updatePreferences\(/),
    ).toEqual(["app/api/profile/preferences/route.ts"]);
    expect(
      sourcePathsMatching(
        serverSources,
        /\bupdatePreferences\b|\bupdate_profile_preferences\b/,
      ).sort(),
    ).toEqual([
      "app/api/profile/preferences/route.ts",
      "lib/db/profiles.ts",
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

  it("keeps retained profile routes telemetry-instrumented compatibility adapters", () => {
    for (const path of [
      "app/api/profile/route.ts",
      "app/api/profile/preferences/route.ts",
    ]) {
      expect(existsSync(path), path).toBe(true);
      const contents = source(path);
      expect(contents, path).toContain("createLegacyRouteTelemetry");
      expect(contents, path).toContain("telemetry.emit()");
    }
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
