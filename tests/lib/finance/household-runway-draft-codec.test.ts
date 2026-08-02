import { describe, expect, it } from "vitest";
import {
  createDefaultRunwayAnswers,
  type HouseholdRunwayAnswers,
} from "@/lib/finance/cushion";
import {
  createHouseholdRunwayInterview,
  type HouseholdRunwayInterviewDraft,
  type HouseholdRunwayInterviewState,
} from "@/lib/finance/household-runway-interview";
import {
  HOUSEHOLD_RUNWAY_DRAFT_TTL_MS,
  decodeHouseholdRunwayDraft,
  encodeHouseholdRunwayDraft,
} from "@/lib/finance/household-runway-draft-codec";

const NOW = new Date("2026-08-02T15:00:00.000Z");

function answers(): HouseholdRunwayAnswers {
  const defaults = createDefaultRunwayAnswers(NOW);
  return {
    ...defaults,
    region: "CA",
    shares_finances: true,
    mine: {
      ...defaults.mine,
      employment: "employed",
      monthly_take_home_cents: 500_000,
      confidence: "confirmed",
      take_home_source: "user_confirmed",
    },
    partner: {
      ...defaults.mine,
      employment: "employed",
      monthly_take_home_cents: 400_000,
      confidence: "confirmed",
      take_home_source: "user_confirmed",
    },
    available_cash: { cents: 3_000_000, confidence: "confirmed" },
    completed_expense_categories: ["housing"],
    expense_category_modes: { housing: "subtotal" },
    expense_category_subtotals: {
      housing: {
        current_monthly_cents: 300_000,
        interruption_monthly_cents: 250_000,
        confidence: "confirmed",
      },
    },
    expense_mode: "guided",
    updated_at: NOW.toISOString(),
  };
}

function draft(): HouseholdRunwayInterviewDraft {
  const input = answers();
  return {
    revision: 42,
    interviewId: "interview-42",
    startedAt: NOW.toISOString(),
    location: {
      country: "US",
      region: "CA",
      currency: "USD",
      proposedCurrency: "USD",
      currencySelection: "explicit",
    },
    answers: input,
    stageStatus: {
      location: "completed",
      household: "completed",
      employment: "completed",
      myIncome: "completed",
      partnerIncome: "completed",
      otherIncome: "skipped",
      cash: "completed",
      assets: "completed",
      expenses: "pending",
      reductions: "pending",
      review: "pending",
      result: "inapplicable",
    },
    validationIssues: { expenses: null },
    selectedScenario: "both_stop",
    availableScenarios: [
      { id: "mine_stops", subject: "mine" },
      { id: "partner_stops", subject: "partner" },
      { id: "both_stop", subject: "household" },
    ],
    planAdjustment: {
      expense_reduction_cents: 10_000,
      added_cash_cents: 20_000,
      added_monthly_income_cents: 30_000,
      expected_unconfirmed_funds_cents: 40_000,
      usable_illiquid_investments_cents: 50_000,
      usable_retirement_tax_deferred_cents: 60_000,
      usable_retirement_tax_free_cents: 70_000,
    },
    pendingCurrencyChange: { currency: "CAD", monetaryEntryCount: 3 },
    activeExpenseCategory: "housing",
  };
}

function state(): HouseholdRunwayInterviewState {
  return createHouseholdRunwayInterview({
    status: "collecting",
    stage: "expenses",
    draft: draft(),
  });
}

describe("Household Runway Draft codec", () => {
  it("preserves an in-progress location before a country is selected", () => {
    const source = createHouseholdRunwayInterview({
      status: "collecting",
      stage: "location",
    });
    const serialized = encodeHouseholdRunwayDraft(source, NOW);
    const decoded = decodeHouseholdRunwayDraft(serialized, NOW);

    expect(decoded).toMatchObject({ success: true });
    if (decoded.success) {
      expect(decoded.state.stage).toBe("location");
      expect(decoded.state.draft.location).toMatchObject({
        country: null,
        region: null,
        currency: null,
        currencySelection: "unset",
      });
    }
  });

  it("round-trips every resumable field deterministically", () => {
    const source = state();
    const input = { status: source.status, stage: source.stage, draft: source.draft };

    const first = encodeHouseholdRunwayDraft(input, NOW);
    const second = encodeHouseholdRunwayDraft(input, NOW);

    expect(first).toBe(second);
    const decoded = decodeHouseholdRunwayDraft(first, NOW);
    expect(decoded.success).toBe(true);
    if (!decoded.success) return;

    expect(decoded.state).toMatchObject({
      status: "collecting",
      stage: "expenses",
      draft: {
        revision: 42,
        interviewId: "interview-42",
        startedAt: NOW.toISOString(),
        selectedScenario: "both_stop",
        activeExpenseCategory: "housing",
        pendingCurrencyChange: { currency: "CAD", monetaryEntryCount: 3 },
        planAdjustment: draft().planAdjustment,
        answers: {
          available_cash: { cents: 3_000_000, confidence: "confirmed" },
          completed_expense_categories: ["housing"],
        },
      },
    });
  });

  it("serializes only resumable state and excludes presentation and operation data", () => {
    const source = state();
    const serialized = encodeHouseholdRunwayDraft(
      {
        status: source.status,
        stage: source.stage,
        draft: source.draft,
        operations: source.operations,
        renderModel: source.renderModel,
        validationMessage: "localized text",
        focus: "expenses",
        modal: "remember",
        analytics: { queued: true },
      } as never,
      NOW,
    );

    expect(serialized).not.toContain("operations");
    expect(serialized).not.toContain("renderModel");
    expect(serialized).not.toContain("localized text");
    expect(serialized).not.toContain("focus");
    expect(serialized).not.toContain("modal");
    expect(serialized).not.toContain("analytics");
    expect(serialized).not.toContain("availableScenarios");
  });

  it("uses the supplied time for the expiry boundary", () => {
    const serialized = encodeHouseholdRunwayDraft(
      { status: state().status, stage: state().stage, draft: state().draft },
      NOW,
    );

    expect(
      decodeHouseholdRunwayDraft(
        serialized,
        new Date(NOW.getTime() + HOUSEHOLD_RUNWAY_DRAFT_TTL_MS - 1),
      ).success,
    ).toBe(true);
    const expired = decodeHouseholdRunwayDraft(
      serialized,
      new Date(NOW.getTime() + HOUSEHOLD_RUNWAY_DRAFT_TTL_MS),
    );
    expect(expired).toMatchObject({ success: false, code: "expired", cleanup: true });
  });

  it.each(["", "not-json", "null", "[]", "{}", "{\"schema_version\":999}", new Uint8Array([0xff, 0xfe, 0x00])])(
    "rejects arbitrary malformed or unsupported bytes",
    (raw) => {
      expect(decodeHouseholdRunwayDraft(raw, NOW)).toMatchObject({
        success: false,
        cleanup: true,
      });
    },
  );

  it("reports an unsupported historical version after parsing its envelope", () => {
    expect(
      decodeHouseholdRunwayDraft(
        JSON.stringify({
          version: 999,
          expires_at: new Date(NOW.getTime() + 60_000).toISOString(),
        }),
        NOW,
      ),
    ).toMatchObject({ success: false, code: "unsupported_version", cleanup: true });
  });

  it("migrates the historical answer envelope versions", () => {
    const oldAnswers = { ...answers(), schema_version: 3 };
    const raw = JSON.stringify({
      version: 3,
      expires_at: new Date(NOW.getTime() + 60_000).toISOString(),
      step_id: "assets",
      completed: false,
      answers: oldAnswers,
    });

    const migrated = decodeHouseholdRunwayDraft(raw, NOW);
    expect(migrated.success).toBe(true);
    if (!migrated.success) return;
    expect(migrated.state.stage).toBe("assets");
    expect(migrated.state.status).toBe("collecting");
    expect(migrated.state.draft.answers.schema_version).toBe(4);
  });

  it("migrates the earlier boundary envelope and derives its resumable stage", () => {
    const historicalDraft = draft();
    historicalDraft.stageStatus = {
      ...historicalDraft.stageStatus,
      expenses: "completed",
      reductions: "pending",
    };
    historicalDraft.activeExpenseCategory = null;
    const raw = JSON.stringify({
      version: 1,
      expires_at: new Date(NOW.getTime() + 60_000).toISOString(),
      draft: historicalDraft,
    });

    const migrated = decodeHouseholdRunwayDraft(raw, NOW);
    expect(migrated.success).toBe(true);
    if (!migrated.success) return;
    expect(migrated.state.stage).toBe("reductions");
  });

  it("rejects invalid current stages, nested expense progress, and Scenario restoration", () => {
    const current = JSON.parse(
      encodeHouseholdRunwayDraft(
        { status: state().status, stage: state().stage, draft: state().draft },
        NOW,
      ),
    ) as Record<string, unknown>;

    expect(
      decodeHouseholdRunwayDraft(
        JSON.stringify({ ...current, stage: "unknown-stage" }),
        NOW,
      ),
    ).toMatchObject({ success: false, code: "invalid_stage", cleanup: true });

    expect(
      decodeHouseholdRunwayDraft(
        JSON.stringify({
          ...current,
          draft: { ...(current.draft as object), activeExpenseCategory: "unknown-category" },
        }),
        NOW,
      ),
    ).toMatchObject({ success: false, code: "invalid_nested_progress", cleanup: true });

    expect(
      decodeHouseholdRunwayDraft(
        JSON.stringify({
          ...current,
          draft: { ...(current.draft as object), selectedScenario: "current" },
        }),
        NOW,
      ),
    ).toMatchObject({ success: false, code: "invalid_scenario", cleanup: true });
  });

  it("never restores an incomplete draft as completed", () => {
    const current = JSON.parse(
      encodeHouseholdRunwayDraft(
        { status: state().status, stage: state().stage, draft: state().draft },
        NOW,
      ),
    ) as Record<string, unknown>;
    const malformed = {
      ...current,
      status: "completed",
      stage: "result",
      draft: {
        ...(current.draft as object),
        stageStatus: {
          ...((current.draft as Record<string, unknown>).stageStatus as object),
          result: "completed",
        },
        activeExpenseCategory: null,
        answers: {
          ...((current.draft as Record<string, unknown>).answers as object),
          country: null,
          region: null,
          currency: null,
          updated_at: null,
        },
        location: {
          country: null,
          region: null,
          currency: null,
          proposedCurrency: null,
          currencySelection: "unset",
        },
      },
    };

    expect(decodeHouseholdRunwayDraft(JSON.stringify(malformed), NOW)).toMatchObject({
      success: false,
      code: "incomplete_completion",
      cleanup: true,
    });
  });
});
