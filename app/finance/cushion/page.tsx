import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createHouseholdRunwayService } from "@/lib/finance/household-runway-service";
import { HouseholdRunway } from "@/components/finance/household-runway";
import { SidebarShell } from "@/components/layouts/sidebar-shell";
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

export default async function FinanceCushionPage() {
  if (!hasEnvVars) {
    return (
      <HouseholdRunway
        initialAnswers={null}
        initialPlanRevision={0}
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
  const { plan, snapshots } = user
    ? await createHouseholdRunwayService(supabase).load(user.id)
    : { plan: null, snapshots: [] };
  const runway = (
    <HouseholdRunway
      initialAnswers={plan?.inputs ?? null}
      initialPlanRevision={plan?.revision ?? 0}
      isAuthenticated={Boolean(user)}
      hasSavedPlan={Boolean(plan?.inputs)}
      initialSnapshots={snapshots}
    />
  );
  return user ? <SidebarShell>{runway}</SidebarShell> : runway;
}
