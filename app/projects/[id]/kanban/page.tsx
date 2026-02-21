import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { KanbanBoardLoader } from "@/components/kanban/kanban-board-loader";

export default async function KanbanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return <KanbanBoardLoader projectId={id} />;
}
