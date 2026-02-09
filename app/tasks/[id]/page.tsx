import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TaskDetailContent } from "@/components/tasks/task-detail-content";

interface TaskDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function TaskDetailPage({ params }: TaskDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return <TaskDetailContent taskId={id} />;
}
