"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Plus,
  RefreshCw,
  Pause,
  Play,
  Trash2,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader, PageHeaderSkeleton } from "@/components/layouts/page-header";
import { PageBreadcrumbs } from "@/components/layouts/page-breadcrumbs";
import { describeRecurrence } from "@/lib/recurring-tasks/recurrence";
import type { RecurringTask } from "@/lib/db/types";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch");
  const data = await res.json();
  return data.recurring_tasks;
};

export function RecurringTasksPageContent() {
  const t = useTranslations("tasks.recurring");
  const router = useRouter();

  const { data, error, isLoading, mutate } = useSWR<RecurringTask[]>(
    "/api/recurring-tasks",
    fetcher,
    { revalidateOnFocus: true }
  );

  const handlePauseResume = async (template: RecurringTask) => {
    try {
      const action = template.status === "active" ? "pause" : "resume";
      const res = await fetch(`/api/recurring-tasks/${template.id}?action=${action}`, {
        method: "PATCH",
      });
      if (!res.ok) throw new Error("Failed");
      mutate();
      toast.success(
        action === "pause" ? t("pauseSuccess") : t("resumeSuccess")
      );
    } catch {
      toast.error(t("actionError"));
    }
  };

  const handleDelete = async (templateId: string) => {
    try {
      const res = await fetch(`/api/recurring-tasks/${templateId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed");
      mutate();
      toast.success(t("deleteSuccess"));
    } catch {
      toast.error(t("actionError"));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="recurring-tasks-skeleton">
        <PageHeaderSkeleton hasActions />
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <p className="text-lg font-medium text-destructive">{t("error")}</p>
        <Button onClick={() => mutate()} variant="outline">
          <RefreshCw className="size-4 mr-2" />
          {t("retry")}
        </Button>
      </div>
    );
  }

  const templates = data || [];
  const activeTemplates = templates.filter((t) => t.status === "active");
  const pausedTemplates = templates.filter((t) => t.status === "paused");
  const archivedTemplates = templates.filter((t) => t.status === "archived");

  return (
    <div className="space-y-6">
      <div>
        <PageBreadcrumbs section="tasks" itemName={t("title")} />
        <PageHeader
          title={t("title")}
          actions={
            <Button onClick={() => router.push("/tasks/new")}>
              <Plus className="size-4 mr-2" />
              {t("createNew")}
            </Button>
          }
        />
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Calendar className="size-12 mx-auto mb-4 opacity-50" />
          <p className="font-medium mb-1">{t("empty")}</p>
          <p className="text-sm">{t("emptyDescription")}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {activeTemplates.length > 0 && (
            <TemplateSection
              title={t("activeSection")}
              templates={activeTemplates}
              onPauseResume={handlePauseResume}
              onDelete={handleDelete}
              t={t}
            />
          )}
          {pausedTemplates.length > 0 && (
            <TemplateSection
              title={t("pausedSection")}
              templates={pausedTemplates}
              onPauseResume={handlePauseResume}
              onDelete={handleDelete}
              t={t}
            />
          )}
          {archivedTemplates.length > 0 && (
            <TemplateSection
              title={t("archivedSection")}
              templates={archivedTemplates}
              onPauseResume={handlePauseResume}
              onDelete={handleDelete}
              t={t}
            />
          )}
        </div>
      )}
    </div>
  );
}

interface TemplateSectionProps {
  title: string;
  templates: RecurringTask[];
  onPauseResume: (template: RecurringTask) => void;
  onDelete: (id: string) => void;
  t: (key: string) => string;
}

function TemplateSection({
  title,
  templates,
  onPauseResume,
  onDelete,
  t,
}: TemplateSectionProps) {
  const statusVariant: Record<string, "default" | "secondary" | "outline"> = {
    active: "default",
    paused: "secondary",
    archived: "outline",
  };

  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground mb-3">
        {title} ({templates.length})
      </h3>
      <div className="grid gap-3 md:grid-cols-2">
        {templates.map((template) => (
          <Card key={template.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium truncate">{template.title}</h4>
                    <Badge variant={statusVariant[template.status] ?? "outline"} className="shrink-0">
                      {t(`status.${template.status}`)}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {describeRecurrence(template.recurrence_rule)}
                  </p>
                  {template.next_generate_date && template.status === "active" && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("nextOccurrence")}: {template.next_generate_date}
                    </p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  {template.status !== "archived" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => onPauseResume(template)}
                      title={template.status === "active" ? t("pause") : t("resume")}
                    >
                      {template.status === "active" ? (
                        <Pause className="size-4" />
                      ) : (
                        <Play className="size-4" />
                      )}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive hover:text-destructive"
                    onClick={() => onDelete(template.id)}
                    title={t("deleteTemplate")}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
