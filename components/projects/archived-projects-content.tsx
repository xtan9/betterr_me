"use client";

import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import Link from "next/link";
import { Archive, ArrowLeft, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layouts/page-header";
import { useProjects } from "@/lib/hooks/use-projects";
import { getProjectColor } from "@/lib/projects/colors";
import type { Project } from "@/lib/db/types";

export function ArchivedProjectsContent() {
  const t = useTranslations("projects.archived");
  const { projects, isLoading, mutate } = useProjects({ status: "archived" });

  const handleRestore = async (project: Project) => {
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      if (!res.ok) throw new Error("Failed to restore project");
      toast.success(t("restoreSuccess"));
      mutate();
    } catch {
      toast.error(t("restoreError"));
    }
  };

  if (isLoading) {
    return <ArchivedProjectsSkeleton />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        actions={
          <Button variant="outline" asChild>
            <Link href="/tasks">
              <ArrowLeft className="size-4 mr-2" />
              {t("backToTasks")}
            </Link>
          </Button>
        }
      />

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-12 px-4">
          <div className="flex items-center justify-center size-16 rounded-full bg-muted mb-4">
            <Archive className="size-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {t("empty")}
          </h3>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ArchivedProjectCard
              key={project.id}
              project={project}
              onRestore={() => handleRestore(project)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ArchivedProjectCardProps {
  project: Project;
  onRestore: () => void;
}

function ArchivedProjectCard({ project, onRestore }: ArchivedProjectCardProps) {
  const t = useTranslations("projects.archived");
  const { resolvedTheme } = useTheme();

  const color = getProjectColor(project.color);
  const isDark = resolvedTheme === "dark";
  const colorHsl = isDark ? color.hslDark : color.hsl;

  return (
    <Card
      className="border-l-4 p-0"
      style={{
        borderLeftColor: colorHsl,
        backgroundColor: isDark
          ? colorHsl.replace("hsl(", "hsla(").replace(")", ", 0.06)")
          : colorHsl.replace("hsl(", "hsla(").replace(")", ", 0.04)"),
      }}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium truncate min-w-0 flex-1">
            {project.name}
          </h3>
          <Button
            variant="secondary"
            size="sm"
            onClick={onRestore}
          >
            <RotateCcw className="size-3.5 mr-1.5" />
            {t("restore")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ArchivedProjectsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
