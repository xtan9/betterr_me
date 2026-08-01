import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoutineExerciseList } from "@/components/fitness/routines/routine-exercise-list";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("lucide-react", () => ({
  Trash2: () => <span aria-hidden="true" />,
}));

const routineExercise = {
  id: "re-1",
  routine_id: "routine-1",
  exercise_id: "exercise-1",
  target_sets: 3,
  target_reps: 8,
  target_weight_kg: 10,
  target_duration_seconds: null,
  target_distance_meters: null,
  rest_timer_seconds: 90,
  notes: null,
  sort_order: 0,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
  exercise: {
    id: "exercise-1",
    user_id: null,
    name: "Bench Press",
    muscle_group_primary: "chest" as const,
    muscle_groups_secondary: [],
    equipment: "barbell" as const,
    exercise_type: "weight_reps" as const,
    is_custom: false,
    exercise_media: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
  },
};

describe("RoutineExerciseList Fitness Weight Unit presentation", () => {
  it("presents stored kilograms in pounds and converts pounds back to canonical kilograms", () => {
    const onUpdate = vi.fn();

    render(
      <RoutineExerciseList
        exercises={[routineExercise]}
        onUpdate={onUpdate}
        onRemove={vi.fn()}
        weightUnit="lbs"
      />,
    );

    const inputs = screen.getAllByRole("spinbutton");
    expect(screen.getByText("lbs")).toBeInTheDocument();
    expect(inputs[1]).toHaveValue(22.05);

    fireEvent.change(inputs[1], { target: { value: "50" } });
    fireEvent.blur(inputs[1]);

    expect(onUpdate).toHaveBeenCalledWith("re-1", {
      target_weight_kg: 22.68,
    });
  });

  it("refreshes an input when the accepted Weight Unit changes", () => {
    const { rerender } = render(
      <RoutineExerciseList
        exercises={[routineExercise]}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        weightUnit="lbs"
      />,
    );

    const poundsInput = screen.getAllByRole("spinbutton")[1];
    expect(poundsInput).toHaveValue(22.05);

    rerender(
      <RoutineExerciseList
        exercises={[routineExercise]}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        weightUnit="kg"
      />,
    );

    expect(screen.getAllByRole("spinbutton")[1]).toHaveValue(10);
  });
});
