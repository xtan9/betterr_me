import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getFinanceCushion } from "@/lib/finance/repository";
import {
  createDefaultRunwayAnswers,
  type HouseholdRunwayAnswers,
} from "@/lib/finance/cushion";
import { HouseholdRunway } from "@/components/finance/household-runway";
import { hasEnvVars } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Household Runway | BetterR.me",
  description:
    "See how long your household could cover essential costs if one or both incomes stopped, why, and which realistic change helps most.",
};

function migrateLegacy(
  record: Awaited<ReturnType<typeof getFinanceCushion>>,
): HouseholdRunwayAnswers | null {
  if (!record) return null;
  if (record.answers?.schema_version === 2) return record.answers;
  const answers = createDefaultRunwayAnswers(new Date(record.updated_at));
  answers.region = "Needs review";
  answers.available_cash = {
    cents: record.liquid_resources_cents,
    confidence: "confirmed",
  };
  answers.other_monthly_income = {
    cents: record.monthly_continuing_income_cents,
    confidence: "confirmed",
  };
  answers.mine = {
    ...answers.mine,
    employment: "unemployed",
    entered_amount_cents: 0,
    monthly_take_home_cents: 0,
    confidence: "confirmed",
  };
  answers.expenses.other = {
    current_cents: record.monthly_essential_expenses_cents,
    interruption_cents: record.monthly_essential_expenses_cents,
    confidence: "confirmed",
  };
  return answers;
}

export default async function FinanceCushionPage() {
  if (!hasEnvVars) {
    return (
      <HouseholdRunway
        initialAnswers={null}
        isAuthenticated={false}
        hasSavedPlan={false}
      />
    );
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const cushion = user ? await getFinanceCushion(supabase, user.id) : null;
  return (
    <HouseholdRunway
      initialAnswers={migrateLegacy(cushion)}
      isAuthenticated={Boolean(user)}
      hasSavedPlan={Boolean(cushion)}
    />
  );
}
