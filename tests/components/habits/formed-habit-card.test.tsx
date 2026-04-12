import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FormedHabitCard } from "@/components/habits/formed-habit-card";
import type { Habit } from "@/lib/db/types";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

const habit: Habit = {
  id: "h1",
  user_id: "u1",
  name: "Morning meditation",
  description: null,
  category_id: null,
  frequency: { type: "daily" },
  status: "formed",
  current_streak: 0,
  best_streak: 120,
  paused_at: null,
  graduated_at: "2026-04-01T00:00:00Z",
  graduated_streak: 87,
  nudge_dismissed_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-04-01T00:00:00Z",
};

describe("FormedHabitCard", () => {
  it("renders habit name and graduation metadata", () => {
    render(
      <FormedHabitCard habit={habit} onReactivate={vi.fn()} onDelete={vi.fn()} />
    );
    expect(screen.getByText("Morning meditation")).toBeInTheDocument();
    // graduated_streak=87 should appear in the rendered `at_streak` translation
    expect(screen.getByText(/87/)).toBeInTheDocument();
    // best_streak=120 should appear
    expect(screen.getByText(/120/)).toBeInTheDocument();
  });

  it("calls onReactivate with habit id when Reactivate clicked", () => {
    const onReactivate = vi.fn();
    render(
      <FormedHabitCard habit={habit} onReactivate={onReactivate} onDelete={vi.fn()} />
    );
    fireEvent.click(
      screen.getByRole("button", { name: /formed_gallery.reactivate/ })
    );
    expect(onReactivate).toHaveBeenCalledWith("h1");
  });

  it("calls onDelete with habit id when Delete clicked", () => {
    const onDelete = vi.fn();
    render(
      <FormedHabitCard habit={habit} onReactivate={vi.fn()} onDelete={onDelete} />
    );
    fireEvent.click(
      screen.getByRole("button", { name: /formed_gallery.delete/ })
    );
    expect(onDelete).toHaveBeenCalledWith("h1");
  });

  it("renders with null graduated_at gracefully (no crash)", () => {
    const orphan: Habit = { ...habit, graduated_at: null, graduated_streak: null };
    render(
      <FormedHabitCard habit={orphan} onReactivate={vi.fn()} onDelete={vi.fn()} />
    );
    expect(screen.getByText("Morning meditation")).toBeInTheDocument();
  });
});
