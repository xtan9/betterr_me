import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
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
  it("uses a later authoritative same-id load after saving without writing the old draft back", async () => {
    const saved: Array<number | null | undefined> = [];
    function Workflow() {
      const [stored, setStored] = useState<WorkoutSet>({ ...set });
      return <>
        <WorkoutSetRow set={stored} exerciseType="weight_reps" weightUnit="kg" previousSet={null}
          onUpdate={async updates => { saved.push(updates.weight_kg); setStored(current => ({ ...current, ...updates })); }}
          onDelete={async () => {}} onComplete={async () => {}} />
        <button onClick={() => setStored(current => ({ ...current, weight_kg: 30 }))}>Refresh accepted record</button>
        <output role="status">{stored.weight_kg} kg</output>
      </>;
    }
    render(<Workflow />);
    const input = screen.getByRole("textbox", { name: "weight (kg)" });
    fireEvent.change(input, { target: { value: "20" } });
    await act(async () => { fireEvent.blur(input); });
    expect(screen.getByRole("status")).toHaveTextContent("20 kg");
    fireEvent.click(screen.getByRole("button", { name: "Refresh accepted record" }));
    expect(input).toHaveValue("30");
    await act(async () => { fireEvent.blur(input); });
    expect(screen.getByRole("status")).toHaveTextContent("30 kg");
    expect(saved).toEqual([20]);
  });

  it.each(["12.", "12.5"])("keeps newer %s input in its authored unit when an older save is acknowledged", async (newer) => {
    let accept!: () => void;
    const held = new Promise<void>(resolve => { accept = resolve; });
    const saved: unknown[] = [];
    function Workflow() {
      const [stored, setStored] = useState<WorkoutSet>({ ...set });
      const [unit, setUnit] = useState<"kg" | "lbs">("kg");
      return <>
        <WorkoutSetRow set={stored} exerciseType="weight_reps" weightUnit={unit} previousSet={null}
          onUpdate={async updates => {
            saved.push(updates);
            if (saved.length === 1) await held;
            setStored(current => ({ ...current, ...updates }));
          }} onDelete={async () => {}} onComplete={async () => {}} />
        <button onClick={() => setUnit("lbs")}>Prefer pounds</button>
        <output role="status">{stored.weight_kg} kg</output>
      </>;
    }
    render(<Workflow />);
    const input = screen.getByRole("textbox", { name: "weight (kg)" });
    fireEvent.change(input, { target: { value: "20" } });
    fireEvent.blur(input);
    await waitFor(() => expect(saved).toEqual([{ weight_kg: 20 }]));
    fireEvent.change(input, { target: { value: "12." } });
    fireEvent.click(screen.getByRole("button", { name: "Prefer pounds" }));
    fireEvent.change(input, { target: { value: newer } });
    await act(async () => { accept(); await held; });
    expect(screen.getByRole("status")).toHaveTextContent("20 kg");
    expect(screen.getByRole("textbox", { name: "weight (kg)" })).toHaveValue(newer);
    await act(async () => { fireEvent.blur(input); });
    expect(saved).toEqual(newer === "12." ? [{ weight_kg: 20 }] : [{ weight_kg: 20 }, { weight_kg: 12.5 }]);
    expect(screen.getByRole("status")).toHaveTextContent(newer === "12." ? "20 kg" : "12.5 kg");
  });

  it("retains the edited load after a failed write and retries before completion", async () => {
    let stored: WorkoutSet = { ...set };
    let fail = true;
    function Workflow() {
      const [completed, setCompleted] = useState<number | null>(null);
      return <>
        <WorkoutSetRow set={stored} exerciseType="weight_reps" weightUnit="lbs" previousSet={null}
          onUpdate={async (updates) => { if (fail) throw new Error("offline"); stored = { ...stored, ...updates }; }}
          onDelete={async () => {}} onComplete={async () => { setCompleted(stored.weight_kg); }} />
        <output role="status">{completed === null ? "Not completed" : `Completed ${completed} kg`}</output>
      </>;
    }
    render(<Workflow />);
    const input = screen.getByRole("textbox", { name: "weight (lbs)" });
    fireEvent.change(input, { target: { value: "1" } });
    await act(async () => { fireEvent.click(screen.getByRole("checkbox")); });
    expect(screen.getByRole("status")).toHaveTextContent("Not completed");
    expect(input).toHaveValue("1");
    fail = false;
    await act(async () => { fireEvent.click(screen.getByRole("checkbox")); });
    expect(screen.getByRole("status")).toHaveTextContent("Completed 0.45359237 kg");
  });

  it("preserves canonical kilograms and original spelling through repeated display changes", async () => {
    let stored: WorkoutSet = { ...set, weight_kg: 0.123 };
    const onUpdate = async (updates: Partial<WorkoutSet>) => { stored = { ...stored, ...updates }; };
    const props = { exerciseType: "weight_reps" as const, previousSet: null, onUpdate,
      onDelete: async () => {}, onComplete: async () => {} };
    const { rerender } = render(<WorkoutSetRow {...props} set={stored} weightUnit="kg" />);
    fireEvent.change(screen.getByRole("textbox", { name: "weight (kg)" }), { target: { value: "000.123" } });
    for (let turn = 0; turn < 10; turn++) {
      rerender(<WorkoutSetRow {...props} set={stored} weightUnit="lbs" />);
      const pounds = screen.getByRole("textbox", { name: "weight (lbs)" });
      expect(pounds).toHaveValue("0.27116858248739942");
      await act(async () => { fireEvent.blur(pounds); });
      rerender(<WorkoutSetRow {...props} set={stored} weightUnit="kg" />);
      const kg = screen.getByRole("textbox", { name: "weight (kg)" });
      expect(kg).toHaveValue("000.123");
      await act(async () => { fireEvent.blur(kg); });
      expect(stored.weight_kg).toBe(0.123);
    }
  });

  it("keeps incomplete repetitions and duration unperformed instead of accepting numeric prefixes", async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined), onUpdate = vi.fn().mockResolvedValue(undefined);
    const props = { set, weightUnit: "kg" as const, previousSet: null, onUpdate,
      onComplete, onDelete: async () => {} };
    const { rerender } = render(<WorkoutSetRow {...props} exerciseType="bodyweight_reps" />);
    const repetitions = screen.getByRole("textbox", { name: "reps" });
    fireEvent.change(repetitions, { target: { value: "12x" } });
    await act(async () => { fireEvent.blur(repetitions); fireEvent.click(screen.getByRole("checkbox")); });
    expect(repetitions).toHaveValue("12x");
    expect(repetitions).toHaveAttribute("aria-invalid", "true");
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    rerender(<WorkoutSetRow {...props} exerciseType="duration" />);
    const duration = screen.getByRole("textbox", { name: "duration" });
    fireEvent.change(duration, { target: { value: "90.5" } });
    await act(async () => { fireEvent.blur(duration); fireEvent.click(screen.getByRole("checkbox")); });
    expect(duration).toHaveValue("90.5");
    expect(duration).toHaveAttribute("aria-invalid", "true");
    expect(onUpdate).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("completes the edited measurement only after its held write is accepted", async () => {
    let accept!: () => void;
    const held = new Promise<void>((resolve) => { accept = resolve; });
    let stored: WorkoutSet = { ...set };
    function Workflow() {
      const [completed, setCompleted] = useState<number | null>(null);
      return <>
        <WorkoutSetRow set={stored} exerciseType="weight_reps" weightUnit="lbs" previousSet={null}
          onUpdate={async (updates) => { await held; stored = { ...stored, ...updates }; }}
          onDelete={async () => {}} onComplete={async () => { setCompleted(stored.weight_kg); }} />
        <output role="status">{completed === null ? "Not completed" : `Completed ${completed} kg`}</output>
      </>;
    }
    const { container } = render(<Workflow />);
    const input = container.querySelector('input[inputmode="decimal"]')!;
    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("status")).toHaveTextContent("Not completed");
    await act(async () => { accept(); await held; });
    expect(screen.getByRole("status")).toHaveTextContent("Completed 0.45359237 kg");
  });

  it("keeps unfinished kilograms in their actual unit across a pounds preference change and continued typing", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const props = { set, exerciseType: "weight_reps" as const, previousSet: null, onUpdate,
      onDelete: vi.fn().mockResolvedValue(undefined), onComplete: vi.fn().mockResolvedValue(undefined) };
    const { container, rerender } = render(<WorkoutSetRow {...props} weightUnit="kg" />);
    fireEvent.change(container.querySelector('input[inputmode="decimal"]')!, { target: { value: "12." } });
    rerender(<WorkoutSetRow {...props} weightUnit="lbs" />);
    const input = screen.getByDisplayValue("12.");
    expect(screen.getByText("kg")).toBeInTheDocument();
    fireEvent.blur(input);
    expect(onUpdate).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "12.5" } });
    fireEvent.blur(input);
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ weight_kg: 12.5 }));
    expect(input).toHaveValue("12.5");
  });

  it("records one edited pound as exactly 0.45359237 kilograms", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <WorkoutSetRow set={set} exerciseType="weight_reps" weightUnit="lbs" previousSet={null}
        onUpdate={onUpdate} onDelete={vi.fn().mockResolvedValue(undefined)} onComplete={vi.fn().mockResolvedValue(undefined)} />,
    );
    const input = container.querySelector('input[inputmode="decimal"]')!;
    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.blur(input);
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ weight_kg: 0.45359237 }));
  });

  it("does not replace a precise recorded load when the pounds display is blurred untouched", () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <WorkoutSetRow
        set={{ ...set, weight_kg: 0.123 }}
        exerciseType="weight_reps"
        weightUnit="lbs"
        previousSet={null}
        onUpdate={onUpdate}
        onDelete={vi.fn().mockResolvedValue(undefined)}
        onComplete={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    fireEvent.blur(container.querySelector('input[inputmode="decimal"]')!);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("presents stored kilograms in pounds and stores edited pounds as kilograms", async () => {
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

    const input = screen.getByRole("textbox", { name: "weight (lbs)" });
    expect(input).toHaveValue("22.046226218487758");
    expect(screen.getByText("44.092452436975516 lbs x 5")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "50" } });
    fireEvent.blur(input);

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ weight_kg: 22.6796185 }));
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

    expect(screen.getByRole("textbox", { name: "weight (lbs)" })).toHaveValue("22.046226218487758");

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

    expect(screen.getByRole("textbox", { name: "weight (kg)" })).toHaveValue("10");
  });
});
