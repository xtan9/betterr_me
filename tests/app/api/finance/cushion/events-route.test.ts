import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/finance/cushion/events/route";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/utils", () => ({ hasEnvVars: true }));

const rpc = vi.fn();

function request(body: unknown) {
  return new NextRequest("http://localhost:3000/api/finance/cushion/events", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("amount-free Household Runway analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ data: true, error: null });
    vi.mocked(createAdminClient).mockReturnValue({ rpc } as never);
  });

  it("accepts only funnel metadata and writes an idempotent event", async () => {
    const response = await POST(
      request({
        action_id: "74a303ae-1ba3-4ab5-beb9-5317eb94c790",
        session_id: "cbeb17f5-8687-4ce7-b43a-49e8f15f0c42",
        event_name: "skipped",
        step_id: "assets",
        locale: "en",
        attribution: {
          video: "layoff-01",
          campaign: "youtube",
          cta: "description",
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(rpc).toHaveBeenCalledWith(
      "record_finance_cushion_event",
      expect.objectContaining({ p_event_name: "skipped", p_step_id: "assets" }),
    );
  });

  it("accepts an amount-free anonymous landing view", async () => {
    const response = await POST(
      request({
        action_id: "74a303ae-1ba3-4ab5-beb9-5317eb94c791",
        session_id: "cbeb17f5-8687-4ce7-b43a-49e8f15f0c42",
        event_name: "landing_view",
        step_id: "landing",
        locale: "zh-TW",
        attribution: { campaign: "youtube", cta: "description" },
      }),
    );

    expect(response.status).toBe(204);
    expect(rpc).toHaveBeenCalledWith(
      "record_finance_cushion_event",
      expect.objectContaining({ p_event_name: "landing_view", p_step_id: "landing" }),
    );
  });

  it("rejects financial values and unknown event fields", async () => {
    const response = await POST(
      request({
        action_id: "74a303ae-1ba3-4ab5-beb9-5317eb94c790",
        session_id: "cbeb17f5-8687-4ce7-b43a-49e8f15f0c42",
        event_name: "completed",
        salary: 300_000,
      }),
    );

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects event stage, locale, and attribution values outside the allowlists", async () => {
    const invalidBodies = [
      { step_id: "not-an-interview-stage" },
      { locale: "fr" },
      { attribution: { region: "CA" } },
    ];

    for (const extra of invalidBodies) {
      const response = await POST(
        request({
          action_id: "74a303ae-1ba3-4ab5-beb9-5317eb94c790",
          session_id: "cbeb17f5-8687-4ce7-b43a-49e8f15f0c42",
          event_name: "completed",
          ...extra,
        }),
      );

      expect(response.status).toBe(400);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 429 when the shared database limiter rejects the event", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const response = await POST(request({
      action_id: "74a303ae-1ba3-4ab5-beb9-5317eb94c792",
      session_id: "cbeb17f5-8687-4ce7-b43a-49e8f15f0c42",
      event_name: "landing_view",
    }));
    expect(response.status).toBe(429);
  });
});
