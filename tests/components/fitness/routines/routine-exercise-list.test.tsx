import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
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
  it("uses a later accepted same-id target without writing an earlier saved draft back", async () => {
    const writes: unknown[] = [];
    function Workflow() {
      const [stored, setStored] = useState(routineExercise);
      return <>
        <RoutineExerciseList exercises={[stored]} weightUnit="kg" onRemove={() => {}}
          onUpdate={(_id, updates) => { writes.push(updates); setStored(current => ({ ...current, ...updates })); }} />
        <button onClick={() => setStored(current => ({ ...current, target_weight_kg: 30 }))}>Refresh accepted target</button>
        <output role="status">{stored.target_weight_kg} kg</output>
      </>;
    }
    render(<Workflow />);
    const input = screen.getByRole("textbox", { name: "targetWeight (kg)" });
    fireEvent.change(input, { target: { value: "20" } });
    await act(async () => { fireEvent.blur(input); });
    expect(screen.getByRole("status")).toHaveTextContent("20 kg");
    fireEvent.click(screen.getByRole("button", { name: "Refresh accepted target" }));
    expect(input).toHaveValue("30");
    await act(async () => { fireEvent.blur(input); });
    expect(screen.getByRole("status")).toHaveTextContent("30 kg");
    expect(writes).toEqual([{ target_weight_kg: 20 }]);
  });

  it.each(["12.", "12.5"])("retains newer %s and its actual unit while an older target save settles", async (newer) => {
    let accept!: () => void;
    const held = new Promise<void>(resolve => { accept = resolve; });
    const writes: unknown[] = [];
    function Workflow() {
      const [stored, setStored] = useState(routineExercise);
      const [unit, setUnit] = useState<"kg" | "lbs">("kg");
      return <>
        <RoutineExerciseList exercises={[stored]} weightUnit={unit} onRemove={() => {}}
          onUpdate={async (_id, updates) => {
            writes.push(updates);
            if (writes.length === 1) await held;
            setStored(current => ({ ...current, ...updates }));
          }} />
        <button onClick={() => setUnit("lbs")}>Prefer pounds</button>
        <output role="status">{stored.target_weight_kg} kg</output>
      </>;
    }
    render(<Workflow />);
    const input = screen.getByRole("textbox", { name: "targetWeight (kg)" });
    fireEvent.change(input, { target: { value: "20" } });
    fireEvent.blur(input);
    expect(writes).toEqual([{ target_weight_kg: 20 }]);
    fireEvent.change(input, { target: { value: "12." } });
    fireEvent.click(screen.getByRole("button", { name: "Prefer pounds" }));
    fireEvent.change(input, { target: { value: newer } });
    await act(async () => { accept(); await held; });
    expect(screen.getByRole("status")).toHaveTextContent("20 kg");
    expect(screen.getByRole("textbox", { name: "targetWeight (kg)" })).toHaveValue(newer);
    await act(async () => { fireEvent.blur(input); });
    expect(writes).toEqual(newer === "12." ? [{ target_weight_kg: 20 }] : [{ target_weight_kg: 20 }, { target_weight_kg: 12.5 }]);
    expect(screen.getByRole("status")).toHaveTextContent(newer === "12." ? "20 kg" : "12.5 kg");
  });

  it("keeps a precise target through untouched unit switches and retains unfinished input in kilograms", () => {
    const onUpdate = vi.fn();
    const props = { exercises: [{ ...routineExercise, target_weight_kg: 0.123 }], onUpdate, onRemove: vi.fn() };
    const { container, rerender } = render(<RoutineExerciseList {...props} weightUnit="lbs" />);
    fireEvent.blur(container.querySelectorAll("input")[1]);
    expect(onUpdate).not.toHaveBeenCalled();
    rerender(<RoutineExerciseList {...props} weightUnit="kg" />);
    fireEvent.change(container.querySelectorAll("input")[1], { target: { value: "12." } });
    rerender(<RoutineExerciseList {...props} weightUnit="lbs" />);
    expect(screen.getByDisplayValue("12.")).toBeInTheDocument();
    expect(screen.getByText("kg")).toBeInTheDocument();
    fireEvent.blur(screen.getByDisplayValue("12."));
    expect(onUpdate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByDisplayValue("12."), { target: { value: "12.5" } });
    fireEvent.blur(screen.getByDisplayValue("12.5"));
    expect(onUpdate).toHaveBeenCalledWith("re-1", { target_weight_kg: 12.5 });
  });

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

    const input = screen.getByRole("textbox", { name: "targetWeight (lbs)" });
    expect(screen.getByText("lbs")).toBeInTheDocument();
    expect(input).toHaveValue("22.046226218487758");

    fireEvent.change(input, { target: { value: "50" } });
    fireEvent.blur(input);

    expect(onUpdate).toHaveBeenCalledWith("re-1", {
      target_weight_kg: 22.6796185,
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

    const poundsInput = screen.getByRole("textbox", { name: "targetWeight (lbs)" });
    expect(poundsInput).toHaveValue("22.046226218487758");

    rerender(
      <RoutineExerciseList
        exercises={[routineExercise]}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
        weightUnit="kg"
      />,
    );

    expect(screen.getByRole("textbox", { name: "targetWeight (kg)" })).toHaveValue("10");
  });
});
