import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { TasksPageContent } from "@/components/tasks/tasks-page-content";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

// Mock next-themes
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", theme: "light" }),
}));

// Mock useProjects hook
const mockProjectsMutate = vi.fn();
vi.mock("@/lib/hooks/use-projects", () => ({
  useProjects: () => ({
    projects: [],
    isLoading: false,
    error: undefined,
    mutate: mockProjectsMutate,
  }),
}));

// Mock SWR
const mockUseSWR = vi.fn();
vi.mock("swr", () => ({
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

vi.mock("@/lib/hooks/use-sidebar-counts", () => ({
  revalidateSidebarCounts: vi.fn(),
}));

// Mock sonner
const { mockToast } = vi.hoisted(() => ({
  mockToast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("sonner", () => ({
  toast: mockToast,
}));

const messages = {
  tasks: {
    page: {
      title: "My Tasks",
      createButton: "Create Task",
      createProject: "Create Project",
    },
    paused: {
      title: "{count} paused recurring tasks",
      resume: "Resume",
      delete: "Delete",
      resumeSuccess: "Recurring task resumed",
      deleteSuccess: "Recurring task deleted",
      actionError: "Action failed",
      loadError: "Failed to load paused tasks.",
    },
    list: {
      searchPlaceholder: "Search tasks...",
      tabs: {
        pending: "Pending",
        completed: "Completed",
      },
    },
    sections: {
      personal: "Personal",
      work: "Work",
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
    error: {
      title: "Failed to load task",
      retry: "Try again",
    },
    recurrence: {
      describe: {
        everyDay: "Every day",
        everyNDays: "Every {interval} days",
        everyWeek: "Every week",
        everyNWeeks: "Every {interval} weeks",
        weeklyOnDays: "{prefix} on {days}",
        everyMonth: "Every month",
        everyNMonths: "Every {interval} months",
        monthlyOnOrdinal: "{prefix} on the {ordinal}",
        monthlyOnWeekday: "{prefix} on the {position} {day}",
        everyYear: "Every year",
        everyNYears: "Every {interval} years",
        yearlyOnDate: "{prefix} on {month} {day}",
        dayName: {
          "0": "Sun",
          "1": "Mon",
          "2": "Tue",
          "3": "Wed",
          "4": "Thu",
          "5": "Fri",
          "6": "Sat",
        },
        monthName: {
          "1": "January",
          "2": "February",
          "3": "March",
          "4": "April",
          "5": "May",
          "6": "June",
          "7": "July",
          "8": "August",
          "9": "September",
          "10": "October",
          "11": "November",
          "12": "December",
        },
        ordinal_one: "{n}st",
        ordinal_two: "{n}nd",
        ordinal_few: "{n}rd",
        ordinal_other: "{n}th",
        position: {
          first: "first",
          second: "second",
          third: "third",
          fourth: "fourth",
          last: "last",
        },
      },
    },
  },
  projects: {
    createTitle: "Create Project",
    editTitle: "Edit Project",
    menuEdit: "Edit",
    menuArchive: "Archive",
    menuDelete: "Delete",
    archiveSuccess: "Project archived",
    deleteSuccess: "Project deleted",
    createSuccess: "Project created",
    updateSuccess: "Project updated",
    deleteTitle: "Delete Project",
    deleteDescription: "Are you sure?",
    confirmDelete: "Delete Project",
    cancel: "Cancel",
    done: "done",
    more: "more",
    openBoard: "Open Board",
    noTasks: "No tasks yet",
    sections: {
      personal: "Personal",
      work: "Work",
    },
  },
};

function renderWithProviders(component: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {component}
    </NextIntlClientProvider>,
  );
}

const mockTasks = [
  {
    id: "1",
    user_id: "user-1",
    title: "Buy groceries",
    description: null,
    is_completed: false,
    priority: 2,
    category: "shopping",
    due_date: "2026-02-10",
    due_time: null,
    completion_difficulty: null,
    completed_at: null,
    status: "todo",
    section: "personal",
    sort_order: 1,
    project_id: null,
    recurring_task_id: null,
    is_exception: false,
    original_date: null,
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
    category: "work",
    due_date: "2026-02-09",
    due_time: "17:00:00",
    completion_difficulty: null,
    completed_at: "2026-02-09T15:00:00Z",
    status: "done",
    section: "work",
    sort_order: 2,
    project_id: null,
    recurring_task_id: null,
    is_exception: false,
    original_date: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

/** Default paused SWR return value (empty list, no paused templates) */
const defaultPausedReturn = {
  data: [],
  error: undefined,
  isLoading: false,
  mutate: vi.fn(),
};

describe("TasksPageContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading skeleton while data is loading", () => {
    mockUseSWR.mockImplementation((key: string) => {
      if (key === "/api/tasks") {
        return {
          data: undefined,
          error: undefined,
          isLoading: true,
          mutate: vi.fn(),
        };
      }
      return { ...defaultPausedReturn, mutate: vi.fn() };
    });

    renderWithProviders(<TasksPageContent />);

    expect(screen.getByTestId("tasks-skeleton")).toBeInTheDocument();
  });

  it("shows error state when fetch fails", () => {
    mockUseSWR.mockImplementation((key: string) => {
      if (key === "/api/tasks") {
        return {
          data: undefined,
          error: new Error("Failed to fetch"),
          isLoading: false,
          mutate: vi.fn(),
        };
      }
      return { ...defaultPausedReturn, mutate: vi.fn() };
    });

    renderWithProviders(<TasksPageContent />);

    expect(screen.getByText(/Failed to load task/i)).toBeInTheDocument();
    expect(screen.getByText(/Try again/i)).toBeInTheDocument();
  });

  it("renders task list when data is loaded", () => {
    mockUseSWR.mockImplementation((key: string) => {
      if (key === "/api/tasks") {
        return {
          data: mockTasks,
          error: undefined,
          isLoading: false,
          mutate: vi.fn(),
        };
      }
      return { ...defaultPausedReturn, mutate: vi.fn() };
    });

    renderWithProviders(<TasksPageContent />);

    expect(screen.getByText("My Tasks")).toBeInTheDocument();
    // "Buy groceries" is a pending personal task, should appear in the Personal section
    expect(screen.getByText("Buy groceries")).toBeInTheDocument();
  });

  it("navigates to create task page when button clicked", () => {
    mockUseSWR.mockImplementation((key: string) => {
      if (key === "/api/tasks") {
        return {
          data: mockTasks,
          error: undefined,
          isLoading: false,
          mutate: vi.fn(),
        };
      }
      return { ...defaultPausedReturn, mutate: vi.fn() };
    });

    renderWithProviders(<TasksPageContent />);

    const createButton = screen.getByText("Create Task");
    createButton.click();

    expect(mockPush).toHaveBeenCalledWith("/tasks/new");
  });

  it("navigates to task detail when task clicked", () => {
    mockUseSWR.mockImplementation((key: string) => {
      if (key === "/api/tasks") {
        return {
          data: mockTasks,
          error: undefined,
          isLoading: false,
          mutate: vi.fn(),
        };
      }
      return { ...defaultPausedReturn, mutate: vi.fn() };
    });

    renderWithProviders(<TasksPageContent />);

    const taskTitle = screen.getByText("Buy groceries");
    taskTitle.click();

    expect(mockPush).toHaveBeenCalledWith("/tasks/1");
  });

  it("calls toggle API when task checkbox is clicked", async () => {
    const mockMutate = vi.fn();
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch;

    mockUseSWR.mockImplementation((key: string) => {
      if (key === "/api/tasks") {
        return {
          data: mockTasks,
          error: undefined,
          isLoading: false,
          mutate: mockMutate,
        };
      }
      return { ...defaultPausedReturn, mutate: vi.fn() };
    });

    renderWithProviders(<TasksPageContent />);

    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes[0].click();

    // Wait for async toggle
    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/tasks/1/toggle", {
        method: "POST",
      });
    });
  });

  it("shows paused recurring tasks banner when paused templates exist", () => {
    mockUseSWR.mockImplementation((key: string) => {
      if (key === "/api/tasks") {
        return {
          data: mockTasks,
          error: undefined,
          isLoading: false,
          mutate: vi.fn(),
        };
      }
      if (key === "/api/recurring-tasks?status=paused") {
        return {
          data: [
            {
              id: "rt-1",
              title: "Weekly review",
              status: "paused",
              recurrence_rule: {
                frequency: "weekly",
                interval: 1,
                days_of_week: [1],
              },
            },
          ],
          error: undefined,
          isLoading: false,
          mutate: vi.fn(),
        };
      }
      return {
        data: undefined,
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      };
    });

    renderWithProviders(<TasksPageContent />);
    expect(screen.getByText("Weekly review")).toBeInTheDocument();
  });

  it("does not show paused banner when no paused templates", () => {
    mockUseSWR.mockImplementation((key: string) => {
      if (key === "/api/tasks") {
        return {
          data: mockTasks,
          error: undefined,
          isLoading: false,
          mutate: vi.fn(),
        };
      }
      return { data: [], error: undefined, isLoading: false, mutate: vi.fn() };
    });

    renderWithProviders(<TasksPageContent />);
    expect(screen.queryByText(/paused recurring/i)).not.toBeInTheDocument();
  });

  it("resumes a paused template successfully", async () => {
    const mockMutate = vi.fn();
    const mockMutatePaused = vi.fn();
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch;

    mockUseSWR.mockImplementation((key: string) => {
      if (key === "/api/tasks") {
        return {
          data: mockTasks,
          error: undefined,
          isLoading: false,
          mutate: mockMutate,
        };
      }
      if (key === "/api/recurring-tasks?status=paused") {
        return {
          data: [
            {
              id: "rt-1",
              title: "Weekly review",
              status: "paused",
              recurrence_rule: {
                frequency: "weekly",
                interval: 1,
                days_of_week: [1],
              },
            },
          ],
          error: undefined,
          isLoading: false,
          mutate: mockMutatePaused,
        };
      }
      return {
        data: undefined,
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      };
    });

    renderWithProviders(<TasksPageContent />);

    const resumeButton = screen.getByTitle("Resume");
    resumeButton.click();

    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/recurring-tasks/rt-1?action=resume",
        { method: "PATCH" },
      );
      expect(mockMutatePaused).toHaveBeenCalled();
      expect(mockMutate).toHaveBeenCalled();
      expect(mockToast.success).toHaveBeenCalledWith("Recurring task resumed");
    });
  });

  it("shows error toast when resume fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    global.fetch = mockFetch;

    mockUseSWR.mockImplementation((key: string) => {
      if (key === "/api/tasks") {
        return {
          data: mockTasks,
          error: undefined,
          isLoading: false,
          mutate: vi.fn(),
        };
      }
      if (key === "/api/recurring-tasks?status=paused") {
        return {
          data: [
            {
              id: "rt-1",
              title: "Weekly review",
              status: "paused",
              recurrence_rule: {
                frequency: "weekly",
                interval: 1,
                days_of_week: [1],
              },
            },
          ],
          error: undefined,
          isLoading: false,
          mutate: vi.fn(),
        };
      }
      return {
        data: undefined,
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      };
    });

    renderWithProviders(<TasksPageContent />);

    const resumeButton = screen.getByTitle("Resume");
    resumeButton.click();

    await vi.waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Action failed");
    });
  });

  it("deletes a paused template successfully", async () => {
    const mockMutatePaused = vi.fn();
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch;

    mockUseSWR.mockImplementation((key: string) => {
      if (key === "/api/tasks") {
        return {
          data: mockTasks,
          error: undefined,
          isLoading: false,
          mutate: vi.fn(),
        };
      }
      if (key === "/api/recurring-tasks?status=paused") {
        return {
          data: [
            {
              id: "rt-1",
              title: "Weekly review",
              status: "paused",
              recurrence_rule: {
                frequency: "weekly",
                interval: 1,
                days_of_week: [1],
              },
            },
          ],
          error: undefined,
          isLoading: false,
          mutate: mockMutatePaused,
        };
      }
      return {
        data: undefined,
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      };
    });

    renderWithProviders(<TasksPageContent />);

    const deleteButton = screen.getByTitle("Delete");
    deleteButton.click();

    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/recurring-tasks/rt-1", {
        method: "DELETE",
      });
      expect(mockMutatePaused).toHaveBeenCalled();
      expect(mockToast.success).toHaveBeenCalledWith("Recurring task deleted");
    });
  });

  it("shows error toast when delete fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    global.fetch = mockFetch;

    mockUseSWR.mockImplementation((key: string) => {
      if (key === "/api/tasks") {
        return {
          data: mockTasks,
          error: undefined,
          isLoading: false,
          mutate: vi.fn(),
        };
      }
      if (key === "/api/recurring-tasks?status=paused") {
        return {
          data: [
            {
              id: "rt-1",
              title: "Weekly review",
              status: "paused",
              recurrence_rule: {
                frequency: "weekly",
                interval: 1,
                days_of_week: [1],
              },
            },
          ],
          error: undefined,
          isLoading: false,
          mutate: vi.fn(),
        };
      }
      return {
        data: undefined,
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      };
    });

    renderWithProviders(<TasksPageContent />);

    const deleteButton = screen.getByTitle("Delete");
    deleteButton.click();

    await vi.waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Action failed");
    });
  });

  it("shows error text when paused SWR fails", () => {
    mockUseSWR.mockImplementation((key: string) => {
      if (key === "/api/tasks") {
        return {
          data: mockTasks,
          error: undefined,
          isLoading: false,
          mutate: vi.fn(),
        };
      }
      if (key === "/api/recurring-tasks?status=paused") {
        return {
          data: undefined,
          error: new Error("Failed to fetch"),
          isLoading: false,
          mutate: vi.fn(),
        };
      }
      return {
        data: undefined,
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      };
    });

    renderWithProviders(<TasksPageContent />);

    expect(
      screen.getByText("Failed to load paused tasks."),
    ).toBeInTheDocument();
    expect(screen.getByText("Try again")).toBeInTheDocument();
  });

  it("renders section headers for Personal and Work", () => {
    mockUseSWR.mockImplementation((key: string) => {
      if (key === "/api/tasks") {
        return { data: mockTasks, error: undefined, isLoading: false, mutate: vi.fn() };
      }
      return { ...defaultPausedReturn, mutate: vi.fn() };
    });

    renderWithProviders(<TasksPageContent />);

    // Section headers should be present (from tasks.sections namespace)
    const personalHeadings = screen.getAllByText("Personal");
    const workHeadings = screen.getAllByText("Work");
    expect(personalHeadings.length).toBeGreaterThanOrEqual(1);
    expect(workHeadings.length).toBeGreaterThanOrEqual(1);
  });

  it("shows Create Project button", () => {
    mockUseSWR.mockImplementation((key: string) => {
      if (key === "/api/tasks") {
        return { data: mockTasks, error: undefined, isLoading: false, mutate: vi.fn() };
      }
      return { ...defaultPausedReturn, mutate: vi.fn() };
    });

    renderWithProviders(<TasksPageContent />);

    expect(screen.getByText("Create Project")).toBeInTheDocument();
  });

  it("navigates to create task page with section=work when clicking Create First Task in Work section", () => {
    mockUseSWR.mockImplementation((key: string) => {
      if (key === "/api/tasks") {
        return { data: [], error: undefined, isLoading: false, mutate: vi.fn() };
      }
      return { ...defaultPausedReturn, mutate: vi.fn() };
    });

    renderWithProviders(<TasksPageContent />);

    // Both sections show empty state; DOM order is Personal (index 0), Work (index 1)
    const createButtons = screen.getAllByText("Create First Task");
    expect(createButtons).toHaveLength(2);
    createButtons[1].click();

    expect(mockPush).toHaveBeenCalledWith("/tasks/new?section=work");
  });

  it("navigates to create task page with section=personal when clicking Create First Task in Personal section", () => {
    mockUseSWR.mockImplementation((key: string) => {
      if (key === "/api/tasks") {
        return { data: [], error: undefined, isLoading: false, mutate: vi.fn() };
      }
      return { ...defaultPausedReturn, mutate: vi.fn() };
    });

    renderWithProviders(<TasksPageContent />);

    // Both sections show empty state; DOM order is Personal (index 0), Work (index 1)
    const createButtons = screen.getAllByText("Create First Task");
    expect(createButtons).toHaveLength(2);
    createButtons[0].click();

    expect(mockPush).toHaveBeenCalledWith("/tasks/new?section=personal");
  });
});
