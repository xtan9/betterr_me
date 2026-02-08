import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateTaskContent } from "@/components/tasks/create-task-content";

export default async function CreateTaskPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return <CreateTaskContent />;
}
