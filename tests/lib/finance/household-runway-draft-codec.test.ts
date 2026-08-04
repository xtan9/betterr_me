import { describe, expect, it } from "vitest";
import {
  createDefaultRunwayAnswers,
  type HouseholdRunwayAnswers,
} from "@/lib/finance/cushion";
import {
  createHouseholdRunwayInterview,
  type HouseholdRunwayInterviewDraft,
  type HouseholdRunwayInterviewState,
} from "@/lib/finance/internal/household-runway-interview";
import {
  HOUSEHOLD_RUNWAY_DRAFT_TTL_MS,
  decodeHouseholdRunwayDraft,
  encodeHouseholdRunwayDraft,
} from "@/lib/finance/internal/household-runway-draft-codec";

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

function encodedEnvelope() {
  return JSON.parse(
    encodeHouseholdRunwayDraft(
      { status: state().status, stage: state().stage, draft: state().draft },
      NOW,
    ),
  ) as Record<string, unknown>;
}

function decodeMutation(
  mutate: (payload: Record<string, unknown>) => void,
) {
  const payload = encodedEnvelope();
  mutate(payload);
  return decodeHouseholdRunwayDraft(JSON.stringify(payload), NOW);
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

  it.each([
    ["a non-record draft", (payload: Record<string, unknown>) => { payload.draft = null; }],
    ["non-record validation issues", (payload: Record<string, unknown>) => {
      (payload.draft as Record<string, unknown>).validationIssues = null;
    }],
    ["answers that disagree with the location", (payload: Record<string, unknown>) => {
      (payload.draft as Record<string, unknown>).answers = {
        ...((payload.draft as Record<string, unknown>).answers as object),
        country: "CA",
        region: "AB",
        currency: "CAD",
      };
    }],
    ["an unset currency selection with a proposed currency", (payload: Record<string, unknown>) => {
      (payload.draft as Record<string, unknown>).location = {
        ...((payload.draft as Record<string, unknown>).location as object),
        currency: null,
        proposedCurrency: "CAD",
        currencySelection: "unset",
      };
    }],
    ["a pending result stage status", (payload: Record<string, unknown>) => {
      ((payload.draft as Record<string, unknown>).stageStatus as Record<string, unknown>).result = "pending";
    }],
    ["an inapplicable expense stage", (payload: Record<string, unknown>) => {
      ((payload.draft as Record<string, unknown>).stageStatus as Record<string, unknown>).expenses = "inapplicable";
    }],
  ] as const)("rejects %s cross-field draft", (_label, mutate) => {
    const result = decodeMutation(mutate);
    expect(result).toMatchObject({ success: false, cleanup: true });
  });

  it("rejects a current draft whose status and stage are inconsistent", () => {
    const result = decodeMutation((payload) => {
      payload.status = "reviewing";
      payload.stage = "expenses";
    });
    expect(result).toMatchObject({
      success: false,
      code: "invalid_stage",
      cleanup: true,
    });
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

  it.each([
    ["missing location", (draft: Record<string, unknown>) => { draft.location = null; }],
    ["invalid region type", (draft: Record<string, unknown>) => { (draft.location as Record<string, unknown>).region = 42; }],
    ["invalid currency", (draft: Record<string, unknown>) => { (draft.location as Record<string, unknown>).currency = "EUR"; }],
    ["invalid proposed currency", (draft: Record<string, unknown>) => { (draft.location as Record<string, unknown>).proposedCurrency = "EUR"; }],
    ["invalid currency selection", (draft: Record<string, unknown>) => { (draft.location as Record<string, unknown>).currencySelection = "automatic"; }],
    ["region without country", (draft: Record<string, unknown>) => {
      const location = draft.location as Record<string, unknown>;
      location.country = null;
      location.region = "CA";
      location.currency = null;
      location.proposedCurrency = null;
      location.currencySelection = "unset";
    }],
    ["currency on an unset location", (draft: Record<string, unknown>) => {
      const location = draft.location as Record<string, unknown>;
      location.country = null;
      location.region = null;
      location.currency = "USD";
      location.proposedCurrency = null;
      location.currencySelection = "unset";
    }],
    ["proposed selection with an explicit currency", (draft: Record<string, unknown>) => {
      const location = draft.location as Record<string, unknown>;
      location.currencySelection = "proposed";
      location.currency = "USD";
    }],
    ["explicit selection without a currency", (draft: Record<string, unknown>) => {
      const location = draft.location as Record<string, unknown>;
      location.currencySelection = "explicit";
      location.currency = null;
    }],
  ] as const)("rejects %s location envelopes", (_label, mutate) => {
    const result = decodeMutation((payload) => mutate(payload.draft as Record<string, unknown>));
    expect(result).toMatchObject({ success: false, code: "invalid_draft", cleanup: true });
  });

  it.each([
    ["invalid country", (answers: Record<string, unknown>) => { answers.country = "GB"; }],
    ["invalid region type", (answers: Record<string, unknown>) => { answers.region = 7; }],
    ["invalid currency", (answers: Record<string, unknown>) => { answers.currency = "EUR"; }],
    ["invalid timestamp", (answers: Record<string, unknown>) => { answers.updated_at = "not-a-date"; }],
    ["invalid answer schema", (answers: Record<string, unknown>) => { answers.schema_version = 99; }],
  ] as const)("rejects %s answer envelopes", (_label, mutate) => {
    const result = decodeMutation((payload) => mutate(
      (payload.draft as Record<string, unknown>).answers as Record<string, unknown>,
    ));
    expect(result).toMatchObject({ success: false, code: "invalid_draft", cleanup: true });
  });

  it.each([
    ["an unknown validation code", { expenses: { code: "unknown" } }],
    ["an invalid validation stage", { expenses: { code: "assessment_required", stage: "unknown" } }],
    ["a non-array validation path", { expenses: { code: "assessment_required", path: "expenses" } }],
  ] as const)("rejects %s validation issues", (_label, validationIssues) => {
    const result = decodeMutation((payload) => {
      (payload.draft as Record<string, unknown>).validationIssues = validationIssues;
    });
    expect(result).toMatchObject({ success: false, code: "invalid_draft", cleanup: true });
  });

  it.each([
    ["a missing stage status", (draft: Record<string, unknown>) => {
      delete (draft.stageStatus as Record<string, unknown>).expenses;
    }],
    ["an invalid stage status", (draft: Record<string, unknown>) => {
      (draft.stageStatus as Record<string, unknown>).expenses = "unknown";
    }],
    ["duplicate nested expense progress", (draft: Record<string, unknown>) => {
      (draft.answers as Record<string, unknown>).completed_expense_categories = ["housing", "housing"];
    }],
    ["invalid pending currency", (draft: Record<string, unknown>) => {
      draft.pendingCurrencyChange = { currency: "EUR", monetaryEntryCount: 1 };
    }],
    ["invalid pending entry count", (draft: Record<string, unknown>) => {
      draft.pendingCurrencyChange = { currency: "CAD", monetaryEntryCount: "1" };
    }],
    ["unavailable scenario", (draft: Record<string, unknown>) => {
      draft.selectedScenario = "not-a-scenario";
    }],
  ] as const)("rejects %s draft progress", (_label, mutate) => {
    const result = decodeMutation((payload) => mutate(payload.draft as Record<string, unknown>));
    expect(result).toMatchObject({ success: false, cleanup: true });
  });

  it("rejects an active expense category when the restored stage is not Expenses", () => {
    const result = decodeMutation((payload) => {
      payload.stage = "review";
      (payload.draft as Record<string, unknown>).activeExpenseCategory = "housing";
    });
    expect(result).toMatchObject({
      success: false,
      code: "invalid_nested_progress",
      cleanup: true,
    });
  });

  it("migrates the legacy numeric-step envelope and rejects invalid legacy stages", () => {
    const legacyAnswers = { ...answers(), schema_version: 4 };
    const migrated = decodeHouseholdRunwayDraft(
      JSON.stringify({
        version: 2,
        expires_at: new Date(NOW.getTime() + 60_000).toISOString(),
        step: 3,
        completed: false,
        answers: legacyAnswers,
      }),
      NOW,
    );
    expect(migrated).toMatchObject({ success: true, schemaVersion: 2 });

    expect(
      decodeHouseholdRunwayDraft(
        JSON.stringify({
          version: 4,
          expires_at: new Date(NOW.getTime() + 60_000).toISOString(),
          step_id: "not-a-stage",
          answers: legacyAnswers,
        }),
        NOW,
      ),
    ).toMatchObject({ success: false, code: "invalid_stage", cleanup: true });
  });

  it.each([
    ["confirmedFunds", "assets"],
    ["temporaryIncome", "review"],
  ] as const)("maps the legacy %s stage alias", (step_id, stage) => {
    const result = decodeHouseholdRunwayDraft(
      JSON.stringify({
        version: 3,
        expires_at: new Date(NOW.getTime() + 60_000).toISOString(),
        step_id,
        completed: false,
        answers: { ...answers(), schema_version: 3 },
      }),
      NOW,
    );
    expect(result).toMatchObject({ success: true, schemaVersion: 3 });
    if (result.success) expect(result.state.stage).toBe(stage);
  });

  it("derives completed and active expense stages from the v1 envelope", () => {
    const completedDraft = draft();
    completedDraft.activeExpenseCategory = null;
    completedDraft.stageStatus = {
      ...completedDraft.stageStatus,
      result: "completed",
    };
    const completed = decodeHouseholdRunwayDraft(
      JSON.stringify({
        version: 1,
        expires_at: new Date(NOW.getTime() + 60_000).toISOString(),
        draft: completedDraft,
      }),
      NOW,
    );
    expect(completed).toMatchObject({ success: false, cleanup: true });

    const active = decodeHouseholdRunwayDraft(
      JSON.stringify({
        version: 1,
        expires_at: new Date(NOW.getTime() + 60_000).toISOString(),
        draft: draft(),
      }),
      NOW,
    );
    expect(active).toMatchObject({
      success: true,
      state: { status: "collecting", stage: "expenses" },
    });
  });

  it("rejects non-text bytes and non-numeric historical versions", () => {
    expect(decodeHouseholdRunwayDraft({} as never, NOW)).toMatchObject({
      success: false,
      code: "malformed",
    });
    expect(
      decodeHouseholdRunwayDraft(
        JSON.stringify({
          version: "3",
          expires_at: new Date(NOW.getTime() + 60_000).toISOString(),
          answers: { ...answers(), schema_version: 3 },
        }),
        NOW,
      ),
    ).toMatchObject({ success: false, code: "unsupported_version" });
  });

  it("rejects invalid codec dates before touching storage state", () => {
    expect(decodeHouseholdRunwayDraft(null, NOW)).toMatchObject({
      success: false,
      code: "malformed",
    });
    expect(decodeHouseholdRunwayDraft("{}", new Date("invalid"))).toMatchObject({
      success: false,
      code: "malformed",
    });
    expect(() => encodeHouseholdRunwayDraft(
      { status: state().status, stage: state().stage, draft: state().draft },
      new Date("invalid"),
    )).toThrow("malformed");
  });
});
