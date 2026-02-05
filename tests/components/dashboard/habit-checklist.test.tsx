import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { HabitChecklist } from "@/components/dashboard/habit-checklist";
import type { HabitWithTodayStatus } from "@/lib/db/types";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

const messages = {
  dashboard: {
    habits: {
      title: "Today's Habits",
      addHabit: "Add Habit",
      completed: "{completed} of {total} completed",
      moreToGo: "{count} more to go!",
      allComplete: "All habits complete!",
      noHabits: "No habits yet",
      createFirst: "Create your first habit",
    },
  },
  habits: {
    card: {
      streakDays: "{count} days",
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

const mockHabits: HabitWithTodayStatus[] = [
  {
    id: "1",
    user_id: "user-1",
    name: "Morning Meditation",
    description: null,
    category: "wellness",
    frequency: { type: "daily" },
    status: "active",
    current_streak: 23,
    best_streak: 30,
    paused_at: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    completed_today: true,
  },
  {
    id: "2",
    user_id: "user-1",
    name: "Daily Exercise",
    description: null,
    category: "health",
    frequency: { type: "daily" },
    status: "active",
    current_streak: 8,
    best_streak: 12,
    paused_at: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    completed_today: false,
  },
  {
    id: "3",
    user_id: "user-1",
    name: "Read 30 min",
    description: null,
    category: "learning",
    frequency: { type: "daily" },
    status: "active",
    current_streak: 5,
    best_streak: 7,
    paused_at: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    completed_today: false,
  },
];

describe("HabitChecklist", () => {
  it("renders list of habits from props", () => {
    const onToggle = vi.fn();
    const onCreateHabit = vi.fn();

    renderWithIntl(
      <HabitChecklist
        habits={mockHabits}
        onToggle={onToggle}
        onCreateHabit={onCreateHabit}
      />
    );

    expect(screen.getByText("Today's Habits")).toBeInTheDocument();
    expect(screen.getByText("Morning Meditation")).toBeInTheDocument();
    expect(screen.getByText("Daily Exercise")).toBeInTheDocument();
    expect(screen.getByText("Read 30 min")).toBeInTheDocument();
  });

  it("calls onToggle when checkbox clicked", async () => {
    const onToggle = vi.fn().mockResolvedValue(undefined);
    const onCreateHabit = vi.fn();

    renderWithIntl(
      <HabitChecklist
        habits={mockHabits}
        onToggle={onToggle}
        onCreateHabit={onCreateHabit}
      />
    );

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]); // Click on "Daily Exercise" checkbox

    expect(onToggle).toHaveBeenCalledWith("2");
  });

  it("shows correct completion summary", () => {
    const onToggle = vi.fn();
    const onCreateHabit = vi.fn();

    renderWithIntl(
      <HabitChecklist
        habits={mockHabits}
        onToggle={onToggle}
        onCreateHabit={onCreateHabit}
      />
    );

    expect(screen.getByText(/1 of 3 completed/)).toBeInTheDocument();
    expect(screen.getByText(/2 more to go!/)).toBeInTheDocument();
  });

  it('shows "all complete" state when 100%', () => {
    const allCompleted = mockHabits.map((h) => ({
      ...h,
      completed_today: true,
    }));
    const onToggle = vi.fn();
    const onCreateHabit = vi.fn();

    renderWithIntl(
      <HabitChecklist
        habits={allCompleted}
        onToggle={onToggle}
        onCreateHabit={onCreateHabit}
      />
    );

    expect(screen.getByText(/All habits complete!/)).toBeInTheDocument();
  });

  it("shows empty state when no habits", () => {
    const onToggle = vi.fn();
    const onCreateHabit = vi.fn();

    renderWithIntl(
      <HabitChecklist
        habits={[]}
        onToggle={onToggle}
        onCreateHabit={onCreateHabit}
      />
    );

    expect(screen.getByText("No habits yet")).toBeInTheDocument();
    expect(screen.getByText("Create your first habit")).toBeInTheDocument();
  });

  it("Add button calls onCreateHabit", () => {
    const onToggle = vi.fn();
    const onCreateHabit = vi.fn();

    renderWithIntl(
      <HabitChecklist
        habits={mockHabits}
        onToggle={onToggle}
        onCreateHabit={onCreateHabit}
      />
    );

    const addButton = screen.getByText("Add Habit");
    fireEvent.click(addButton);

    expect(onCreateHabit).toHaveBeenCalled();
  });

  it("disables checkboxes when loading", () => {
    const onToggle = vi.fn();
    const onCreateHabit = vi.fn();

    renderWithIntl(
      <HabitChecklist
        habits={mockHabits}
        onToggle={onToggle}
        onCreateHabit={onCreateHabit}
        isLoading={true}
      />
    );

    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((checkbox) => {
      expect(checkbox).toBeDisabled();
    });
  });
});
