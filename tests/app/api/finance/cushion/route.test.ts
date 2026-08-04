import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  createDefaultRunwayAnswers,
} from "@/lib/finance/cushion";
import { assessHouseholdRunway } from "@/lib/finance/household-runway-assessment";
import { GET, POST } from "@/app/api/finance/cushion/route";
import { commitHouseholdRunwayPlan, getHouseholdRunwayPlan, getRunwaySnapshots } from "@/lib/finance/repository";

const { mockAuthenticateRequest } = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
}));

vi.mock("@/lib/auth/authenticated-request", () => ({
  authenticateRequest: mockAuthenticateRequest,
  cookieRouteErrorMessage: (error: { error: string; status: number }) =>
    error.status === 401 ? "Unauthorized" : error.error,
}));

vi.mock("@/lib/finance/repository", () => ({
  commitHouseholdRunwayPlan: vi.fn(),
  getHouseholdRunwayPlan: vi.fn(),
  getRunwaySnapshots: vi.fn(),
}));

const user = { id: "user-a" };
const mockSupabase = {};
const idempotencyKey = "74a303ae-1ba3-4ab5-beb9-5317eb94c790";

function validAnswers() {
  const answers = createDefaultRunwayAnswers(
    new Date("2026-07-26T00:00:00.000Z"),
  );
  answers.region = "CA";
  answers.mine = {
    ...answers.mine,
    employment: "unemployed",
    entered_as: "net",
    take_home_source: "user_confirmed",
    confidence: "confirmed",
  };
  answers.available_cash = { cents: 3_000_000, confidence: "confirmed" };
  answers.expense_mode = "quick";
  answers.quick_expenses = {
    current_monthly_cents: 600_000,
    interruption_monthly_cents: 600_000,
    confidence: "confirmed",
  };
  return answers;
}

const answers = validAnswers();
const adjustments = {
  expense_reduction_cents: 0,
  added_cash_cents: 125_000,
  added_monthly_income_cents: 0,
  expected_unconfirmed_funds_cents: 0,
  usable_illiquid_investments_cents: 0,
  usable_retirement_tax_deferred_cents: 0,
  usable_retirement_tax_free_cents: 0,
};
const assessment = assessHouseholdRunway({ answers, adjustments });
if (!assessment.success) throw new Error("test assessment should be valid");
const savedCushion = {
  revision: 1,
  inputs: answers,
  id: "private-plan-id",
  updated_at: "2026-07-26T00:00:00.000Z",
  status: "completed",
};
const savedSnapshot = {
  id: "snapshot-a",
  trigger: "completed" as const,
  scenario: "current" as const,
  months_covered: 5,
  sustainable: false,
  model_version: "4.0.0",
  created_at: "2026-07-26T00:00:00.000Z",
};

function request(body: unknown) {
  return new NextRequest("http://localhost:3000/api/finance/cushion/commit", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("/api/finance/cushion/commit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticateRequest.mockResolvedValue({
      ok: true,
      principal: { type: "user", userId: user.id, credential: "cookie" },
      client: mockSupabase,
    });
    vi.mocked(getRunwaySnapshots).mockResolvedValue([]);
    vi.mocked(commitHouseholdRunwayPlan).mockResolvedValue({
      success: true,
      replayed: false,
      revision: 1,
      plan: savedCushion,
      assessment,
      snapshot: savedSnapshot,
      snapshots: [savedSnapshot],
    });
  });

  it("requires authenticated cookie access for the public commit boundary", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce({
      ok: false,
      error: "Unauthorized",
      status: 401,
    });
    expect((await POST(request({}))).status).toBe(401);
    expect(commitHouseholdRunwayPlan).not.toHaveBeenCalled();
  });

  it("strictly validates complete normalized inputs and derives the assessment on the server", async () => {
    const response = await POST(
      request({
        answers,
        adjustments,
        status: "completed",
        attribution: { campaign: "youtube" },
        idempotency_key: idempotencyKey,
        expected_revision: 0,
        snapshot_action_id: idempotencyKey,
        snapshot_trigger: "completed",
        unexpected: true,
      }),
    );
    expect(response.status).toBe(400);
    expect(commitHouseholdRunwayPlan).not.toHaveBeenCalled();

    const validResponse = await POST(
      request({
        answers,
        adjustments,
        status: "completed",
        attribution: { campaign: "youtube" },
        idempotency_key: idempotencyKey,
        expected_revision: 0,
        snapshot_action_id: idempotencyKey,
        snapshot_trigger: "completed",
      }),
    );
    expect(validResponse.status).toBe(200);
    await expect(validResponse.json()).resolves.toMatchObject({
      status: "committed",
      revision: 1,
      plan: { revision: 1, answers },
      assessment: { success: true, modelVersion: "4.0.0" },
      snapshot: { trigger: "completed" },
    });
    expect(commitHouseholdRunwayPlan).toHaveBeenCalledWith(
      mockSupabase,
      expect.objectContaining({
        expectedRevision: 0,
        idempotencyKey,
        snapshotActionId: idempotencyKey,
        snapshotTrigger: "completed",
        adjustments,
        assessment: expect.objectContaining({
          success: true,
          answers,
          adjustments,
          scenarios: expect.any(Array),
        }),
      }),
    );
  });

  it("returns typed stale conflicts and preserves the persistence boundary", async () => {
    vi.mocked(commitHouseholdRunwayPlan).mockResolvedValueOnce({
      success: false,
      kind: "stale_revision",
      expectedRevision: 0,
      currentRevision: 4,
    });
    const response = await POST(
      request({
        answers,
        adjustments,
        status: "completed",
        idempotency_key: idempotencyKey,
        expected_revision: 0,
        snapshot_action_id: idempotencyKey,
        snapshot_trigger: "completed",
      }),
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      type: "stale_revision_conflict",
      error: "Household Runway Plan revision is stale",
      expected_revision: 0,
      current_revision: 4,
    });
  });

  it("rejects an adjustment that is normalized but outside the assessment limits", async () => {
    const invalidAdjustments = {
      ...adjustments,
      expense_reduction_cents: 600_001,
    };
    const response = await POST(
      request({
        answers,
        adjustments: invalidAdjustments,
        status: "completed",
        idempotency_key: idempotencyKey,
        expected_revision: 0,
        snapshot_action_id: idempotencyKey,
        snapshot_trigger: "completed",
      }),
    );
    expect(response.status).toBe(400);
    expect(commitHouseholdRunwayPlan).not.toHaveBeenCalled();
  });

  it("returns an authoritative idempotent replay", async () => {
    vi.mocked(commitHouseholdRunwayPlan).mockResolvedValueOnce({
      success: true,
      replayed: true,
      revision: 1,
      plan: savedCushion,
      assessment,
      snapshot: savedSnapshot,
      snapshots: [savedSnapshot],
    });
    const response = await POST(
      request({
        answers,
        adjustments,
        status: "completed",
        idempotency_key: idempotencyKey,
        expected_revision: 0,
        snapshot_action_id: idempotencyKey,
        snapshot_trigger: "completed",
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "already-applied",
      revision: 1,
      snapshots: [{ id: "snapshot-a" }],
    });
  });

  it("keeps the legacy GET read boundary owner-authenticated", async () => {
    vi.mocked(getHouseholdRunwayPlan).mockResolvedValue(savedCushion);
    vi.mocked(getRunwaySnapshots).mockResolvedValue([savedSnapshot]);
    const response = await GET(
      new NextRequest("http://localhost:3000/api/finance/cushion"),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      cushion: { revision: 1, answers },
      snapshots: [savedSnapshot],
    });
    expect(getHouseholdRunwayPlan).toHaveBeenCalledWith(mockSupabase, user.id);
    expect(getRunwaySnapshots).toHaveBeenCalledWith(mockSupabase, user.id);
  });

  it("returns an empty compatibility Plan when the authenticated owner has no Plan", async () => {
    vi.mocked(getHouseholdRunwayPlan).mockResolvedValue(null);
    const response = await GET(
      new NextRequest("http://localhost:3000/api/finance/cushion"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      cushion: null,
      snapshots: [],
    });
  });

  it("rejects unauthenticated legacy GET reads before loading the repository", async () => {
    mockAuthenticateRequest.mockResolvedValueOnce({
      ok: false,
      error: "Unauthorized",
      status: 401,
    });

    const response = await GET(
      new NextRequest("http://localhost:3000/api/finance/cushion"),
    );

    expect(response.status).toBe(401);
    expect(getHouseholdRunwayPlan).not.toHaveBeenCalled();
    expect(getRunwaySnapshots).not.toHaveBeenCalled();
  });
});
