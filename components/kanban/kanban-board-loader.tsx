"use client";

import dynamic from "next/dynamic";
import { KanbanSkeleton } from "@/components/kanban/kanban-skeleton";

const KanbanBoard = dynamic(
  () =>
    import("@/components/kanban/kanban-board").then((m) => m.KanbanBoard),
  { ssr: false, loading: () => <KanbanSkeleton /> }
);

interface KanbanBoardLoaderProps {
  projectId: string;
}

export function KanbanBoardLoader({ projectId }: KanbanBoardLoaderProps) {
  return <KanbanBoard projectId={projectId} />;
}
