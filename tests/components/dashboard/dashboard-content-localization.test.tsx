import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardContent } from "@/components/dashboard/dashboard-content";

const { mockUseSWR, mockLocalization } = vi.hoisted(() => ({
  mockUseSWR: vi.fn(),
  mockLocalization: {
    weekStart: "monday" as "sunday" | "monday",
    error: undefined as Error | undefined,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("swr", () => ({
  default: mockUseSWR,
}));

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));

vi.mock("@/lib/hooks/use-localization", () => ({
  useLocalization: () => mockLocalization,
}));

vi.mock("@/components/dashboard/use-dashboard-dismissals", () => ({
  useDashboardDismissals: () => ({
    dismissedAbsenceIds: new Set<string>(),
    handleDismissAbsence: vi.fn(),
    dismissedMotivation: false,
    handleDismissMotivation: vi.fn(),
    dismissedMilestoneIds: new Set<string>(),
    handleDismissMilestone: vi.fn(),
    insightDismissed: false,
    handleDismissInsight: vi.fn(),
  }),
}));

vi.mock("@/lib/hooks/use-toggling-set", () => ({
  useTogglingSet: () => ({
    togglingIds: new Set<string>(),
    isToggling: () => false,
    startToggling: vi.fn(),
    stopToggling: vi.fn(),
  }),
}));

vi.mock("@/lib/hooks/use-sidebar-counts", () => ({
  revalidateSidebarCounts: vi.fn(),
}));

vi.mock("@/lib/hooks/use-habit-toggle", () => ({
  setHabitCompletion: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AvatarImage: () => null,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/components/dashboard/motivation-message", () => ({
  MotivationMessage: () => null,
}));
vi.mock("@/components/dashboard/weekly-insight-card", () => ({
  WeeklyInsightCard: () => null,
}));
vi.mock("@/components/dashboard/absence-card", () => ({
  AbsenceCard: () => null,
}));
vi.mock("@/components/dashboard/workout-stats-widget", () => ({
  WorkoutStatsWidget: () => null,
}));
vi.mock("@/components/habits/milestone-card", () => ({
  MilestoneCards: () => null,
}));
vi.mock("@/components/dashboard/dashboard-skeleton", () => ({
  DashboardSkeleton: () => null,
}));

const dashboardData = {
  habits: [
    {
      id: "habit-1",
      name: "Read",
      current_streak: 1,
      completed_today: false,
      frequency: { type: "daily" },
      missed_scheduled_periods: 0,
      absence_unit: "days",
    },
  ],
  tasks_today: [],
  tasks_tomorrow: [],
  milestones_today: [],
  stats: {
    total_habits: 1,
    completed_today: 0,
    current_best_streak: 1,
    total_tasks: 0,
    tasks_due_today: 0,
    tasks_completed_today: 0,
    last_workout_at: null,
    week_workout_count: 0,
  },
};

describe("DashboardContent Localization boundary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockLocalization.weekStart = "monday";
    mockLocalization.error = undefined;
    mockUseSWR.mockReset();
    mockUseSWR.mockImplementation((key: string | null) => ({
      data: key?.startsWith("/api/dashboard") ? dashboardData : undefined,
      error: null,
      isLoading: false,
      mutate: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requests weekly insights on an accepted Sunday boundary", () => {
    vi.setSystemTime(new Date(2026, 1, 8, 12));
    mockLocalization.weekStart = "sunday";

    render(<DashboardContent />);

    expect(mockUseSWR).toHaveBeenCalledWith(
      "/api/insights/weekly",
      expect.any(Function),
    );
  });

  it("requests weekly insights on an accepted Monday boundary", () => {
    vi.setSystemTime(new Date(2026, 1, 9, 12));

    render(<DashboardContent />);

    expect(mockUseSWR).toHaveBeenCalledWith(
      "/api/insights/weekly",
      expect.any(Function),
    );
  });
});
