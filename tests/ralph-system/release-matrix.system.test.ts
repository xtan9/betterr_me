import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const requiredAreas = [
  "Selection", "Ownership", "Freshness", "Worker", "Verification", "Repairs",
  "Pull requests", "Merge", "Stop and bounds", "Recovery", "Safety",
  "Cleanup and reporting", "Platform",
];
const requiredCounts = [4, 4, 4, 4, 3, 5, 6, 3, 7, 6, 6, 4, 4];

describe("Ralph v2 release matrix manifest", () => {
  it("binds every required acceptance area to a fresh-process system scenario", () => {
    const manifest = JSON.parse(fs.readFileSync(
      path.resolve("scripts/ralph/v2/release-matrix.json"),
      "utf8",
    ));
    expect(Object.keys(manifest).sort()).toEqual([...requiredAreas].sort());
    const seen = new Set<string>();
    for (const [areaIndex, area] of requiredAreas.entries()) {
      expect(manifest[area], `${area} scenario count changed`).toHaveLength(requiredCounts[areaIndex]);
      for (const entry of manifest[area]) {
        const [scenarioId, requirement, testFile, testName, evidence] = entry;
        expect(seen.has(scenarioId), `duplicate scenario ${scenarioId}`).toBe(false);
        seen.add(scenarioId);
        expect(requirement.trim().length, `${scenarioId} lacks a requirement`).toBeGreaterThan(10);
        expect(["fresh-cli", "real-process", "boundary-contract"]).toContain(evidence);
        expect(testFile).toMatch(/\.system\.test\.ts$/);
        const testPath = path.resolve(testFile);
        expect(fs.existsSync(testPath), `${testFile} is missing`).toBe(true);
        const source = fs.readFileSync(testPath, "utf8");
        expect(source, `${testName} is missing`).toContain(testName);
        if (evidence === "fresh-cli") {
          expect(source, `${scenarioId} lacks a fresh CLI/process harness`)
            .toMatch(/scenario\.run\(|spawnSync\(|\.start\(/);
        } else if (evidence === "real-process") {
          expect(source, `${scenarioId} lacks real process evidence`)
            .toMatch(/spawn|process\.execPath|startOrAttach|createProductionSessionSupervisor/);
        }
      }
    }
  });
});
