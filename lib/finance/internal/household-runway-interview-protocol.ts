/** Private commands, events, and effects exchanged by the Interview and its Runtime. */

import type {
  RunwayCountry,
  RunwayCurrency,
  EmploymentStatus,
  IncomeAnswer,
  RecurringIncomeSource,
  MoneyAnswer,
  ExpenseMode,
  QuickExpenses,
  ExpenseCategoryMode,
  ExpenseCategorySubtotal,
  ExpenseLineItem,
  HousingTenure,
  HouseholdRunwayAnswers,
  RunwayScenario,
  RunwayAdjustments,
  RunwaySnapshotSummary,
} from "@/lib/finance/cushion";

import type { ExpenseCategory, ExpenseItemType } from "@/lib/finance/runway-expenses";

import type {
  SuccessfulHouseholdRunwayAssessment,
} from "@/lib/finance/household-runway-assessment";

import type {
  HouseholdRunwayAnalyticsEventKind,
  HouseholdRunwayAnalyticsStage,
} from "@/lib/finance/household-runway-analytics";

import type {
  HouseholdRunwayPlanAdjustmentField,
} from "@/lib/finance/internal/household-runway-plan-adjustment";

import type {
  HouseholdRunwayInterviewStage,
  HouseholdRunwayAssetKey,
  HouseholdRunwayDraftDeviceAction,
  HouseholdRunwayInterviewOperationError,
  HouseholdRunwayValidationIssue,
  HouseholdRunwayInterviewDraft,
  HouseholdRunwayInterviewStatus,
  HouseholdRunwayInterviewState,
} from "./household-runway-interview-model";

import type {
  HouseholdRunwayResumeOption,
  HouseholdRunwayInterviewRenderModel,
} from "./household-runway-interview-projections";

export interface HouseholdRunwayInterviewCommandMetadata {
  commandId: string;
  occurredAt: string;
}

export type HouseholdRunwayInterviewCommandInput =
  | {
      type: "start";
      interviewId: string;
      stage?: HouseholdRunwayInterviewStage;
    }
  | {
      type: "start_new";
      interviewId: string;
      stage?: HouseholdRunwayInterviewStage;
    }
  | { type: "select_country"; country: RunwayCountry }
  | { type: "select_region"; region: string }
  | { type: "select_currency"; currency: RunwayCurrency }
  | { type: "request_currency_change"; currency: RunwayCurrency }
  | { type: "reset_currency_entries"; currency?: RunwayCurrency }
  | { type: "retain_currency_entries"; currency?: RunwayCurrency }
  | {
      type: "set_household";
      sharesFinances: boolean;
      hasChildren?: boolean;
      hasSupportObligations?: boolean;
    }
  | {
      type: "set_employment";
      person: "mine" | "partner";
      employment: EmploymentStatus;
    }
  | {
      type: "set_income";
      person: "mine" | "partner";
      patch: Partial<IncomeAnswer>;
    }
  | {
      type: "set_other_income_sources";
      sources: readonly RecurringIncomeSource[];
    }
  | { type: "set_cash"; value: MoneyAnswer }
  | {
      type: "set_asset";
      asset: HouseholdRunwayAssetKey;
      value: MoneyAnswer;
    }
  | { type: "set_expense_mode"; mode: ExpenseMode }
  | { type: "set_quick_expenses"; patch: Partial<QuickExpenses> }
  | {
      type: "set_expense_category_mode";
      category: ExpenseCategory;
      mode: ExpenseCategoryMode;
    }
  | {
      type: "set_expense_category_subtotal";
      category: ExpenseCategory;
      patch: Partial<ExpenseCategorySubtotal>;
    }
  | {
      type: "set_expense_item";
      category: ExpenseCategory;
      itemType: ExpenseItemType;
      itemId: string;
      patch: Partial<ExpenseLineItem>;
    }
  | { type: "set_housing_tenure"; tenure: HousingTenure }
  | { type: "update_answers"; patch: Partial<HouseholdRunwayAnswers> }
  | { type: "select_scenario"; scenario: RunwayScenario }
  | {
      type: "set_plan_adjustment";
      patch: Partial<RunwayAdjustments>;
    }
  | { type: "reset_plan_adjustment" }
  | { type: "apply_plan_adjustment" }
  | { type: "edit_completed_plan" }
  | { type: "set_active_expense_category"; category: ExpenseCategory | null }
  | { type: "complete_expense_category"; category: ExpenseCategory }
  | {
      type: "set_reduction";
      target:
        | { kind: "quick" }
        | { kind: "category"; category: ExpenseCategory }
        | { kind: "item"; itemId: string };
      interruptionMonthlyCents: number;
    }
  | { type: "continue" }
  | { type: "back" }
  | { type: "skip" }
  | { type: "exit" }
  | { type: "discard_draft" }
  | { type: "clear_device_draft" }
  | { type: "remember_draft" }
  | { type: "import_draft" }
  | { type: "resume_draft"; interviewId: string }
  | { type: "resume_committed_plan" }
  | {
      type: "history_projection_changed";
      destination: "landing";
    }
  | {
      type: "history_projection_changed";
      destination: "interview";
      interviewId: string;
      stage?: HouseholdRunwayInterviewStage;
    }
  | { type: "synchronize_draft" }
  | {
      type: "draft_synchronization_succeeded";
      sourceRevision: number;
      correlationId: string;
    }
  | {
      type: "draft_synchronization_failed";
      sourceRevision: number;
      correlationId: string;
      error: "storage_unavailable" | "stale_result";
    }
  | {
      type: "draft_device_operation_succeeded";
      action: HouseholdRunwayDraftDeviceAction;
      sourceRevision: number;
      correlationId: string;
    }
  | {
      type: "draft_device_operation_failed";
      action: HouseholdRunwayDraftDeviceAction;
      sourceRevision: number;
      correlationId: string;
      error: "storage_unavailable" | "stale_result";
    }
  | {
      type: "save_plan" | "request_plan_persistence";
      idempotencyKey?: string;
    }
  | {
      type: "plan_persistence_succeeded";
      sourceRevision: number;
      correlationId: string;
      planRevision?: number;
      planInputs?: HouseholdRunwayAnswers;
      assessment?: SuccessfulHouseholdRunwayAssessment;
      snapshot?: RunwaySnapshotSummary;
      snapshots?: readonly RunwaySnapshotSummary[];
    }
  | {
      type: "plan_persistence_failed";
      sourceRevision: number;
      correlationId: string;
      currentPlanRevision?: number;
      error: Extract<
        HouseholdRunwayInterviewOperationError,
        | "authentication_required"
        | "capability_unavailable"
        | "conflict"
        | "exception"
        | "invalid"
        | "network"
        | "stale_result"
      >;
    }
  | { type: "request_report_download" }
  | {
      type: "report_download_succeeded";
      sourceRevision: number;
      correlationId: string;
    }
  | {
      type: "report_download_failed";
      sourceRevision: number;
      correlationId: string;
      error:
        | "capability_unavailable"
        | "download_failed"
        | "exception"
        | "stale_result";
    }
  | {
      type: "request_analytics";
      eventName: HouseholdRunwayAnalyticsEventKind;
      stage?: HouseholdRunwayAnalyticsStage;
    }
  | {
      type: "analytics_succeeded";
      sourceRevision: number;
      correlationId: string;
    }
  | {
      type: "analytics_failed";
      sourceRevision: number;
      correlationId: string;
    };

export type HouseholdRunwayInterviewCommand =
  HouseholdRunwayInterviewCommandMetadata & HouseholdRunwayInterviewCommandInput;

export type HouseholdRunwayInterviewEvent =
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "interview_started";
      interviewId: string;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "interview_restarted";
      interviewId: string;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "country_selected";
      country: RunwayCountry;
      proposedCurrency: RunwayCurrency;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "region_selected";
      region: string | null;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "currency_selected";
      currency: RunwayCurrency;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "currency_change_requested";
      currency: RunwayCurrency;
      monetaryEntryCount: number;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "currency_entries_reset" | "currency_entries_retained";
      currency: RunwayCurrency;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "validation_blocked";
      stage: HouseholdRunwayInterviewStage;
      issue: HouseholdRunwayValidationIssue;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "location_completed";
      country: RunwayCountry;
      region: string;
      currency: RunwayCurrency;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "stage_completed" | "stage_skipped" | "stage_inapplicable";
      stage: HouseholdRunwayInterviewStage;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "answers_cleared";
      stages: readonly HouseholdRunwayInterviewStage[];
      reason: "inapplicable" | "explicit_skip" | "currency_reset";
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "income_estimate_recomputed";
      person: "mine" | "partner";
      ruleVersion: string;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "scenario_selected" | "scenario_fallback";
      scenario: RunwayScenario;
      previousScenario?: RunwayScenario | null;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "plan_adjustment_updated";
      fields: readonly HouseholdRunwayPlanAdjustmentField[];
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "plan_adjustment_reset" | "plan_adjustment_applied";
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "completed_plan_edit_started";
      planRevision: number | null;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type:
        | "draft_synchronization_requested"
        | "draft_synchronized"
        | "draft_synchronization_failed"
        | "draft_device_operation_requested"
        | "draft_device_operation_succeeded"
        | "draft_device_operation_failed"
        | "plan_persistence_requested"
        | "plan_persisted"
        | "plan_persistence_failed"
        | "report_download_requested"
        | "report_downloaded"
        | "report_download_failed"
        | "analytics_requested"
        | "analytics_recorded"
        | "analytics_failed";
      sourceRevision: number;
      correlationId: string;
      action?: HouseholdRunwayDraftDeviceAction;
      scope?: "device" | "all";
      error?: HouseholdRunwayInterviewOperationError;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "expense_category_opened" | "expense_category_completed";
      category: ExpenseCategory;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "interview_exited" | "draft_discarded";
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "resume_choice_made";
      option: HouseholdRunwayResumeOption;
      sourceRevision?: number;
      correlationId?: string;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "command_ignored";
      command: HouseholdRunwayInterviewCommand["type"];
      reason:
        | "invalid_stage"
        | "already_started"
        | "already_not_started"
        | "stage_not_skippable"
        | "no_pending_currency_change"
        | "partner_not_applicable"
        | "scenario_unavailable"
        | "expense_category_not_open"
        | "operation_not_pending"
        | "plan_adjustment_unavailable";
    });

export type HouseholdRunwayInterviewEffect =
  | {
      type: "history";
      action: "push" | "replace" | "back";
      destination: "landing" | "interview";
    }
  | { type: "focus"; stage: HouseholdRunwayInterviewStage }
  | {
      type: "draft_sync_requested";
      draft: HouseholdRunwayInterviewDraft;
      status: HouseholdRunwayInterviewStatus;
      stage: HouseholdRunwayInterviewStage | null;
      sourceRevision: number;
      correlationId: string;
    }
  | {
      type:
        | "draft_device_remember_requested"
        | "draft_device_import_requested";
      draft: HouseholdRunwayInterviewDraft;
      status: HouseholdRunwayInterviewStatus;
      stage: HouseholdRunwayInterviewStage | null;
      sourceRevision: number;
      correlationId: string;
    }
  | {
      type: "draft_device_clear_requested";
      scope: "device" | "all";
      sourceRevision: number;
      correlationId: string;
    }
  | {
      type: "plan_persistence_requested";
      inputs: HouseholdRunwayAnswers;
      assessment: SuccessfulHouseholdRunwayAssessment;
      sourceRevision: number;
      correlationId: string;
      idempotencyKey: string;
      expectedPlanRevision: number;
      adjustments: RunwayAdjustments;
      snapshotTrigger: RunwaySnapshotSummary["trigger"];
    }
  | {
      type: "report_download_requested";
      assessment: SuccessfulHouseholdRunwayAssessment;
      sourceRevision: number;
      correlationId: string;
    }
  | {
      type: "analytics_requested";
      eventName: HouseholdRunwayAnalyticsEventKind;
      stage?: HouseholdRunwayAnalyticsStage;
      sourceRevision: number;
      correlationId: string;
    };

export interface HouseholdRunwayInterviewTransition {
  state: HouseholdRunwayInterviewState;
  nextState: HouseholdRunwayInterviewState;
  renderModel: HouseholdRunwayInterviewRenderModel;
  /** Derived complete inputs exposed at the public transition boundary. */
  planInputs: HouseholdRunwayAnswers | null;
  /** Current assessment derived from planInputs, when the state is reviewable. */
  assessment: SuccessfulHouseholdRunwayAssessment | null;
  events: readonly HouseholdRunwayInterviewEvent[];
  effects: readonly HouseholdRunwayInterviewEffect[];
}
