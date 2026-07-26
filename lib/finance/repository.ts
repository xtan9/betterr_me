import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FINANCE_CUSHION_COLUMNS,
  toFinanceCushionView,
  type FinanceCushionRecord,
  type FinanceCushionView,
} from "@/lib/finance/cushion";
import type { FinanceCushionInput } from "@/lib/validations/finance-cushion";

export async function getFinanceCushion(
  supabase: SupabaseClient,
  userId: string,
): Promise<FinanceCushionView | null> {
  const { data, error } = await supabase
    .from("finance_cushions")
    .select(FINANCE_CUSHION_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data
    ? toFinanceCushionView(data as FinanceCushionRecord)
    : null;
}

export async function saveFinanceCushion(
  supabase: SupabaseClient,
  userId: string,
  input: FinanceCushionInput,
): Promise<FinanceCushionView> {
  const { data, error } = await supabase
    .from("finance_cushions")
    .upsert(
      {
        user_id: userId,
        ...input,
      },
      { onConflict: "user_id" },
    )
    .select(FINANCE_CUSHION_COLUMNS)
    .single();

  if (error) throw error;
  return toFinanceCushionView(data as FinanceCushionRecord);
}
