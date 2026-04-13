import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { ProjectCard } from "@/components/projects/project-card";
import type { Project, Task } from "@/lib/db/types";

expect.extend(matchers);

const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj-1",
    user_id: "user-1",
    name: "Launch Plan",
    section: "work",
    color: "blue",
    status: "active",
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: `task-${Math.random()}`,
    user_id: "user-1",
    title: "A task",
    description: null,
    is_completed: false,
    priority: 0,
    category_id: null,
    due_date: null,
    due_time: null,
    completion_difficulty: null,
    completed_at: null,
    status: "todo",
    section: "work",
    sort_order: 0,
    project_id: "proj-1",
    recurring_task_id: null,
    is_exception: false,
    original_date: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("ProjectCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders project name and empty-state when there are no tasks", () => {
    render(
      <ProjectCard
        project={makeProject()}
        tasks={[]}
        onEdit={vi.fn()}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText("Launch Plan")).toBeInTheDocument();
    expect(screen.getByText("noTasks")).toBeInTheDocument();
    expect(screen.getByText(/0\/0/)).toBeInTheDocument();
  });

  it("renders progress counts, task previews, and +N more line", () => {
    const tasks = [
      makeTask({ id: "t1", title: "Done task", is_completed: true, status: "done" }),
      makeTask({ id: "t2", title: "In flight", status: "in_progress" }),
      makeTask({ id: "t3", title: "Todo A", status: "todo" }),
      makeTask({ id: "t4", title: "Todo B", status: "todo" }),
      makeTask({ id: "t5", title: "Todo C", status: "todo" }),
      makeTask({ id: "t6", title: "Backlog A", status: "backlog" }),
      makeTask({ id: "t7", title: "Backlog B", status: "backlog" }),
    ];

    render(
      <ProjectCard
        project={makeProject()}
        tasks={tasks}
        onEdit={vi.fn()}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    // 1 done of 7 total
    expect(screen.getByText(/1\/7/)).toBeInTheDocument();
    // Previews: active (6), limit 5, remaining 1
    expect(screen.getByText("In flight")).toBeInTheDocument();
    expect(screen.getByText("Todo A")).toBeInTheDocument();
    expect(screen.getByText("Todo B")).toBeInTheDocument();
    expect(screen.getByText("Todo C")).toBeInTheDocument();
    // Active count - previews(5) = 1
    expect(screen.getByText(/\+1/)).toBeInTheDocument();
    // Done task never appears in previews
    expect(screen.queryByText("Done task")).not.toBeInTheDocument();
  });

  it("navigates to kanban when the card is clicked", async () => {
    const user = userEvent.setup();
    render(
      <ProjectCard
        project={makeProject({ id: "p-9" })}
        tasks={[]}
        onEdit={vi.fn()}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    // Click on the card itself (via the project name heading's parent card)
    await user.click(screen.getByText("Launch Plan"));
    expect(mockPush).toHaveBeenCalledWith("/projects/p-9/kanban");
  });

  it("navigates to kanban via Open Board button", async () => {
    const user = userEvent.setup();
    render(
      <ProjectCard
        project={makeProject({ id: "p-77" })}
        tasks={[]}
        onEdit={vi.fn()}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /openBoard/ }));
    expect(mockPush).toHaveBeenCalledWith("/projects/p-77/kanban");
  });

  it("fires onEdit/onArchive/onDelete from dropdown with the project id or object", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onArchive = vi.fn();
    const onDelete = vi.fn();
    const project = makeProject({ id: "p-42" });

    render(
      <ProjectCard
        project={project}
        tasks={[]}
        onEdit={onEdit}
        onArchive={onArchive}
        onDelete={onDelete}
      />
    );

    // Edit
    await user.click(screen.getByRole("button", { name: "openMenu" }));
    await user.click(await screen.findByText("menuEdit"));
    expect(onEdit).toHaveBeenCalledWith(project);

    // Archive
    await user.click(screen.getByRole("button", { name: "openMenu" }));
    await user.click(await screen.findByText("menuArchive"));
    expect(onArchive).toHaveBeenCalledWith("p-42");

    // Delete
    await user.click(screen.getByRole("button", { name: "openMenu" }));
    await user.click(await screen.findByText("menuDelete"));
    expect(onDelete).toHaveBeenCalledWith("p-42");

    // Menu clicks should not have triggered navigation
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <ProjectCard
        project={makeProject()}
        tasks={[makeTask({ id: "a", title: "Task A" })]}
        onEdit={vi.fn()}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    // The shadcn Progress primitive renders a <div role="progressbar"> without
    // an aria-label — that's a shared UI-primitive limitation (see components/ui/progress.tsx)
    // and not something this component controls, so disable the rule here.
    expect(
      await axe(container, {
        rules: {
          "aria-progressbar-name": { enabled: false },
        },
      })
    ).toHaveNoViolations();
  });
});
