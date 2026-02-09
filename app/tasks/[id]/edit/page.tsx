import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EditTaskContent } from "@/components/tasks/edit-task-content";

interface EditTaskPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditTaskPage({ params }: EditTaskPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return <EditTaskContent taskId={id} />;
}
