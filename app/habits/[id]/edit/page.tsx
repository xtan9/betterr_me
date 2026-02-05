import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EditHabitContent } from "@/components/habits/edit-habit-content";

interface EditHabitPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditHabitPage({ params }: EditHabitPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return <EditHabitContent habitId={id} />;
}
