import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HabitDetailContent } from "@/components/habits/habit-detail-content";

interface HabitDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function HabitDetailPage({ params }: HabitDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return <HabitDetailContent habitId={id} />;
}
