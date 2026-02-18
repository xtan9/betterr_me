import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
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
      reflection: {
        howWasIt: "How was it?",
        easy: "Easy",
        good: "Good",
        hard: "Hard",
      },
      comingUp: "Coming Up Tomorrow",
      headStart: "Get a Head Start",
      moreTomorrow: "+{count} more tomorrow",
      viewAll: "View all tasks",
    },
  },
};

function renderWithIntl(component: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {component}
    </NextIntlClientProvider>,
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
    completion_difficulty: null,
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
    completion_difficulty: null,
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
    completion_difficulty: null,
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
      />,
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
      />,
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
      />,
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
      />,
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
      />,
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
      />,
    );

    expect(screen.getByText(/All tasks done!/)).toBeInTheDocument();
  });

  it("shows empty state when no tasks", () => {
    const onToggle = vi.fn();
    const onCreateTask = vi.fn();

    renderWithIntl(
      <TasksToday tasks={[]} onToggle={onToggle} onCreateTask={onCreateTask} />,
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
      />,
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
      />,
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
      />,
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
      />,
    );

    expect(
      screen.getByText("Career growth depends on this"),
    ).toBeInTheDocument();
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
      />,
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
      />,
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
      />,
    );

    // Task 0 is P3 but has null intention - no subtitle should appear
    const taskRow = screen.getByText("Finish proposal").closest("div");
    expect(taskRow?.parentElement?.querySelector("p.italic")).toBeNull();
  });

  it("applies fallback color class for out-of-range priority in TaskRow", () => {
    const outOfRangeTask: Task = {
      ...mockTasks[0],
      id: "oob-1",
      title: "Out of range priority task",
      priority: 99 as any,
    };

    renderWithIntl(
      <TasksToday
        tasks={[outOfRangeTask]}
        onToggle={vi.fn()}
        onCreateTask={vi.fn()}
      />,
    );

    // Find the Circle icon next to the task title
    const taskTitle = screen.getByText("Out of range priority task");
    const taskRow = taskTitle.closest(".flex.items-center.gap-2");
    const circleIcon = taskRow?.querySelector("svg");
    expect(circleIcon).toBeInTheDocument();
    expect(circleIcon?.classList.contains("text-muted-foreground")).toBe(true);
  });

  it("renders task titles as buttons for accessibility", () => {
    const onToggle = vi.fn();
    const onCreateTask = vi.fn();

    renderWithIntl(
      <TasksToday
        tasks={mockTasks}
        onToggle={onToggle}
        onCreateTask={onCreateTask}
      />,
    );

    const buttons = screen.getAllByRole("button");
    const taskButtons = buttons.filter(
      (b) =>
        b.textContent === "Finish proposal" ||
        b.textContent === "Team standup" ||
        b.textContent === "Read documentation",
    );
    expect(taskButtons).toHaveLength(3);
  });

  describe("reflection strip", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      global.fetch = vi.fn().mockResolvedValue({ ok: true });
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it("shows reflection strip when P3 task is completed", async () => {
      const onToggle = vi.fn().mockResolvedValue(undefined);
      const onCreateTask = vi.fn();

      // Only the P3 task, uncompleted
      const p3Task: Task[] = [mockTasks[0]]; // priority 3

      renderWithIntl(
        <TasksToday
          tasks={p3Task}
          onToggle={onToggle}
          onCreateTask={onCreateTask}
        />,
      );

      const checkbox = screen.getByRole("checkbox");
      await act(async () => {
        fireEvent.click(checkbox);
      });

      expect(screen.getByText("How was it?")).toBeInTheDocument();
      expect(screen.getByTitle("Easy")).toBeInTheDocument();
      expect(screen.getByTitle("Good")).toBeInTheDocument();
      expect(screen.getByTitle("Hard")).toBeInTheDocument();
    });

    it("does not show reflection strip for low-priority tasks", async () => {
      const onToggle = vi.fn().mockResolvedValue(undefined);
      const onCreateTask = vi.fn();

      // Only the P1 task
      const p1Task: Task[] = [mockTasks[2]]; // priority 1

      renderWithIntl(
        <TasksToday
          tasks={p1Task}
          onToggle={onToggle}
          onCreateTask={onCreateTask}
        />,
      );

      const checkbox = screen.getByRole("checkbox");
      await act(async () => {
        fireEvent.click(checkbox);
      });

      expect(screen.queryByText("How was it?")).not.toBeInTheDocument();
    });

    it("saves completion_difficulty when emoji is clicked", async () => {
      const onToggle = vi.fn().mockResolvedValue(undefined);
      const onCreateTask = vi.fn();
      const p3Task: Task[] = [mockTasks[0]];

      renderWithIntl(
        <TasksToday
          tasks={p3Task}
          onToggle={onToggle}
          onCreateTask={onCreateTask}
        />,
      );

      // Toggle the task to trigger reflection
      const checkbox = screen.getByRole("checkbox");
      await act(async () => {
        fireEvent.click(checkbox);
      });

      // Click the "hard" emoji
      const hardButton = screen.getByTitle("Hard");
      await act(async () => {
        fireEvent.click(hardButton);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "/api/tasks/1",
        expect.objectContaining({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ completion_difficulty: 3 }),
        }),
      );
    });

    it("auto-dismisses reflection strip after 3 seconds", async () => {
      const onToggle = vi.fn().mockResolvedValue(undefined);
      const onCreateTask = vi.fn();
      const p3Task: Task[] = [mockTasks[0]];

      renderWithIntl(
        <TasksToday
          tasks={p3Task}
          onToggle={onToggle}
          onCreateTask={onCreateTask}
        />,
      );

      const checkbox = screen.getByRole("checkbox");
      await act(async () => {
        fireEvent.click(checkbox);
      });

      expect(screen.getByText("How was it?")).toBeInTheDocument();

      // Advance past the 3s auto-dismiss
      await act(async () => {
        vi.advanceTimersByTime(3100);
      });

      expect(screen.queryByText("How was it?")).not.toBeInTheDocument();
    });

    it("dismisses reflection strip immediately when emoji is clicked", async () => {
      const onToggle = vi.fn().mockResolvedValue(undefined);
      const onCreateTask = vi.fn();
      const p3Task: Task[] = [mockTasks[0]];

      renderWithIntl(
        <TasksToday
          tasks={p3Task}
          onToggle={onToggle}
          onCreateTask={onCreateTask}
        />,
      );

      const checkbox = screen.getByRole("checkbox");
      await act(async () => {
        fireEvent.click(checkbox);
      });

      expect(screen.getByText("How was it?")).toBeInTheDocument();

      const easyButton = screen.getByTitle("Easy");
      await act(async () => {
        fireEvent.click(easyButton);
      });

      expect(screen.queryByText("How was it?")).not.toBeInTheDocument();
    });

    it("shows reflection strip for non-P3 task with intention", async () => {
      const onToggle = vi.fn().mockResolvedValue(undefined);
      const onCreateTask = vi.fn();

      const p1WithIntention: Task[] = [
        {
          ...mockTasks[2], // priority 1
          intention: "Because it matters",
        },
      ];

      renderWithIntl(
        <TasksToday
          tasks={p1WithIntention}
          onToggle={onToggle}
          onCreateTask={onCreateTask}
        />,
      );

      const checkbox = screen.getByRole("checkbox");
      await act(async () => {
        fireEvent.click(checkbox);
      });

      expect(screen.getByText("How was it?")).toBeInTheDocument();
    });

    it("keeps reflecting task visible after SWR revalidation removes it", async () => {
      const onToggle = vi.fn().mockResolvedValue(undefined);
      const onCreateTask = vi.fn();
      const p3Task: Task[] = [mockTasks[0]];

      const { rerender } = renderWithIntl(
        <TasksToday
          tasks={p3Task}
          onToggle={onToggle}
          onCreateTask={onCreateTask}
        />,
      );

      // Complete the task to trigger reflection
      const checkbox = screen.getByRole("checkbox");
      await act(async () => {
        fireEvent.click(checkbox);
      });

      expect(screen.getByText("How was it?")).toBeInTheDocument();

      // Simulate SWR revalidation that removes the task from the list
      rerender(
        <NextIntlClientProvider locale="en" messages={messages}>
          <TasksToday
            tasks={[]}
            onToggle={onToggle}
            onCreateTask={onCreateTask}
          />
        </NextIntlClientProvider>,
      );

      // Task and reflection strip should still be visible
      expect(screen.getByText("Finish proposal")).toBeInTheDocument();
      expect(screen.getByText("How was it?")).toBeInTheDocument();
    });

    it("does not show reflection when uncompleting a task", async () => {
      const onToggle = vi.fn().mockResolvedValue(undefined);
      const onCreateTask = vi.fn();

      // P3 task that is already completed
      const completedP3: Task[] = [
        {
          ...mockTasks[0],
          is_completed: true,
          completed_at: "2024-01-01T17:00:00Z",
        },
      ];

      renderWithIntl(
        <TasksToday
          tasks={completedP3}
          onToggle={onToggle}
          onCreateTask={onCreateTask}
        />,
      );

      const checkbox = screen.getByRole("checkbox");
      await act(async () => {
        fireEvent.click(checkbox);
      });

      expect(screen.queryByText("How was it?")).not.toBeInTheDocument();
    });
  });
});

const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

const mockTomorrowTasks: Task[] = [
  {
    id: "t1",
    user_id: "user-1",
    title: "Plan presentation",
    description: null,
    intention: null,
    is_completed: false,
    priority: 3,
    category: null,
    due_date: tomorrow,
    due_time: null,
    completed_at: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "t2",
    user_id: "user-1",
    title: "Buy groceries",
    description: null,
    intention: null,
    is_completed: false,
    priority: 1,
    category: null,
    due_date: tomorrow,
    due_time: null,
    completed_at: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
];

describe("TasksToday — Coming Up section", () => {
  it("renders Coming Up section with tomorrow tasks", () => {
    renderWithIntl(
      <TasksToday
        tasks={mockTasks}
        tasksTomorrow={mockTomorrowTasks}
        onToggle={vi.fn()}
        onCreateTask={vi.fn()}
      />,
    );

    expect(screen.getByText("Coming Up Tomorrow")).toBeInTheDocument();
    expect(screen.getByText("Plan presentation")).toBeInTheDocument();
    expect(screen.getByText("Buy groceries")).toBeInTheDocument();
  });

  it("hides Coming Up section when no tomorrow tasks", () => {
    renderWithIntl(
      <TasksToday
        tasks={mockTasks}
        tasksTomorrow={[]}
        onToggle={vi.fn()}
        onCreateTask={vi.fn()}
      />,
    );

    expect(screen.queryByText("Coming Up Tomorrow")).not.toBeInTheDocument();
  });

  it("shows 'Get a Head Start' when all today tasks complete", () => {
    const allCompleted = mockTasks.map((t) => ({ ...t, is_completed: true }));

    renderWithIntl(
      <TasksToday
        tasks={allCompleted}
        tasksTomorrow={mockTomorrowTasks}
        onToggle={vi.fn()}
        onCreateTask={vi.fn()}
      />,
    );

    expect(screen.getByText("Get a Head Start")).toBeInTheDocument();
    expect(screen.queryByText("Coming Up Tomorrow")).not.toBeInTheDocument();
  });

  it("shows '+N more tomorrow' when more than 3 tasks", () => {
    const manyTomorrowTasks: Task[] = Array.from({ length: 5 }, (_, i) => ({
      id: `tm${i}`,
      user_id: "user-1",
      title: `Tomorrow task ${i + 1}`,
      description: null,
      intention: null,
      is_completed: false,
      priority: 1 as const,
      category: null,
      due_date: tomorrow,
      due_time: null,
      completed_at: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    }));

    renderWithIntl(
      <TasksToday
        tasks={mockTasks}
        tasksTomorrow={manyTomorrowTasks}
        onToggle={vi.fn()}
        onCreateTask={vi.fn()}
      />,
    );

    // Only first 3 shown
    expect(screen.getByText("Tomorrow task 1")).toBeInTheDocument();
    expect(screen.getByText("Tomorrow task 2")).toBeInTheDocument();
    expect(screen.getByText("Tomorrow task 3")).toBeInTheDocument();
    expect(screen.queryByText("Tomorrow task 4")).not.toBeInTheDocument();

    // "+2 more tomorrow" link pointing to /tasks
    const moreLink = screen.getByText("+2 more tomorrow").closest("a");
    expect(moreLink).toBeInTheDocument();
    expect(moreLink).toHaveAttribute("href", "/tasks");
  });

  it("shows 'View all tasks' link pointing to /tasks", () => {
    renderWithIntl(
      <TasksToday
        tasks={mockTasks}
        tasksTomorrow={mockTomorrowTasks}
        onToggle={vi.fn()}
        onCreateTask={vi.fn()}
      />,
    );

    const viewAllLink = screen.getByText("View all tasks").closest("a");
    expect(viewAllLink).toBeInTheDocument();
    expect(viewAllLink).toHaveAttribute("href", "/tasks");
  });

  it("shows 'Get a Head Start' at full opacity when zero today tasks", () => {
    renderWithIntl(
      <TasksToday
        tasks={[]}
        tasksTomorrow={mockTomorrowTasks}
        onToggle={vi.fn()}
        onCreateTask={vi.fn()}
      />,
    );

    expect(screen.getByText("Get a Head Start")).toBeInTheDocument();
    expect(screen.queryByText("Coming Up Tomorrow")).not.toBeInTheDocument();
  });

  it("applies fallback color class for out-of-range priority in Coming Up section", () => {
    const outOfRangeTomorrowTask: Task[] = [
      {
        ...mockTomorrowTasks[0],
        id: "oob-t1",
        title: "Tomorrow out of range",
        priority: 99 as any,
      },
    ];

    renderWithIntl(
      <TasksToday
        tasks={mockTasks}
        tasksTomorrow={outOfRangeTomorrowTask}
        onToggle={vi.fn()}
        onCreateTask={vi.fn()}
      />,
    );

    const tomorrowTitle = screen.getByText("Tomorrow out of range");
    const tomorrowRow = tomorrowTitle.closest(".flex.items-center.gap-2");
    const circleIcon = tomorrowRow?.querySelector("svg");
    expect(circleIcon).toBeInTheDocument();
    expect(circleIcon?.classList.contains("text-muted-foreground")).toBe(true);
  });

  it("applies reduced opacity when today tasks are not all complete", () => {
    const { container } = renderWithIntl(
      <TasksToday
        tasks={mockTasks}
        tasksTomorrow={mockTomorrowTasks}
        onToggle={vi.fn()}
        onCreateTask={vi.fn()}
      />,
    );

    const comingUpSection = container.querySelector(".opacity-50");
    expect(comingUpSection).toBeInTheDocument();
  });

  it("removes reduced opacity when all today tasks complete", () => {
    const allCompleted = mockTasks.map((t) => ({ ...t, is_completed: true }));

    const { container } = renderWithIntl(
      <TasksToday
        tasks={allCompleted}
        tasksTomorrow={mockTomorrowTasks}
        onToggle={vi.fn()}
        onCreateTask={vi.fn()}
      />,
    );

    const comingUpSection = container.querySelector(".opacity-50");
    expect(comingUpSection).not.toBeInTheDocument();
  });
});
