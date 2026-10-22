/** Validates supported intents and constructs correlated Interview commands. */

import type { RecurringIncomeSource } from "@/lib/finance/cushion";

import type {
  HouseholdRunwayInterviewCommandInput,
  HouseholdRunwayInterviewStage,
  HouseholdRunwayInterviewCommand,
} from "@/lib/finance/internal/household-runway-interview";

/** User actions accepted by the Runtime. Protocol messages are deliberately absent. */
const RUNTIME_COMMAND_INTENT_TYPES = [
  "start",
  "start_new",
  "select_country",
  "select_region",
  "select_currency",
  "request_currency_change",
  "reset_currency_entries",
  "retain_currency_entries",
  "set_household",
  "set_employment",
  "set_income",
  "set_cash",
  "set_asset",
  "set_expense_mode",
  "set_quick_expenses",
  "set_expense_category_mode",
  "set_expense_category_subtotal",
  "set_expense_item",
  "set_housing_tenure",
  "update_answers",
  "select_scenario",
  "set_plan_adjustment",
  "reset_plan_adjustment",
  "apply_plan_adjustment",
  "edit_completed_plan",
  "set_active_expense_category",
  "set_reduction",
  "continue",
  "back",
  "skip",
  "discard_draft",
  "clear_device_draft",
  "remember_draft",
  "import_draft",
  "resume_draft",
  "resume_committed_plan",
  "save_plan",
  "request_report_download",
] as const satisfies readonly HouseholdRunwayInterviewCommandInput["type"][];

const RUNTIME_INTENT_TYPES = [
  ...RUNTIME_COMMAND_INTENT_TYPES,
  "set_other_income_source_enabled",
  "update_other_income_source",
  "add_other_income_source",
  "remove_other_income_source",
  "registration_clicked",
] as const;

type RuntimeCommandIntent = Extract<
  HouseholdRunwayInterviewCommandInput,
  { type: (typeof RUNTIME_COMMAND_INTENT_TYPES)[number] }
>;

type HouseholdRunwayOtherIncomeSourceType = Exclude<
  RecurringIncomeSource["type"],
  "other"
>;

type HouseholdRunwayRuntimeSemanticIntent =
  | {
      type: "set_other_income_source_enabled";
      sourceType: HouseholdRunwayOtherIncomeSourceType;
      enabled: boolean;
    }
  | {
      type: "update_other_income_source";
      id: string;
      patch: Partial<
        Pick<RecurringIncomeSource, "label" | "monthly_cents" | "confidence">
      >;
    }
  | { type: "add_other_income_source" }
  | { type: "remove_other_income_source"; id: string }
  | { type: "registration_clicked" };

/** The only user actions a Runtime caller may dispatch. */
export type HouseholdRunwayInterviewIntent =
  | Exclude<RuntimeCommandIntent, { type: "start" | "start_new" | "resume_draft" }>
  | { type: "start"; stage?: HouseholdRunwayInterviewStage }
  | { type: "start_new" }
  | { type: "resume_draft" }
  | { type: "save_plan" }
  | HouseholdRunwayRuntimeSemanticIntent;

const runtimeIntentTypeSet = new Set<string>(RUNTIME_INTENT_TYPES);

export function isRuntimeIntent(value: unknown): value is HouseholdRunwayInterviewIntent {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string" &&
    runtimeIntentTypeSet.has(value.type)
  );
}

export function commandMetadata(
  id: () => string,
  now: () => string,
  type: string,
): Pick<HouseholdRunwayInterviewCommand, "commandId" | "occurredAt"> {
  return {
    commandId: `${type}:${id()}`,
    occurredAt: now(),
  };
}

export function outcomeCommand(
  id: () => string,
  now: () => string,
  input: HouseholdRunwayInterviewCommandInput,
): HouseholdRunwayInterviewCommand {
  return { ...input, ...commandMetadata(id, now, "outcome") } as HouseholdRunwayInterviewCommand;
}
