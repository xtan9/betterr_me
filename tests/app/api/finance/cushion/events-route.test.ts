import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/finance/cushion/events/route";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/utils", () => ({ hasEnvVars: true }));

const upsert = vi.fn();
const from = vi.fn(() => ({ upsert }));

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
    upsert.mockResolvedValue({ error: null });
    vi.mocked(createClient).mockResolvedValue({ from } as never);
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
    expect(from).toHaveBeenCalledWith("finance_cushion_events");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ event_name: "skipped", step_id: "assets" }),
      {
        onConflict: "action_id",
        ignoreDuplicates: true,
      },
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
    expect(from).not.toHaveBeenCalled();
  });
});
