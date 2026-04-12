"use client";

import { useTranslations } from "next-intl";
import { TaskCard } from "./task-card";
import { TaskEmptyState } from "./task-empty-state";
import { ProjectCard } from "@/components/projects/project-card";
import type { Task, Project, TaskSection, Category } from "@/lib/db/types";

type StatusTab = "pending" | "completed";

interface SectionBlockProps {
  section: TaskSection;
  tasks: Task[]; // already filtered by tab + search
  allTasks: Task[]; // unfiltered tasks (for project progress calculations)
  projects: Project[];
  categories: Category[];
  activeTab: StatusTab;
  onToggle: (taskId: string) => Promise<void>;
  onTaskClick: (taskId: string) => void;
  onCreateTask: (section?: TaskSection) => void;
  onEditProject: (project: Project) => void;
  onArchiveProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
}

export function SectionBlock({
  section,
  tasks,
  allTasks,
  projects,
  categories,
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
    <div className="flex flex-col gap-card-gap">
      <h2 className="text-lg font-semibold tracking-tight">
        {t(`sections.${section}`)}
      </h2>

      {isEmpty ? (
        <TaskEmptyState variant="no_tasks" onCreateTask={() => onCreateTask(section)} />
      ) : (
        <div className="flex flex-col gap-card-gap">
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
                    categories={categories}
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
              <div className="grid gap-card-gap md:grid-cols-2 lg:grid-cols-3">
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
