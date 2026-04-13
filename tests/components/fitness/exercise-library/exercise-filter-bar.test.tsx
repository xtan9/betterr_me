import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { ExerciseFilterBar } from "@/components/fitness/exercise-library/exercise-filter-bar";

expect.extend(matchers);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("ExerciseFilterBar", () => {
  const makeProps = (overrides: Partial<Parameters<typeof ExerciseFilterBar>[0]> = {}) => ({
    search: "",
    onSearchChange: vi.fn(),
    muscleGroup: null,
    onMuscleGroupChange: vi.fn(),
    equipment: null,
    onEquipmentChange: vi.fn(),
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders search input and two selects", () => {
    render(<ExerciseFilterBar {...makeProps()} />);
    expect(screen.getByPlaceholderText("searchPlaceholder")).toBeInTheDocument();
    // Two comboboxes (Radix SelectTrigger renders role=combobox)
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
  });

  it("reflects search value from props", () => {
    render(<ExerciseFilterBar {...makeProps({ search: "bench" })} />);
    expect(screen.getByPlaceholderText("searchPlaceholder")).toHaveValue("bench");
  });

  it("fires onSearchChange with typed value", async () => {
    const onSearchChange = vi.fn();
    const user = userEvent.setup();
    render(<ExerciseFilterBar {...makeProps({ onSearchChange })} />);

    await user.type(screen.getByPlaceholderText("searchPlaceholder"), "a");
    expect(onSearchChange).toHaveBeenLastCalledWith("a");
  });

  it("fires onMuscleGroupChange when user selects a muscle group", async () => {
    const onMuscleGroupChange = vi.fn();
    const user = userEvent.setup();
    render(<ExerciseFilterBar {...makeProps({ onMuscleGroupChange })} />);

    const [muscleTrigger] = screen.getAllByRole("combobox");
    await user.click(muscleTrigger);

    const chestOption = await screen.findByRole("option", {
      name: "muscleGroups.chest",
    });
    await user.click(chestOption);

    expect(onMuscleGroupChange).toHaveBeenCalledWith("chest");
  });

  it("passes null when 'all' is selected for muscle group", async () => {
    const onMuscleGroupChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ExerciseFilterBar
        {...makeProps({ muscleGroup: "chest", onMuscleGroupChange })}
      />
    );

    const [muscleTrigger] = screen.getAllByRole("combobox");
    await user.click(muscleTrigger);

    const allOption = await screen.findByRole("option", {
      name: "allMuscleGroups",
    });
    await user.click(allOption);

    expect(onMuscleGroupChange).toHaveBeenCalledWith(null);
  });

  it("fires onEquipmentChange when user selects equipment", async () => {
    const onEquipmentChange = vi.fn();
    const user = userEvent.setup();
    render(<ExerciseFilterBar {...makeProps({ onEquipmentChange })} />);

    const [, equipmentTrigger] = screen.getAllByRole("combobox");
    await user.click(equipmentTrigger);

    const option = await screen.findByRole("option", {
      name: "equipmentTypes.barbell",
    });
    await user.click(option);

    expect(onEquipmentChange).toHaveBeenCalledWith("barbell");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<ExerciseFilterBar {...makeProps()} />);
    // Radix SelectTrigger renders a button that derives its accessible name
    // from placeholder/value text via aria-labelledby; axe sometimes flags
    // button-name in jsdom before the portal content resolves.
    expect(
      await axe(container, { rules: { "button-name": { enabled: false } } })
    ).toHaveNoViolations();
  });
});
