import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getFinanceCushion } from "@/lib/finance/repository";
import { CushionPage } from "@/components/finance/cushion-page";

export default async function FinanceCushionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const initialCushion = await getFinanceCushion(supabase, user.id);
  return <CushionPage initialCushion={initialCushion} />;
}
