import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { TaskList } from "@/components/tasks/task-list";
import type { Task } from "@/lib/db/types";

const messages = {
  tasks: {
    list: {
      searchPlaceholder: "Search tasks...",
      tabs: {
        pending: "Pending",
        completed: "Completed",
      },
    },
    empty: {
      noTasks: {
        title: "No tasks yet",
        description: "Add your first task to stay organized.",
        cta: "Create First Task",
      },
      noResults: {
        title: "No matching tasks",
        description: "Try a different search term.",
      },
      allComplete: {
        title: "All tasks complete!",
        description: "Great job! All your tasks are done.",
      },
    },
    card: {
      markComplete: "Mark complete",
      overdue: "Overdue",
      noDueDate: "No due date",
    },
    categories: {
      work: "Work",
      personal: "Personal",
      shopping: "Shopping",
      other: "Other",
    },
    priorities: {
      "0": "None",
      "1": "Low",
      "2": "Medium",
      "3": "High",
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

const mockTasks: Task[] = [
  {
    id: "1",
    user_id: "user-1",
    title: "Buy groceries",
    description: null,
    is_completed: false,
    priority: 2,
    category_id: null,
    due_date: "2026-02-10",
    due_time: null,
    completed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "2",
    user_id: "user-1",
    title: "Finish report",
    description: null,
    is_completed: true,
    priority: 3,
    category_id: null,
    due_date: "2026-02-09",
    due_time: "17:00:00",
    completed_at: "2026-02-09T15:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "3",
    user_id: "user-1",
    title: "Call plumber",
    description: null,
    is_completed: false,
    priority: 1,
    category_id: null,
    due_date: null,
    due_time: null,
    completed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

describe("TaskList", () => {
  const mockOnToggle = vi.fn().mockResolvedValue(undefined);
  const mockOnTaskClick = vi.fn();
  const mockOnCreateTask = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders tabs with correct counts", () => {
    renderWithIntl(
      <TaskList
        tasks={mockTasks}
        onToggle={mockOnToggle}
        onTaskClick={mockOnTaskClick}
        onCreateTask={mockOnCreateTask}
      />
    );

    expect(screen.getByText(/Pending \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/Completed \(1\)/)).toBeInTheDocument();
  });

  it("shows pending tasks by default", () => {
    renderWithIntl(
      <TaskList
        tasks={mockTasks}
        onToggle={mockOnToggle}
        onTaskClick={mockOnTaskClick}
        onCreateTask={mockOnCreateTask}
      />
    );

    expect(screen.getByText("Buy groceries")).toBeInTheDocument();
    expect(screen.getByText("Call plumber")).toBeInTheDocument();
    expect(screen.queryByText("Finish report")).not.toBeInTheDocument();
  });

  it("switches to completed tab when clicked", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <TaskList
        tasks={mockTasks}
        onToggle={mockOnToggle}
        onTaskClick={mockOnTaskClick}
        onCreateTask={mockOnCreateTask}
      />
    );

    await user.click(screen.getByText(/Completed \(1\)/));

    expect(screen.getByText("Finish report")).toBeInTheDocument();
    expect(screen.queryByText("Buy groceries")).not.toBeInTheDocument();
  });

  it("filters tasks by search query", async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <TaskList
        tasks={mockTasks}
        onToggle={mockOnToggle}
        onTaskClick={mockOnTaskClick}
        onCreateTask={mockOnCreateTask}
      />
    );

    const searchInput = screen.getByPlaceholderText("Search tasks...");
    await user.type(searchInput, "groceries");

    // Wait for debounce
    await vi.waitFor(() => {
      expect(screen.getByText("Buy groceries")).toBeInTheDocument();
      expect(screen.queryByText("Call plumber")).not.toBeInTheDocument();
    });
  });

  it("shows empty state when no tasks", () => {
    renderWithIntl(
      <TaskList
        tasks={[]}
        onToggle={mockOnToggle}
        onTaskClick={mockOnTaskClick}
        onCreateTask={mockOnCreateTask}
      />
    );

    expect(screen.getByText("No tasks yet")).toBeInTheDocument();
    expect(screen.getByText("Create First Task")).toBeInTheDocument();
  });

  it("shows all complete empty state when all tasks are completed", () => {
    const allCompleted = mockTasks.map((t) => ({
      ...t,
      is_completed: true,
    }));

    renderWithIntl(
      <TaskList
        tasks={allCompleted}
        onToggle={mockOnToggle}
        onTaskClick={mockOnTaskClick}
        onCreateTask={mockOnCreateTask}
      />
    );

    expect(screen.getByText("All tasks complete!")).toBeInTheDocument();
  });
});
