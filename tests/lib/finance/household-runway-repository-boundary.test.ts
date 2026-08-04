import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const productionSources = [
  "app/api/finance/cushion/route.ts",
  "app/finance/cushion/page.tsx",
  "components/finance/household-runway.tsx",
  "components/finance/household-runway-landing.tsx",
  "components/finance/household-runway-result.tsx",
  "lib/finance/household-runway-assessment.ts",
  "lib/finance/internal/household-runway-interview.ts",
  "lib/finance/household-runway-interview-runtime.ts",
  "lib/finance/household-runway-service.ts",
  "lib/finance/household-runway-plan.ts",
  "lib/finance/cushion.ts",
];

const source = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("Household Runway repository boundary", () => {
  it("retires the temporary repository module without a compatibility alias", () => {
    expect(existsSync(resolve(process.cwd(), "lib/finance/repository.ts"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "tests/lib/finance/repository.test.ts"))).toBe(false);
  });

  it("keeps production callers on the canonical repository contract", () => {
    for (const relativePath of productionSources) {
      const contents = source(relativePath);
      expect(contents, relativePath).not.toContain("@/lib/finance/repository");
      expect(contents, relativePath).not.toContain("getFinanceCushion");
      expect(contents, relativePath).not.toMatch(/FinanceCushionRecord|FinanceCushionView/);
    }

    expect(source("lib/finance/household-runway-service.ts")).toContain(
      "@/lib/finance/household-runway-repository",
    );
    expect(source("lib/finance/household-runway-repository.ts")).toContain(
      'from("finance_cushions")',
    );
  });

  it("keeps persistence vocabulary inside the repository", () => {
    const repository = source("lib/finance/household-runway-repository.ts");
    expect(repository).toContain("HOUSEHOLD_RUNWAY_PLAN_COLUMNS");
    expect(repository).toContain("reconstructLegacyInputs");
    expect(repository).toContain("commit_household_runway_plan");
    expect(source("lib/finance/household-runway-assessment.ts")).not.toContain(
      "finance_cushions",
    );
  });
});
