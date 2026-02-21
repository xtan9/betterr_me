import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { KanbanSkeleton } from "@/components/kanban/kanban-skeleton";

const KanbanBoard = dynamic(
  () =>
    import("@/components/kanban/kanban-board").then((m) => m.KanbanBoard),
  { ssr: false, loading: () => <KanbanSkeleton /> }
);

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

  return <KanbanBoard projectId={id} />;
}
