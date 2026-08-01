import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkoutSetRow } from "@/components/fitness/workout-logger/workout-set-row";
import type { WorkoutSet } from "@/lib/db/types";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("lucide-react", () => ({
  Trash2: () => <span aria-hidden="true" />,
  CheckIcon: () => <span aria-hidden="true" />,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ checked, onCheckedChange, ...props }: { checked?: boolean; onCheckedChange?: (checked: boolean) => void }) => (
    <input
      {...props}
      type="checkbox"
      checked={checked}
      onChange={(event) => onCheckedChange?.(event.currentTarget.checked)}
    />
  ),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const set = {
  id: "set-1",
  workout_exercise_id: "workout-exercise-1",
  set_number: 1,
  set_type: "normal",
  weight_kg: 10,
  reps: 5,
  duration_seconds: null,
  distance_meters: null,
  is_completed: false,
  rpe: null,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
} satisfies WorkoutSet;

const previousSet = {
  ...set,
  id: "set-previous",
  weight_kg: 20,
} satisfies WorkoutSet;

describe("WorkoutSetRow Fitness Weight Unit presentation", () => {
  it("presents stored kilograms in pounds and stores edited pounds as kilograms", () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);

    render(
      <WorkoutSetRow
        set={set}
        exerciseType="weight_reps"
        weightUnit="lbs"
        previousSet={previousSet}
        onUpdate={onUpdate}
        onDelete={vi.fn().mockResolvedValue(undefined)}
        onComplete={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs[0]).toHaveValue(22.05);
    expect(screen.getByText("44.09 lbs x 5")).toBeInTheDocument();

    fireEvent.change(inputs[0], { target: { value: "50" } });
    fireEvent.blur(inputs[0]);

    expect(onUpdate).toHaveBeenCalledWith({ weight_kg: 22.68 });
  });

  it("refreshes the weight input when the accepted Weight Unit changes", () => {
    const { rerender } = render(
      <WorkoutSetRow
        set={set}
        exerciseType="weight_reps"
        weightUnit="lbs"
        previousSet={null}
        onUpdate={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
        onComplete={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getAllByRole("spinbutton")[0]).toHaveValue(22.05);

    rerender(
      <WorkoutSetRow
        set={set}
        exerciseType="weight_reps"
        weightUnit="kg"
        previousSet={null}
        onUpdate={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
        onComplete={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getAllByRole("spinbutton")[0]).toHaveValue(10);
  });
});
