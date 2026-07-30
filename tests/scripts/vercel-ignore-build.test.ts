import { describe, expect, it } from "vitest";

import { classifyVercelBuild } from "../../scripts/ci/vercel-ignore-build.mjs";

describe("Vercel ignored build classification", () => {
  it.each([
    "app/journal/page.tsx",
    "components/journal/journal-editor.tsx",
    "emails/task-due.tsx",
    "hooks/use-mobile.ts",
    "i18n/messages/en.json",
    "lib/journal/utils.ts",
    "public/sw.js",
  ])("builds for runtime path %s", (file) => {
    expect(classifyVercelBuild([file])).toMatchObject({
      build: true,
      runtimeFiles: [file],
    });
  });

  it.each([
    "package.json",
    "pnpm-lock.yaml",
    "next.config.ts",
    "postcss.config.mjs",
    "proxy.ts",
    "tailwind.config.ts",
    "tsconfig.json",
    "vercel.json",
  ])("builds for configuration or dependency input %s", (file) => {
    expect(classifyVercelBuild([file]).build).toBe(true);
  });

  it.each([
    ".github/workflows/ci.yml",
    "docs/architecture.md",
    "e2e/dashboard.spec.ts",
    "scripts/ci/classify-changes.mjs",
    "supabase/migrations/20260729000000_change.sql",
    "tests/app/journal/page.test.tsx",
    "README.md",
    "playwright.config.ts",
    "vitest.config.ts",
  ])("skips known non-runtime path %s", (file) => {
    expect(classifyVercelBuild([file])).toMatchObject({
      build: false,
      runtimeFiles: [],
    });
  });

  it("skips a change containing only non-runtime files", () => {
    expect(classifyVercelBuild([
      ".github/workflows/e2e.yml",
      "tests/scripts/classify-changes.test.ts",
      "scripts/ci/classify-changes.mjs",
    ]).build).toBe(false);
  });

  it("builds a mixed runtime and non-runtime change", () => {
    expect(classifyVercelBuild([
      "docs/journal.md",
      "app/journal/page.tsx",
      "tests/app/journal/page.test.tsx",
    ])).toEqual({
      build: true,
      files: [
        "docs/journal.md",
        "app/journal/page.tsx",
        "tests/app/journal/page.test.tsx",
      ],
      runtimeFiles: ["app/journal/page.tsx"],
    });
  });

  it("normalizes Windows path separators", () => {
    expect(classifyVercelBuild(["tests\\app\\journal\\page.test.tsx"]).build)
      .toBe(false);
  });

  it("builds for an unfamiliar path as a fail-safe", () => {
    expect(classifyVercelBuild(["new-runtime/entry.ts"]).build).toBe(true);
  });

  it("builds when the changed-file list is unexpectedly empty", () => {
    expect(classifyVercelBuild([]).build).toBe(true);
  });
});
