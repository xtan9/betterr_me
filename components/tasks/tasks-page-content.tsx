"use client";

import { useState, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import {
  Archive,
  FolderPlus,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { PageHeader, PageHeaderSkeleton } from "@/components/layouts/page-header";
import { describeRecurrence } from "@/lib/recurring-tasks/recurrence";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useProjects } from "@/lib/hooks/use-projects";
import { TaskCard } from "./task-card";
import { TaskEmptyState } from "./task-empty-state";
import { ProjectCard } from "@/components/projects/project-card";
import { ProjectModal } from "@/components/projects/project-modal";
import { ProjectDeleteDialog } from "@/components/projects/project-delete-dialog";
import type { Task, RecurringTask, Project, TaskSection } from "@/lib/db/types";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch tasks");
  const data = await res.json();
  return data.tasks;
};

const recurringFetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch");
  const data = await res.json();
  return data.recurring_tasks;
};

type StatusTab = "pending" | "completed";

export function TasksPageContent() {
  const t = useTranslations("tasks");
  const tProjects = useTranslations("projects");
  const router = useRouter();

  // Task SWR
  const { data, error, isLoading, mutate } = useSWR<Task[]>(
    "/api/tasks",
    fetcher,
    {
      revalidateOnFocus: true,
      keepPreviousData: true,
    }
  );

  // Projects SWR
  const {
    projects,
    error: projectsError,
    isLoading: projectsLoading,
    mutate: projectsMutate,
  } = useProjects();

  // Paused recurring tasks SWR
  const {
    data: pausedTemplates,
    error: pausedError,
    mutate: mutatePaused,
  } = useSWR<RecurringTask[]>(
    "/api/recurring-tasks?status=paused",
    recurringFetcher,
    { revalidateOnFocus: true }
  );

  // Tab / search state (lifted from TaskList)
  const [activeTab, setActiveTab] = useState<StatusTab>("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Project modal state
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | undefined>(
    undefined
  );

  // Project delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);

  const tasks = useMemo(() => data ?? [], [data]);

  const counts = useMemo(() => {
    return {
      pending: tasks.filter((t) => !t.is_completed).length,
      completed: tasks.filter((t) => t.is_completed).length,
    };
  }, [tasks]);

  // Filter tasks by tab and search
  const filteredTasks = useMemo(() => {
    let filtered = tasks.filter((t) =>
      activeTab === "pending" ? !t.is_completed : t.is_completed
    );

    if (debouncedSearch) {
      const query = debouncedSearch.toLowerCase();
      filtered = filtered.filter((t) =>
        t.title.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [tasks, activeTab, debouncedSearch]);

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value as StatusTab);
    setSearchQuery("");
  }, []);

  const handleToggleTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/toggle`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Toggle failed");
      mutate();
    } catch {
      toast.error(t("toggleError"));
    }
  };

  const handleTaskClick = (taskId: string) => {
    router.push(`/tasks/${taskId}`);
  };

  const handleCreateTask = (section?: TaskSection) => {
    if (section) {
      router.push(`/tasks/new?section=${section}`);
    } else {
      router.push("/tasks/new");
    }
  };

  // Project handlers
  const handleEditProject = (project: Project) => {
    setEditingProject(project);
    setProjectModalOpen(true);
  };

  const handleArchiveProject = async (projectId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      if (!res.ok) throw new Error("Failed to archive project");
      toast.success(tProjects("archiveSuccess"));
      projectsMutate();
      mutate(); // tasks may have changed sections
    } catch {
      toast.error(tProjects("archiveError"));
    }
  };

  const handleDeleteProject = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (project) {
      setDeletingProject(project);
      setDeleteDialogOpen(true);
    }
  };

  const handleProjectSuccess = () => {
    projectsMutate();
  };

  const handleDeleteProjectSuccess = () => {
    projectsMutate();
    mutate(); // tasks project_id may have been nullified
  };

  const handleCreateProject = () => {
    setEditingProject(undefined);
    setProjectModalOpen(true);
  };

  // Recurring tasks handlers
  const handleResume = async (templateId: string) => {
    try {
      const res = await fetch(
        `/api/recurring-tasks/${templateId}?action=resume`,
        { method: "PATCH" }
      );
      if (!res.ok) throw new Error("Failed");
      mutatePaused();
      mutate();
      toast.success(t("paused.resumeSuccess"));
    } catch (err) {
      console.error("Failed to resume recurring task:", templateId, err);
      toast.error(t("paused.actionError"));
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    try {
      const res = await fetch(`/api/recurring-tasks/${templateId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed");
      mutatePaused();
      toast.success(t("paused.deleteSuccess"));
    } catch (err) {
      console.error("Failed to delete recurring task:", templateId, err);
      toast.error(t("paused.actionError"));
    }
  };

  if (isLoading || projectsLoading) {
    return <TasksPageSkeleton />;
  }

  if (error || projectsError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <p className="text-lg font-medium text-destructive">
          {t("error.title")}
        </p>
        <Button onClick={() => { mutate(); projectsMutate(); }} variant="outline">
          <RefreshCw className="size-4 mr-2" />
          {t("error.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("page.title")}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/projects/archived">
                <Archive className="size-4 mr-2" />
                {t("page.viewArchived")}
              </Link>
            </Button>
            <Button variant="outline" onClick={handleCreateProject}>
              <FolderPlus className="size-4 mr-2" />
              {t("page.createProject")}
            </Button>
            <Button onClick={() => handleCreateTask()}>
              <Plus className="size-4 mr-2" />
              {t("page.createButton")}
            </Button>
          </div>
        }
      />

      {/* Tabs + Search bar */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <TabsList>
            <TabsTrigger value="pending">
              {t("list.tabs.pending")} ({counts.pending})
            </TabsTrigger>
            <TabsTrigger value="completed">
              {t("list.tabs.completed")} ({counts.completed})
            </TabsTrigger>
          </TabsList>

          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              placeholder={t("list.searchPlaceholder")}
              aria-label={t("list.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-full sm:w-64"
            />
          </div>
        </div>

        <TabsContent value={activeTab} className="mt-6">
          {/* Section-based layout */}
          <div className="space-y-8">
            <SectionBlock
              section="personal"
              tasks={filteredTasks}
              allTasks={tasks}
              projects={projects}
              activeTab={activeTab}
              onToggle={handleToggleTask}
              onTaskClick={handleTaskClick}
              onCreateTask={handleCreateTask}
              onEditProject={handleEditProject}
              onArchiveProject={handleArchiveProject}
              onDeleteProject={handleDeleteProject}
            />
            <SectionBlock
              section="work"
              tasks={filteredTasks}
              allTasks={tasks}
              projects={projects}
              activeTab={activeTab}
              onToggle={handleToggleTask}
              onTaskClick={handleTaskClick}
              onCreateTask={handleCreateTask}
              onEditProject={handleEditProject}
              onArchiveProject={handleArchiveProject}
              onDeleteProject={handleDeleteProject}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* Paused recurring tasks load error */}
      {pausedError && (
        <p className="text-sm text-destructive">
          {t("paused.loadError")}{" "}
          <button
            onClick={() => mutatePaused()}
            className="underline hover:no-underline"
          >
            {t("error.retry")}
          </button>
        </p>
      )}

      {/* Paused recurring tasks banner */}
      {pausedTemplates && pausedTemplates.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Pause className="size-4" />
            {t("paused.title", { count: pausedTemplates.length })}
          </h3>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {pausedTemplates.map((template) => (
              <Card key={template.id} className="border-dashed">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="font-medium truncate text-sm">
                        {template.title}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        {describeRecurrence(template.recurrence_rule, t)}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => handleResume(template.id)}
                        title={t("paused.resume")}
                      >
                        <Play className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteTemplate(template.id)}
                        title={t("paused.delete")}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Project Modal */}
      <ProjectModal
        open={projectModalOpen}
        onOpenChange={setProjectModalOpen}
        project={editingProject}
        onSuccess={handleProjectSuccess}
      />

      {/* Project Delete Dialog */}
      {deletingProject && (
        <ProjectDeleteDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          projectName={deletingProject.name}
          projectId={deletingProject.id}
          onSuccess={handleDeleteProjectSuccess}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SectionBlock — renders a single section (Personal or Work)
// ---------------------------------------------------------------------------

interface SectionBlockProps {
  section: TaskSection;
  tasks: Task[]; // already filtered by tab + search
  allTasks: Task[]; // unfiltered tasks (for project progress calculations)
  projects: Project[];
  activeTab: StatusTab;
  onToggle: (taskId: string) => Promise<void>;
  onTaskClick: (taskId: string) => void;
  onCreateTask: (section?: TaskSection) => void;
  onEditProject: (project: Project) => void;
  onArchiveProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
}

function SectionBlock({
  section,
  tasks,
  allTasks,
  projects,
  activeTab,
  onToggle,
  onTaskClick,
  onCreateTask,
  onEditProject,
  onArchiveProject,
  onDeleteProject,
}: SectionBlockProps) {
  const t = useTranslations("tasks");

  // Filter tasks for this section
  const sectionTasks = tasks.filter((t) => t.section === section);
  const standaloneTasks = sectionTasks.filter((t) => !t.project_id);
  const sectionProjects = projects.filter((p) => p.section === section);

  // All tasks in this section (unfiltered — for project progress)
  const allSectionTasks = allTasks.filter((t) => t.section === section);

  const isEmpty =
    standaloneTasks.length === 0 && sectionProjects.length === 0;

  const showProjects = activeTab === "pending" && sectionProjects.length > 0;
  const showLabels = standaloneTasks.length > 0 && showProjects;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold tracking-tight">
        {t(`sections.${section}`)}
      </h2>

      {isEmpty ? (
        <TaskEmptyState variant="no_tasks" onCreateTask={() => onCreateTask(section)} />
      ) : (
        <div className="space-y-4">
          {/* Standalone tasks first */}
          {standaloneTasks.length > 0 && (
            <div className="space-y-2">
              {showLabels && (
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t("sections.tasksLabel")}
                </h3>
              )}
              <div className="grid gap-card-gap md:grid-cols-2 lg:grid-cols-3">
                {standaloneTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onToggle={() => onToggle(task.id)}
                    onClick={() => onTaskClick(task.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Project cards below (only in pending tab) */}
          {showProjects && (
            <div className="space-y-2">
              {showLabels && (
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t("sections.projectsLabel")}
                </h3>
              )}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {sectionProjects.map((project) => {
                  const projectTasks = allSectionTasks.filter(
                    (t) => t.project_id === project.id
                  );
                  return (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      tasks={projectTasks}
                      onEdit={onEditProject}
                      onArchive={onArchiveProject}
                      onDelete={onDeleteProject}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function TasksPageSkeleton() {
  return (
    <div className="space-y-6" data-testid="tasks-skeleton">
      <PageHeaderSkeleton hasActions />

      {/* Tabs skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-64" />
      </div>

      {/* Cards skeleton */}
      <div className="grid gap-card-gap md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
