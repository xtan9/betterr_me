import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  runwayAttribution,
  trackRunwayEvent,
} from "@/lib/finance/runway-analytics-client";

describe("Household Runway analytics browser adapter", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState(
      {},
      "",
      "/finance/cushion?campaign=launch&video=layoff-01&cta=description&variant=control&region=CA&monthly=300000",
    );
    document.documentElement.lang = "zh-TW";
    vi.restoreAllMocks();
  });

  it("sends only opaque funnel metadata and approved campaign attribution", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true } as Response);

    expect(runwayAttribution()).toEqual({
      video: "layoff-01",
      campaign: "launch",
      cta: "description",
      landing_variant: "control",
      language: "zh-TW",
    });

    await expect(trackRunwayEvent("completed", "result")).resolves.toBe(true);

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      event_name: "completed",
      step_id: "result",
      locale: "zh-TW",
      attribution: {
        video: "layoff-01",
        campaign: "launch",
        cta: "description",
        landing_variant: "control",
        language: "zh-TW",
      },
    });
    expect(body.action_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(body.session_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(JSON.stringify(body)).not.toContain("300000");
    expect(JSON.stringify(body)).not.toContain('"region"');
  });

  it("turns transport failures into a local false outcome", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    await expect(trackRunwayEvent("skipped", "assets")).resolves.toBe(false);
  });

  it("turns a non-OK analytics response into a local false outcome", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false } as Response);

    await expect(trackRunwayEvent("completed", "result")).resolves.toBe(false);
  });
});
