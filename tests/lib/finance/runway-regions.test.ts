import { describe, expect, it } from "vitest";
import {
  RUNWAY_REGIONS,
  normalizeLegacyRegion,
  runwayRegionLabel,
} from "@/lib/finance/runway-regions";
import { currencyForCountry } from "@/lib/finance/cushion";

describe("Household Runway regions", () => {
  it("provides canonical choices for every launch country", () => {
    expect(RUNWAY_REGIONS.US).toHaveLength(51);
    expect(RUNWAY_REGIONS.CA).toHaveLength(13);
    expect(RUNWAY_REGIONS.CN.length).toBeGreaterThanOrEqual(31);
    expect(RUNWAY_REGIONS.TW.length).toBeGreaterThanOrEqual(22);
    for (const regions of Object.values(RUNWAY_REGIONS)) {
      for (const region of regions) {
        expect(region.code).toMatch(/^[A-Z0-9-]+$/);
        expect(region.labels.en).toBeTruthy();
        expect(region.labels.zh).toBeTruthy();
        expect(region.labels["zh-TW"]).toBeTruthy();
      }
    }
  });

  it.each([
    ["US", "California", "CA"],
    ["US", "calif.", "CA"],
    ["CA", "British Columbia", "BC"],
    ["CN", "北京市", "BJ"],
    ["TW", "臺北市", "TPE"],
  ] as const)("maps legacy %s region %s to %s", (country, legacy, code) => {
    expect(normalizeLegacyRegion(country, legacy)).toBe(code);
  });

  it("requires review for an unrecognized legacy region", () => {
    expect(normalizeLegacyRegion("US", "Somewhere else")).toBe("");
  });

  it("returns localized labels and country currencies", () => {
    expect(runwayRegionLabel("US", "CA", "zh")).toBe("加利福尼亚州");
    expect(runwayRegionLabel("TW", "TPE", "zh-TW")).toBe("臺北市");
    expect(currencyForCountry("US")).toBe("USD");
    expect(currencyForCountry("CA")).toBe("CAD");
    expect(currencyForCountry("CN")).toBe("CNY");
    expect(currencyForCountry("TW")).toBe("TWD");
  });
});
