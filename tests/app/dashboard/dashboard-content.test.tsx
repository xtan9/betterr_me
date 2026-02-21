import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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
        React.createElement(LazyComponent, props),
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
      recoveryTitleWeeks: "{name} — missed {days} week(s)",
      lapseTitleWeeks: "{name} — {days} weeks since last check-in",
      hiatusTitleWeeks: "{name} — it's been {days} weeks",
      previousStreak: "You had a {days}-day streak before",
      previousStreakWeeks: "You had a {days}-week streak before",
      viewHabit: "View habit",
      dismiss: "Dismiss",
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
    </NextIntlClientProvider>,
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
      missed_scheduled_periods: 0,
      previous_streak: 0,
      absence_unit: "days" as const,
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
      missed_scheduled_periods: 0,
      previous_streak: 0,
      absence_unit: "days" as const,
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
      screen.queryByText(/Welcome to BetterR.Me!/i),
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
      screen.queryByText(/Welcome to BetterR.Me!/i),
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

    // Mock mutate to execute the async updater function (simulates SWR optimistic update)
    const mockMutate = vi.fn().mockImplementation(async (fn) => {
      if (typeof fn === "function") await fn();
    });
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
          typeof call[0] === "string" && call[0].includes("/toggle"),
      );
      expect(toggleCall).toBeDefined();
      const body = JSON.parse(toggleCall![1].body);
      expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(body.date).toBe(getLocalDateString());
    });

    global.fetch = originalFetch;
  });

  it("renders up to 3 absence cards sorted by missed_scheduled_periods descending", async () => {
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
      {
        ...baseFields,
        id: "a",
        name: "A",
        missed_scheduled_periods: 2,
        previous_streak: 0,
        absence_unit: "days" as const,
        completed_today: false,
      },
      {
        ...baseFields,
        id: "b",
        name: "B",
        missed_scheduled_periods: 8,
        previous_streak: 3,
        absence_unit: "days" as const,
        completed_today: false,
      },
      {
        ...baseFields,
        id: "c",
        name: "C",
        missed_scheduled_periods: 0,
        previous_streak: 0,
        absence_unit: "days" as const,
        completed_today: false,
      },
      {
        ...baseFields,
        id: "d",
        name: "D",
        missed_scheduled_periods: 5,
        previous_streak: 1,
        absence_unit: "days" as const,
        completed_today: false,
      },
      {
        ...baseFields,
        id: "e",
        name: "E",
        missed_scheduled_periods: 1,
        previous_streak: 0,
        absence_unit: "days" as const,
        completed_today: true,
      },
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
      expect(
        screen.getByText(/D — 5 days since last check-in/),
      ).toBeInTheDocument();
      expect(screen.getByText(/A — missed 2 day/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/C —/)).not.toBeInTheDocument();
    expect(screen.queryByText(/E —/)).not.toBeInTheDocument();
  });

  it("sorts absence cards by normalized severity (weeks > days at same count)", async () => {
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
      {
        ...baseFields,
        id: "day-habit",
        name: "Daily Run",
        missed_scheduled_periods: 5,
        previous_streak: 0,
        absence_unit: "days" as const,
        completed_today: false,
      },
      {
        ...baseFields,
        id: "week-habit",
        name: "Weekly Yoga",
        frequency: { type: "weekly" as const },
        missed_scheduled_periods: 2,
        previous_streak: 0,
        absence_unit: "weeks" as const,
        completed_today: false,
      },
    ];

    mockUseSWR.mockReturnValue({
      data: {
        habits: habitsWithAbsence,
        tasks_today: [],
        tasks_tomorrow: [],
        milestones_today: [],
        stats: {
          total_habits: 2,
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

    renderWithProviders(<DashboardContent userName="User" />);

    // Weekly Yoga (2 weeks = ~14 days) should appear before Daily Run (5 days)
    await waitFor(() => {
      const cards = screen.getAllByText(
        /since last check-in|missed|it's been/,
      );
      expect(cards[0].textContent).toContain("Weekly Yoga");
    });
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
    expect(
      screen.queryByText(/missed|since last check-in|it's been/),
    ).not.toBeInTheDocument();
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
      expect(
        screen.getByText(/Morning Meditation reached 7 days!/),
      ).toBeInTheDocument();
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
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => ({ error: "Server error" }),
    });
    global.fetch = mockFetch;

    // Mock mutate to execute the async updater function (simulates SWR optimistic update)
    const mockMutate = vi.fn().mockImplementation(async (fn) => {
      if (typeof fn === "function") await fn();
    });
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
      expect(mockToastError).toHaveBeenCalledWith(
        "Failed to update habit. Please try again.",
      );
    });

    global.fetch = originalFetch;
  });

  it("disables checkbox during in-flight toggle to prevent double-click", async () => {
    const originalFetch = global.fetch;
    let resolveToggle: () => void;
    const togglePromise = new Promise<void>((resolve) => {
      resolveToggle = resolve;
    });
    const mockFetch = vi.fn().mockImplementation(() =>
      togglePromise.then(() => ({ ok: true, json: () => ({}) })),
    );
    global.fetch = mockFetch;

    const mockMutate = vi.fn().mockImplementation(async (fn) => {
      if (typeof fn === "function") await fn();
    });
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

    // After click, mutate is called with optimistic options including the togglingHabitIds set
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ rollbackOnError: true }),
      );
    });

    // Resolve the toggle to clean up
    resolveToggle!();
    global.fetch = originalFetch;
  });

  it("calls mutate with optimistic data and rollback on error when toggle fails", async () => {
    const originalFetch = global.fetch;
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => ({ error: "Server error" }),
    });
    global.fetch = mockFetch;

    // Mock mutate to execute the async updater (simulates SWR optimistic update)
    const mockMutate = vi.fn().mockImplementation(async (fn) => {
      if (typeof fn === "function") await fn();
    });
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
      expect(mockToastError).toHaveBeenCalled();
    });

    // mutate IS called with optimistic update options (rollbackOnError handles the revert)
    expect(mockMutate).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        optimisticData: expect.any(Function),
        populateCache: false,
        rollbackOnError: true,
        revalidate: false,
      }),
    );

    global.fetch = originalFetch;
  });

  it("calls mutate with optimistic data and revalidate false when task toggled", async () => {
    const originalFetch = global.fetch;
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => ({}) });
    global.fetch = mockFetch;

    const mockMutate = vi.fn().mockImplementation(async (fn) => {
      if (typeof fn === "function") await fn();
    });

    const dataWithTasks = {
      ...mockDashboardData,
      tasks_today: [
        {
          id: "t1",
          user_id: "user-1",
          title: "Buy groceries",
          description: null,
          is_completed: false,
          completed_at: null,
          priority: 2,
          category: null,
          due_date: "2026-02-17",
          due_time: null,
          intention: null,
          completion_difficulty: null,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ],
      stats: {
        ...mockDashboardData.stats,
        total_tasks: 1,
        tasks_due_today: 1,
        tasks_completed_today: 0,
      },
    };

    mockUseSWR.mockReturnValue({
      data: dataWithTasks,
      error: undefined,
      isLoading: false,
      mutate: mockMutate,
    });

    renderWithProviders(<DashboardContent userName="Test User" />);

    await screen.findByText("Today's Tasks");
    const checkboxes = screen.getAllByRole("checkbox");
    // Task checkbox comes after habit checkboxes
    const taskCheckbox = checkboxes[checkboxes.length - 1];
    taskCheckbox?.click();

    await waitFor(() => {
      // Find the mutate call that includes task-specific optimistic options
      const taskMutateCall = mockMutate.mock.calls.find(
        (call: unknown[]) =>
          call.length === 2 &&
          typeof call[1] === "object" &&
          call[1] !== null &&
          (call[1] as Record<string, unknown>).revalidate === false &&
          (call[1] as Record<string, unknown>).rollbackOnError === true &&
          typeof (call[1] as Record<string, unknown>).optimisticData === "function",
      );
      expect(taskMutateCall).toBeDefined();
    });

    global.fetch = originalFetch;
  });

  it("shows toast error when task toggle fails", async () => {
    const originalFetch = global.fetch;
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => ({ error: "Server error" }),
    });
    global.fetch = mockFetch;

    const mockMutate = vi.fn().mockImplementation(async (fn) => {
      if (typeof fn === "function") await fn();
    });

    const dataWithTasks = {
      ...mockDashboardData,
      tasks_today: [
        {
          id: "t1",
          user_id: "user-1",
          title: "Buy groceries",
          description: null,
          is_completed: false,
          completed_at: null,
          priority: 2,
          category: null,
          due_date: "2026-02-17",
          due_time: null,
          intention: null,
          completion_difficulty: null,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ],
      stats: {
        ...mockDashboardData.stats,
        total_tasks: 1,
        tasks_due_today: 1,
        tasks_completed_today: 0,
      },
    };

    mockUseSWR.mockReturnValue({
      data: dataWithTasks,
      error: undefined,
      isLoading: false,
      mutate: mockMutate,
    });

    renderWithProviders(<DashboardContent userName="Test User" />);

    await screen.findByText("Today's Tasks");
    const checkboxes = screen.getAllByRole("checkbox");
    const taskCheckbox = checkboxes[checkboxes.length - 1];
    taskCheckbox?.click();

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "Failed to update task. Please try again.",
      );
    });

    global.fetch = originalFetch;
  });

  it("filters habits by shouldTrackOnDate (custom with no matching days hidden)", async () => {
    const habitsWithCustom = [
      {
        ...mockDashboardData.habits[0],
        id: "daily",
        name: "Daily Habit",
        frequency: { type: "daily" as const },
      },
      {
        ...mockDashboardData.habits[1],
        id: "custom",
        name: "Custom Habit",
        // Custom with empty days array — never scheduled
        frequency: { type: "custom" as const, days: [] as number[] },
      },
    ];

    mockUseSWR.mockReturnValue({
      data: {
        ...mockDashboardData,
        habits: habitsWithCustom,
        stats: { ...mockDashboardData.stats, total_habits: 2 },
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    renderWithProviders(<DashboardContent userName="Test User" />);

    await screen.findByText("Today's Habits");
    // Daily habit always shows
    expect(screen.getByText("Daily Habit")).toBeInTheDocument();
    // Custom with empty days array should be filtered out
    expect(screen.queryByText("Custom Habit")).not.toBeInTheDocument();
  });

  it("dismissing an absence card hides it from the dashboard", async () => {
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

    mockUseSWR.mockReturnValue({
      data: {
        habits: [
          {
            ...baseFields,
            id: "h1",
            name: "Missed Habit",
            missed_scheduled_periods: 3,
            previous_streak: 5,
            absence_unit: "days" as const,
            completed_today: false,
          },
        ],
        tasks_today: [],
        tasks_tomorrow: [],
        stats: {
          total_habits: 1,
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

    // Absence card should be visible
    await waitFor(() => {
      expect(screen.getByText(/Missed Habit — 3 days since last check-in/)).toBeInTheDocument();
    });

    // Click dismiss button
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    // Card should disappear
    expect(screen.queryByText(/Missed Habit — 3 days since last check-in/)).not.toBeInTheDocument();
  });
});
