import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd());
const sourceRoots = ["app", "components", "lib"];
const supportedOrInternalFiles = new Set([
  "lib/finance/household-runway-browser-adapter.ts",
  "lib/finance/household-runway-interview-runtime.ts",
  "lib/finance/household-runway-react-adapter.ts",
]);

describe("Household Runway Runtime import boundary", () => {
  it("retires the legacy public protocol modules and environment relay", () => {
    expect(
      existsSync(resolve(root, "lib/finance/household-runway-interview.ts")),
    ).toBe(false);
    expect(
      existsSync(resolve(root, "lib/finance/household-runway-draft-codec.ts")),
    ).toBe(false);
    expect(
      existsSync(resolve(root, "lib/finance/internal/household-runway-interview.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(root, "lib/finance/internal/household-runway-draft-codec.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(root, "lib/finance/internal/runway-answer-migrations.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(root, "lib/finance/internal/runway-draft-client.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(root, "lib/finance/internal/household-runway-download.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(root, "lib/finance/internal/household-runway-runtime-environment.ts")),
    ).toBe(false);
  });

  it("keeps production callers on the Runtime or supported adapters", () => {
    const legacyImport = /@\/lib\/finance\/household-runway-(?:interview|draft-codec)"/;
    const violations: string[] = [];

    for (const directory of sourceRoots) {
      const files = walk(resolve(root, directory));
      for (const file of files) {
        const relative = file.slice(root.length + 1).replaceAll("\\", "/");
        if (supportedOrInternalFiles.has(relative)) continue;
        if (legacyImport.test(readFileSync(file, "utf8"))) violations.push(relative);
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps app and components away from internal protocol imports", () => {
    const internalImport = /@\/lib\/finance\/internal\//;
    const violations: string[] = [];

    for (const directory of ["app", "components"]) {
      for (const file of walk(resolve(root, directory))) {
        if (internalImport.test(readFileSync(file, "utf8"))) {
          violations.push(file.slice(root.length + 1).replaceAll("\\", "/"));
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps the supported result components on semantic Runtime facts", () => {
    const componentFiles = [
      "components/finance/household-runway.tsx",
      "components/finance/household-runway-result.tsx",
      "components/finance/household-runway-result-parts.tsx",
    ];
    const violations: string[] = [];

    for (const relative of componentFiles) {
      const source = readFileSync(resolve(root, relative), "utf8");
      const forbidden = [
        /@\/lib\/finance\/household-runway-assessment/,
        /@\/lib\/finance\/internal\//,
        /RUNWAY_MODEL_VERSION/,
      ];
      if (forbidden.some((pattern) => pattern.test(source))) {
        violations.push(relative);
      }
    }

    const resultSources = componentFiles.slice(1).map((relative) =>
      readFileSync(resolve(root, relative), "utf8"),
    );
    expect(violations).toEqual([]);
    expect(resultSources.join("\n")).not.toMatch(/Math\.min/);
    expect(resultSources.join("\n")).not.toMatch(/months_covered/);
    expect(resultSources.join("\n")).not.toMatch(/assessmentHistory/);
    expect(resultSources.join("\n")).not.toMatch(/snapshot\.derived/);
    expect(resultSources.join("\n")).not.toMatch(/firstScenario|assessHouseholdRunway/);
    expect(resultSources.join("\n")).not.toMatch(/monthsCovered\s*[-+*/]/);
  });

  it("keeps plan freshness and Draft synchronization as separate public facts", () => {
    const shell = readFileSync(
      resolve(root, "components/finance/household-runway.tsx"),
      "utf8",
    );

    expect(shell).not.toMatch(/data-runway-plan-operation=\{planOperationState\}/);
    expect(shell).toMatch(/data-runway-plan-operation=\{planOperation\.status\}/);
    expect(shell).toMatch(/data-runway-plan-current=/);
    expect(shell).not.toMatch(/status === "dirty"/);
  });

  it("keeps browser adapter effects, commands, outcomes, and helpers private", () => {
    const source = readFileSync(
      resolve(root, "lib/finance/household-runway-browser-adapter.ts"),
      "utf8",
    );

    expect(source).not.toMatch(
      /export (?:type|interface) HouseholdRunway(?:ExternalEffect|BrowserEffect|BrowserAdapterOutcome|HistoryProjectionInput)/,
    );
    expect(source).not.toMatch(
      /export (?:function|type|interface) (?:applyHouseholdRunwayBrowserEffect|executeHouseholdRunwayBrowserEffect|householdRunwayHistoryProjectionCommand|readHouseholdRunwayBrowserStorage|restoreHouseholdRunwayBrowserRuntime)/,
    );
    expect(source).not.toMatch(/export type HouseholdRunwayInterviewCommand/);
  });

  it("keeps capability composition and complete persistence requests behind internal modules", () => {
    const runtimeFacade = readFileSync(
      resolve(root, "lib/finance/household-runway-interview-runtime.ts"),
      "utf8",
    );
    const runtimeComposition = readFileSync(
      resolve(root, "lib/finance/internal/household-runway-interview-runtime.ts"),
      "utf8",
    );
    const browserFacade = readFileSync(
      resolve(root, "lib/finance/household-runway-browser-adapter.ts"),
      "utf8",
    );
    const browserComposition = readFileSync(
      resolve(root, "lib/finance/internal/household-runway-browser-adapter.ts"),
      "utf8",
    );

    expect(runtimeFacade).not.toMatch(
      /export (?:type|interface) HouseholdRunwayInterviewRuntimeCapabilities/,
    );
    expect(runtimeFacade).not.toMatch(
      /export (?:type|interface) HouseholdRunwayInterviewRuntime(?:Draft|Plan|Report)(?:Request|Outcome)/,
    );
    expect(runtimeFacade).not.toMatch(
      /HouseholdRunwayInterviewRuntime(?:DerivedFacts|Capabilities)/,
    );
    expect(runtimeFacade).not.toMatch(/(?:SuccessfulHouseholdRunwayAssessment|planInputs|assessmentHistory)/);
    expect(runtimeFacade).not.toMatch(/HouseholdRunwayFocusedRuntimeSnapshot|getFocusedSnapshot/);
    expect(runtimeComposition).not.toMatch(/HouseholdRunwayFocusedRuntimeSnapshot|getFocusedSnapshot/);
    expect(runtimeComposition).not.toMatch(/Object\.definePropert/);
    expect(browserFacade).not.toMatch(/extends HouseholdRunwayInterviewRuntimeOptions/);
    expect(browserFacade).not.toMatch(/(?:SuccessfulHouseholdRunwayAssessment|planInputs|assessmentHistory)/);
    expect(browserComposition).not.toMatch(/executeHouseholdRunwayBrowserEffect/);
    expect(browserComposition).not.toMatch(/HouseholdRunwayInterviewCommand/);
    expect(browserComposition).not.toMatch(
      /as HouseholdRunwayBrowser(?:DraftCapability|InternalPlan)Request/,
    );
  });
});

function walk(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true }) as Array<{
    name: string;
    isDirectory: () => boolean;
  }>;
  return entries.flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}
