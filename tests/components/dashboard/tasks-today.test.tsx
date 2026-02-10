import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { TasksToday } from "@/components/dashboard/tasks-today";
import type { Task } from "@/lib/db/types";

const messages = {
  dashboard: {
    tasks: {
      title: "Today's Tasks",
      addTask: "Add Task",
      completed: "{completed} of {total} completed",
      overdue: "Overdue",
      dueAt: "Due {time}",
      allDay: "All day",
      noTasks: "No tasks for today",
      createFirst: "Add a task",
      allComplete: "All tasks done!",
    },
  },
};

function renderWithIntl(component: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {component}
    </NextIntlClientProvider>
  );
}

const today = new Date().toISOString().split("T")[0];

const mockTasks: Task[] = [
  {
    id: "1",
    user_id: "user-1",
    title: "Finish proposal",
    description: null,
    intention: null,
    is_completed: false,
    priority: 3,
    category: null,
    due_date: today,
    due_time: "17:00:00",
    completed_at: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "2",
    user_id: "user-1",
    title: "Team standup",
    description: null,
    intention: null,
    is_completed: true,
    priority: 2,
    category: null,
    due_date: today,
    due_time: "10:00:00",
    completed_at: "2024-01-01T10:00:00Z",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "3",
    user_id: "user-1",
    title: "Read documentation",
    description: null,
    intention: null,
    is_completed: false,
    priority: 1,
    category: null,
    due_date: today,
    due_time: null,
    completed_at: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
];

describe("TasksToday", () => {
  it("renders list of tasks from props", () => {
    const onToggle = vi.fn();
    const onCreateTask = vi.fn();

    renderWithIntl(
      <TasksToday
        tasks={mockTasks}
        onToggle={onToggle}
        onCreateTask={onCreateTask}
      />
    );

    expect(screen.getByText("Today's Tasks")).toBeInTheDocument();
    expect(screen.getByText("Finish proposal")).toBeInTheDocument();
    expect(screen.getByText("Team standup")).toBeInTheDocument();
    expect(screen.getByText("Read documentation")).toBeInTheDocument();
  });

  it("shows due time when set", () => {
    const onToggle = vi.fn();
    const onCreateTask = vi.fn();

    renderWithIntl(
      <TasksToday
        tasks={mockTasks}
        onToggle={onToggle}
        onCreateTask={onCreateTask}
      />
    );

    expect(screen.getByText(/Due 5:00 PM/i)).toBeInTheDocument();
    expect(screen.getByText(/Due 10:00 AM/i)).toBeInTheDocument();
  });

  it("shows all day for tasks without due time", () => {
    const onToggle = vi.fn();
    const onCreateTask = vi.fn();

    renderWithIntl(
      <TasksToday
        tasks={mockTasks}
        onToggle={onToggle}
        onCreateTask={onCreateTask}
      />
    );

    expect(screen.getByText("All day")).toBeInTheDocument();
  });

  it("calls onToggle when checkbox clicked", () => {
    const onToggle = vi.fn().mockResolvedValue(undefined);
    const onCreateTask = vi.fn();

    renderWithIntl(
      <TasksToday
        tasks={mockTasks}
        onToggle={onToggle}
        onCreateTask={onCreateTask}
      />
    );

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);

    expect(onToggle).toHaveBeenCalledWith("1");
  });

  it("shows correct completion summary", () => {
    const onToggle = vi.fn();
    const onCreateTask = vi.fn();

    renderWithIntl(
      <TasksToday
        tasks={mockTasks}
        onToggle={onToggle}
        onCreateTask={onCreateTask}
      />
    );

    expect(screen.getByText(/1 of 3 completed/)).toBeInTheDocument();
  });

  it('shows "all complete" state when 100%', () => {
    const allCompleted = mockTasks.map((t) => ({
      ...t,
      is_completed: true,
    }));
    const onToggle = vi.fn();
    const onCreateTask = vi.fn();

    renderWithIntl(
      <TasksToday
        tasks={allCompleted}
        onToggle={onToggle}
        onCreateTask={onCreateTask}
      />
    );

    expect(screen.getByText(/All tasks done!/)).toBeInTheDocument();
  });

  it("shows empty state when no tasks", () => {
    const onToggle = vi.fn();
    const onCreateTask = vi.fn();

    renderWithIntl(
      <TasksToday tasks={[]} onToggle={onToggle} onCreateTask={onCreateTask} />
    );

    expect(screen.getByText("No tasks for today")).toBeInTheDocument();
    expect(screen.getByText("Add a task")).toBeInTheDocument();
  });

  it("Add button calls onCreateTask", () => {
    const onToggle = vi.fn();
    const onCreateTask = vi.fn();

    renderWithIntl(
      <TasksToday
        tasks={mockTasks}
        onToggle={onToggle}
        onCreateTask={onCreateTask}
      />
    );

    const addButton = screen.getByText("Add Task");
    fireEvent.click(addButton);

    expect(onCreateTask).toHaveBeenCalled();
  });

  it("disables checkboxes when loading", () => {
    const onToggle = vi.fn();
    const onCreateTask = vi.fn();

    renderWithIntl(
      <TasksToday
        tasks={mockTasks}
        onToggle={onToggle}
        onCreateTask={onCreateTask}
        isLoading={true}
      />
    );

    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((checkbox) => {
      expect(checkbox).toBeDisabled();
    });
  });

  it("calls onTaskClick when task title is clicked", () => {
    const onToggle = vi.fn();
    const onCreateTask = vi.fn();
    const onTaskClick = vi.fn();

    renderWithIntl(
      <TasksToday
        tasks={mockTasks}
        onToggle={onToggle}
        onTaskClick={onTaskClick}
        onCreateTask={onCreateTask}
      />
    );

    const taskTitle = screen.getByText("Finish proposal");
    fireEvent.click(taskTitle);

    expect(onTaskClick).toHaveBeenCalledWith("1");
  });

  it("shows intention subtitle for P3 tasks with intention", () => {
    const tasksWithIntention: Task[] = [
      {
        ...mockTasks[0],
        intention: "Career growth depends on this",
      },
    ];

    renderWithIntl(
      <TasksToday
        tasks={tasksWithIntention}
        onToggle={vi.fn()}
        onCreateTask={vi.fn()}
      />
    );

    expect(screen.getByText("Career growth depends on this")).toBeInTheDocument();
  });

  it("does not show intention subtitle for non-P3 tasks", () => {
    const nonP3WithIntention: Task[] = [
      {
        ...mockTasks[1],
        priority: 2,
        intention: "Should not appear",
      },
    ];

    renderWithIntl(
      <TasksToday
        tasks={nonP3WithIntention}
        onToggle={vi.fn()}
        onCreateTask={vi.fn()}
      />
    );

    expect(screen.queryByText("Should not appear")).not.toBeInTheDocument();
  });

  it("does not show intention subtitle for P3 tasks with empty string intention", () => {
    const tasksWithEmptyIntention: Task[] = [
      {
        ...mockTasks[0],
        intention: "",
      },
    ];

    renderWithIntl(
      <TasksToday
        tasks={tasksWithEmptyIntention}
        onToggle={vi.fn()}
        onCreateTask={vi.fn()}
      />
    );

    const taskRow = screen.getByText("Finish proposal").closest("div");
    expect(taskRow?.parentElement?.querySelector("p.italic")).toBeNull();
  });

  it("does not show intention subtitle for P3 tasks without intention", () => {
    renderWithIntl(
      <TasksToday
        tasks={[mockTasks[0]]}
        onToggle={vi.fn()}
        onCreateTask={vi.fn()}
      />
    );

    // Task 0 is P3 but has null intention - no subtitle should appear
    const taskRow = screen.getByText("Finish proposal").closest("div");
    expect(taskRow?.parentElement?.querySelector("p.italic")).toBeNull();
  });

  it("renders task titles as buttons for accessibility", () => {
    const onToggle = vi.fn();
    const onCreateTask = vi.fn();

    renderWithIntl(
      <TasksToday
        tasks={mockTasks}
        onToggle={onToggle}
        onCreateTask={onCreateTask}
      />
    );

    const buttons = screen.getAllByRole("button");
    const taskButtons = buttons.filter(
      (b) =>
        b.textContent === "Finish proposal" ||
        b.textContent === "Team standup" ||
        b.textContent === "Read documentation"
    );
    expect(taskButtons).toHaveLength(3);
  });
});
