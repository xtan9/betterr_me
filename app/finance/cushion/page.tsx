import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import {
  getFinanceCushion,
  getRunwaySnapshots,
} from "@/lib/finance/repository";
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
  alternates: { canonical: "/finance/cushion" },
  openGraph: {
    title: "Household Runway | BetterR.me",
    description:
      "A private, no-account household income-interruption stress test.",
    type: "website",
    url: "/finance/cushion",
  },
};

function migrateLegacy(
  record: Awaited<ReturnType<typeof getFinanceCushion>>,
): HouseholdRunwayAnswers | null {
  if (!record) return null;
  if (record.answers) return record.answers;
  const answers = createDefaultRunwayAnswers(new Date(record.updated_at));
  answers.available_cash = {
    cents: record.liquid_resources_cents,
    confidence: "confirmed",
  };
  if (record.monthly_continuing_income_cents > 0) {
    answers.other_income_sources = [
      {
        id: "legacy-continuing-income",
        type: "other",
        label: "Previous continuing income",
        monthly_cents: record.monthly_continuing_income_cents,
        confidence: "needs_review",
      },
    ];
  }
  answers.mine = {
    ...answers.mine,
    employment: "unemployed",
    entered_amount_cents: 0,
    monthly_take_home_cents: 0,
    estimated_monthly_take_home_cents: 0,
    take_home_source: "user_confirmed",
    confidence: "confirmed",
  };
  answers.expense_mode = "quick";
  answers.quick_expenses = {
    current_monthly_cents: record.monthly_essential_expenses_cents,
    interruption_monthly_cents: record.monthly_essential_expenses_cents,
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
        initialSnapshots={[]}
      />
    );
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [cushion, snapshots] = user
    ? await Promise.all([
        getFinanceCushion(supabase, user.id),
        getRunwaySnapshots(supabase, user.id),
      ])
    : [null, []];
  return (
    <HouseholdRunway
      initialAnswers={migrateLegacy(cushion)}
      isAuthenticated={Boolean(user)}
      hasSavedPlan={Boolean(cushion)}
      initialSnapshots={snapshots}
    />
  );
}
