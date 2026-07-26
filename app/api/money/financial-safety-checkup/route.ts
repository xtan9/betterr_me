import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHousehold } from "@/lib/db/households";

type CheckupInputs = {
  accessibleCashCents?: number;
  essentialMonthlyExpensesCents?: number;
  myMonthlyIncomeCents?: number;
  partnerMonthlyIncomeCents?: number;
};

async function currentHousehold() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, householdId: null };
  return { supabase, householdId: await resolveHousehold(supabase) };
}

export async function GET() {
  try {
    const { supabase, householdId } = await currentHousehold();
    if (!householdId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data, error } = await supabase
      .from("financial_safety_checkups")
      .select("id, status, selected_scenario, inputs, latest_result, updated_at")
      .eq("household_id", householdId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ checkup: data });
  } catch {
    return NextResponse.json({ error: "Unable to load safety check-up" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { inputs?: CheckupInputs; selectedScenario?: string };
    const inputs = body.inputs ?? {};
    for (const value of Object.values(inputs)) {
      if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
        return NextResponse.json({ error: "Amounts must be non-negative whole cents" }, { status: 400 });
      }
    }
    const { supabase, householdId } = await currentHousehold();
    if (!householdId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data: existing, error: existingError } = await supabase
      .from("financial_safety_checkups").select("id, inputs")
      .eq("household_id", householdId).eq("status", "in_progress")
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (existingError) throw existingError;
    const values = { ...((existing?.inputs ?? {}) as CheckupInputs), ...inputs };
    const mutation = existing
      ? supabase.from("financial_safety_checkups").update({ inputs: values, selected_scenario: body.selectedScenario ?? null }).eq("id", existing.id)
      : supabase.from("financial_safety_checkups").insert({ household_id: householdId, inputs: values, selected_scenario: body.selectedScenario ?? "both_incomes_stop" });
    const { data, error } = await mutation.select("id, status, selected_scenario, inputs, updated_at").single();
    if (error) throw error;
    return NextResponse.json({ checkup: data }, { status: existing ? 200 : 201 });
  } catch {
    return NextResponse.json({ error: "Unable to save safety check-up" }, { status: 500 });
  }
}
