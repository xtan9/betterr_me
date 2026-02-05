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
});
