import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { getLocalDateString } from "@/lib/utils";
import { NextIntlClientProvider } from "next-intl";
import React from "react";
import { DashboardContent } from "@/components/dashboard/dashboard-content";

// Mock next/dynamic to eagerly resolve lazy components in tests
vi.mock("next/dynamic", () => ({
  __esModule: true,
  default: (importFn: () => Promise<any>, options?: any) => {
    const LazyComponent = React.lazy(importFn);
    const DynamicMock = (props: any) =>
      React.createElement(
        React.Suspense,
        { fallback: options?.loading?.() ?? null },
        React.createElement(LazyComponent, props)
      );
    DynamicMock.displayName = "DynamicMock";
    return DynamicMock;
  },
}));

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

// Mock SWR
const mockUseSWR = vi.fn();
vi.mock("swr", () => ({
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

// Mock sonner
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

const messages = {
  dashboard: {
    greeting: {
      morning: "Good morning",
      afternoon: "Good afternoon",
      evening: "Good evening",
    },
    welcome: "Ready to be a little better today?",
    snapshot: {
      title: "Today's Snapshot",
      activeHabits: "Active Habits",
      todaysProgress: "Today's Progress",
      currentStreak: "Current Streak",
      completionRate: "{percent}% completion rate",
      days: "{count} days",
      vsYesterday: "{change}% vs yesterday",
    },
    habits: {
      title: "Today's Habits",
      addHabit: "Add Habit",
      completed: "{completed} of {total} completed",
      moreToGo: "{count} more to go!",
      allComplete: "All habits complete!",
      noHabits: "No habits yet",
      createFirst: "Create your first habit",
    },
    tasks: {
      title: "Today's Tasks",
      addTask: "Add Task",
      completed: "{completed} of {total} completed",
      dueAt: "Due {time}",
      allDay: "All day",
      noTasks: "No tasks for today",
      createFirst: "Add a task",
      allComplete: "All tasks done!",
      comingUp: "Coming Up Tomorrow",
      headStart: "Get a Head Start",
      moreTomorrow: "+{count} more tomorrow",
      viewAll: "View all tasks",
    },
    motivation: {
      firstDay: "Welcome! Your journey starts today.",
      allComplete: "Perfect day!",
      noHabits: "Ready to start building better habits?",
      gettingStarted: "Every habit completed brings you closer.",
      halfway: "Halfway there!",
      almostDone: "Just {remaining} more to go!",
      streakAtRisk: "Your {habitName} streak is at {count} days!",
    },
    empty: {
      title: "Welcome to BetterR.Me!",
      subtitle: "Start your journey to becoming better",
      createHabit: "Create a Habit",
      createTask: "Add a Task",
    },
    loading: {
      title: "Loading your dashboard...",
    },
    error: {
      title: "Something went wrong",
      retry: "Try again",
      toggleHabitFailed: "Failed to update habit. Please try again.",
      toggleTaskFailed: "Failed to update task. Please try again.",
    },
    absence: {
      recoveryTitle: "{name} — missed {days} day(s)",
      lapseTitle: "{name} — {days} days since last check-in",
      hiatusTitle: "{name} — it's been {days} days",
      previousStreak: "You had a {days}-day streak before",
      markComplete: "Complete today",
      completed: "{name} — welcome back!",
      resume: "Resume today",
      changeFrequency: "Change frequency",
    },
  },
  habits: {
    card: {
      streakDays: "{count} days",
      markComplete: "Toggle",
    },
    categories: {
      health: "Health",
      wellness: "Wellness",
      learning: "Learning",
      productivity: "Productivity",
      other: "Other",
    },
    milestone: {
      celebration: "{habit} reached {count} days!",
      celebration7: "One week strong!",
      celebration14: "Two weeks in!",
      celebration30: "A whole month!",
      celebration50: "50 days!",
      celebration100: "Triple digits!",
      celebration200: "200 days!",
      celebration365: "One full year!",
    },
  },
};

function renderWithProviders(component: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {component}
    </NextIntlClientProvider>
  );
}

const mockDashboardData = {
  habits: [
    {
      id: "1",
      user_id: "user-1",
      name: "Morning Meditation",
      description: null,
      category: "wellness",
      frequency: { type: "daily" },
      status: "active",
      current_streak: 7,
      best_streak: 10,
      paused_at: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      completed_today: true,
      monthly_completion_rate: 80,
      missed_scheduled_days: 0,
      previous_streak: 0,
    },
    {
      id: "2",
      user_id: "user-1",
      name: "Daily Exercise",
      description: null,
      category: "health",
      frequency: { type: "daily" },
      status: "active",
      current_streak: 3,
      best_streak: 5,
      paused_at: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      completed_today: false,
      monthly_completion_rate: 40,
      missed_scheduled_days: 0,
      previous_streak: 0,
    },
  ],
  milestones_today: [],
  tasks_today: [],
  tasks_tomorrow: [],
  stats: {
    total_habits: 2,
    completed_today: 1,
    current_best_streak: 7,
    total_tasks: 0,
    tasks_due_today: 0,
    tasks_completed_today: 0,
  },
};

describe("DashboardContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes local date in SWR key for timezone-correct queries", () => {
    mockUseSWR.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
    });

    renderWithProviders(<DashboardContent userName="Test User" />);

    // SWR should be called with a URL containing a date param
    const swrKey = mockUseSWR.mock.calls[0][0];
    expect(swrKey).toMatch(/^\/api\/dashboard\?date=\d{4}-\d{2}-\d{2}$/);
  });

  it("shows loading skeleton while data is loading", () => {
    mockUseSWR.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
    });

    renderWithProviders(<DashboardContent userName="Test User" />);

    expect(screen.getByTestId("dashboard-skeleton")).toBeInTheDocument();
  });

  it("shows error state when fetch fails", () => {
    mockUseSWR.mockReturnValue({
      data: undefined,
      error: new Error("Failed to fetch"),
      isLoading: false,
      mutate: vi.fn(),
    });

    renderWithProviders(<DashboardContent userName="Test User" />);

    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText(/Try again/i)).toBeInTheDocument();
  });

  it("shows empty state for new users with no habits and no tasks", () => {
    mockUseSWR.mockReturnValue({
      data: {
        habits: [],
        tasks_today: [],
        tasks_tomorrow: [],
        stats: {
          total_habits: 0,
          completed_today: 0,
          current_best_streak: 0,
          total_tasks: 0,
          tasks_due_today: 0,
          tasks_completed_today: 0,
        },
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    renderWithProviders(<DashboardContent userName="Test User" />);

    expect(screen.getByText(/Welcome to BetterR.Me!/i)).toBeInTheDocument();
    expect(screen.getByText(/Create a Habit/i)).toBeInTheDocument();
    expect(screen.getByText(/Add a Task/i)).toBeInTheDocument();
  });

  it("shows full dashboard when user has tasks but no habits", async () => {
    mockUseSWR.mockReturnValue({
      data: {
        habits: [],
        tasks_today: [
          {
            id: "t1",
            user_id: "user-1",
            title: "Buy groceries",
            completed: false,
            priority: "medium",
            due_date: new Date().toISOString().split("T")[0],
            due_time: null,
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
          },
        ],
        tasks_tomorrow: [],
        stats: {
          total_habits: 0,
          completed_today: 0,
          current_best_streak: 0,
          total_tasks: 1,
          tasks_due_today: 1,
          tasks_completed_today: 0,
        },
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    renderWithProviders(<DashboardContent userName="Test User" />);

    // Should show full dashboard, not empty state
    expect(
      screen.queryByText(/Welcome to BetterR.Me!/i)
    ).not.toBeInTheDocument();
    expect(await screen.findByText("Today's Tasks")).toBeInTheDocument();
    expect(await screen.findByText("Buy groceries")).toBeInTheDocument();
  });

  it("hides DailySnapshot and MotivationMessage when user has only tasks", async () => {
    mockUseSWR.mockReturnValue({
      data: {
        habits: [],
        tasks_today: [
          {
            id: "t1",
            user_id: "user-1",
            title: "Buy groceries",
            completed: false,
            priority: "medium",
            due_date: new Date().toISOString().split("T")[0],
            due_time: null,
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
          },
        ],
        tasks_tomorrow: [],
        stats: {
          total_habits: 0,
          completed_today: 0,
          current_best_streak: 0,
          total_tasks: 1,
          tasks_due_today: 1,
          tasks_completed_today: 0,
        },
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    renderWithProviders(<DashboardContent userName="Test User" />);

    // Wait for dynamic components to load, then verify
    expect(await screen.findByText("Today's Tasks")).toBeInTheDocument();
    // Habit-centric widgets should not be shown
    expect(screen.queryByText("Today's Snapshot")).not.toBeInTheDocument();
  });

  it("shows full dashboard for user with future tasks but none today", async () => {
    mockUseSWR.mockReturnValue({
      data: {
        habits: [],
        tasks_today: [],
        tasks_tomorrow: [],
        stats: {
          total_habits: 0,
          completed_today: 0,
          current_best_streak: 0,
          total_tasks: 3,
          tasks_due_today: 0,
          tasks_completed_today: 0,
        },
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    renderWithProviders(<DashboardContent userName="Test User" />);

    // Should NOT show empty state since user has tasks (just not today)
    expect(
      screen.queryByText(/Welcome to BetterR.Me!/i)
    ).not.toBeInTheDocument();
    expect(await screen.findByText("Today's Tasks")).toBeInTheDocument();
  });

  it("navigates to create habit page from empty state", () => {
    mockUseSWR.mockReturnValue({
      data: {
        habits: [],
        tasks_today: [],
        tasks_tomorrow: [],
        stats: {
          total_habits: 0,
          completed_today: 0,
          current_best_streak: 0,
          total_tasks: 0,
          tasks_due_today: 0,
          tasks_completed_today: 0,
        },
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    renderWithProviders(<DashboardContent userName="Test User" />);

    screen.getByText(/Create a Habit/i).click();
    expect(mockPush).toHaveBeenCalledWith("/habits/new");
  });

  it("navigates to create task page from empty state", () => {
    mockUseSWR.mockReturnValue({
      data: {
        habits: [],
        tasks_today: [],
        tasks_tomorrow: [],
        stats: {
          total_habits: 0,
          completed_today: 0,
          current_best_streak: 0,
          total_tasks: 0,
          tasks_due_today: 0,
          tasks_completed_today: 0,
        },
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    renderWithProviders(<DashboardContent userName="Test User" />);

    screen.getByText(/Add a Task/i).click();
    expect(mockPush).toHaveBeenCalledWith("/tasks/new");
  });

  it("renders dashboard with habits data", async () => {
    mockUseSWR.mockReturnValue({
      data: mockDashboardData,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    renderWithProviders(<DashboardContent userName="Test User" />);

    // Check greeting
    expect(screen.getByText(/Test User/i)).toBeInTheDocument();

    // Check DailySnapshot (lazy-loaded)
    expect(await screen.findByText("Today's Snapshot")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // total_habits

    // Check HabitChecklist (lazy-loaded)
    expect(await screen.findByText("Today's Habits")).toBeInTheDocument();
    expect(screen.getByText("Morning Meditation")).toBeInTheDocument();
    expect(screen.getByText("Daily Exercise")).toBeInTheDocument();
  });

  it("navigates to create habit page when add habit button clicked", async () => {
    mockUseSWR.mockReturnValue({
      data: mockDashboardData,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    renderWithProviders(<DashboardContent userName="Test User" />);

    const addButton = await screen.findByText("Add Habit");
    addButton.click();

    expect(mockPush).toHaveBeenCalledWith("/habits/new");
  });

  it("sends local date in toggle POST body", async () => {
    const originalFetch = global.fetch;
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => ({}) });
    global.fetch = mockFetch;

    const mockMutate = vi.fn();
    mockUseSWR.mockReturnValue({
      data: mockDashboardData,
      error: undefined,
      isLoading: false,
      mutate: mockMutate,
    });

    renderWithProviders(<DashboardContent userName="Test User" />);

    // Wait for lazy-loaded HabitChecklist to render, then find checkboxes
    await screen.findByText("Today's Habits");
    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes[0]?.click();

    await waitFor(() => {
      const toggleCall = mockFetch.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === "string" && call[0].includes("/toggle")
      );
      expect(toggleCall).toBeDefined();
      const body = JSON.parse(toggleCall![1].body);
      expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(body.date).toBe(getLocalDateString());
    });

    global.fetch = originalFetch;
  });

  it("renders up to 3 absence cards sorted by missed_scheduled_days descending", async () => {
    const baseFields = {
      user_id: "user-1",
      description: null,
      category: "health" as const,
      frequency: { type: "daily" as const },
      status: "active" as const,
      current_streak: 0,
      best_streak: 0,
      paused_at: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      monthly_completion_rate: 50,
    };

    const habitsWithAbsence = [
      { ...baseFields, id: "a", name: "A", missed_scheduled_days: 2, previous_streak: 0, completed_today: false },
      { ...baseFields, id: "b", name: "B", missed_scheduled_days: 8, previous_streak: 3, completed_today: false },
      { ...baseFields, id: "c", name: "C", missed_scheduled_days: 0, previous_streak: 0, completed_today: false },
      { ...baseFields, id: "d", name: "D", missed_scheduled_days: 5, previous_streak: 1, completed_today: false },
      { ...baseFields, id: "e", name: "E", missed_scheduled_days: 1, previous_streak: 0, completed_today: true },
    ];

    mockUseSWR.mockReturnValue({
      data: {
        habits: habitsWithAbsence,
        tasks_today: [],
        tasks_tomorrow: [],
        stats: {
          total_habits: 5,
          completed_today: 1,
          current_best_streak: 0,
          total_tasks: 0,
          tasks_due_today: 0,
          tasks_completed_today: 0,
        },
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    renderWithProviders(<DashboardContent userName="User" />);

    // B (8 days hiatus), D (5 days lapse), A (2 days recovery) shown
    // C (0 missed) and E (completed today) excluded; max 3 cards
    await waitFor(() => {
      expect(screen.getByText(/B — it's been 8 days/)).toBeInTheDocument();
      expect(screen.getByText(/D — 5 days since last check-in/)).toBeInTheDocument();
      expect(screen.getByText(/A — missed 2 day/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/C —/)).not.toBeInTheDocument();
    expect(screen.queryByText(/E —/)).not.toBeInTheDocument();
  });

  it("does not show absence cards when no habits have missed days", async () => {
    mockUseSWR.mockReturnValue({
      data: mockDashboardData,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    renderWithProviders(<DashboardContent userName="Test User" />);

    await screen.findByText("Today's Habits");
    expect(screen.queryByText(/missed|since last check-in|it's been/)).not.toBeInTheDocument();
  });

  it("renders milestone cards when milestones_today is present", async () => {
    mockUseSWR.mockReturnValue({
      data: {
        ...mockDashboardData,
        milestones_today: [
          {
            id: "m1",
            habit_id: "1",
            user_id: "user-1",
            milestone: 7,
            achieved_at: "2026-02-09T10:00:00Z",
            created_at: "2026-02-09T10:00:00Z",
          },
        ],
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    renderWithProviders(<DashboardContent userName="Test User" />);

    await waitFor(() => {
      expect(screen.getByText(/Morning Meditation reached 7 days!/)).toBeInTheDocument();
      expect(screen.getByText("One week strong!")).toBeInTheDocument();
    });
  });

  it("does not render milestone section when milestones_today is empty", async () => {
    mockUseSWR.mockReturnValue({
      data: mockDashboardData,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    renderWithProviders(<DashboardContent userName="Test User" />);

    await screen.findByText("Today's Habits");
    expect(screen.queryByText(/reached.*days!/)).not.toBeInTheDocument();
  });

  it("shows toast error when habit toggle fails", async () => {
    const originalFetch = global.fetch;
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => ({ error: "Server error" }) });
    global.fetch = mockFetch;

    mockUseSWR.mockReturnValue({
      data: mockDashboardData,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    renderWithProviders(<DashboardContent userName="Test User" />);

    await screen.findByText("Today's Habits");
    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes[0]?.click();

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Failed to update habit. Please try again.");
    });

    global.fetch = originalFetch;
  });

  it("does not call mutate when toggle API returns non-ok response", async () => {
    const originalFetch = global.fetch;
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => ({ error: "Server error" }) });
    global.fetch = mockFetch;

    const mockMutate = vi.fn();
    mockUseSWR.mockReturnValue({
      data: mockDashboardData,
      error: undefined,
      isLoading: false,
      mutate: mockMutate,
    });

    renderWithProviders(<DashboardContent userName="Test User" />);

    await screen.findByText("Today's Habits");
    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes[0]?.click();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    // mutate should NOT be called since the toggle failed
    expect(mockMutate).not.toHaveBeenCalled();

    global.fetch = originalFetch;
  });
});
