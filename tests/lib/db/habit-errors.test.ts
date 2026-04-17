import { describe, it, expect } from "vitest";
import {
  HabitNotFoundError,
  HabitNotFormedError,
  HabitAlreadyFormedError,
} from "@/lib/db/habit-errors";

// These classes only exist to wrap a habitId into a distinct Error subtype.
// The message string is the only meaningful behavior — mutation testing will
// try to break it by emptying the literal prefix (e.g. "Habit not found: "
// → "") or dropping the interpolation. The tests below assert the exact
// interpolated string and the unique `name` value so both mutants die.

describe("HabitNotFoundError", () => {
  it("builds the exact 'Habit not found: <id>' message and sets name", () => {
    const err = new HabitNotFoundError("habit-123");
    // Exact message — kills StringLiteral mutations of "Habit not found: ".
    expect(err.message).toBe("Habit not found: habit-123");
    // Name stamp — kills StringLiteral mutation of "HabitNotFoundError".
    expect(err.name).toBe("HabitNotFoundError");
    // Subclass relationship — confirms Error parent still invoked.
    expect(err).toBeInstanceOf(HabitNotFoundError);
    expect(err).toBeInstanceOf(Error);
  });

  it("interpolates a different id end-to-end", () => {
    // Second id catches mutants that drop the interpolation (e.g. replace
    // `${habitId}` with an empty string) — one-id tests would still pass
    // since the hardcoded prefix would happen to match.
    const err = new HabitNotFoundError("abc-xyz");
    expect(err.message).toBe("Habit not found: abc-xyz");
  });
});

describe("HabitNotFormedError", () => {
  it("builds the exact 'Habit is not formed: <id>' message and sets name", () => {
    const err = new HabitNotFormedError("habit-456");
    expect(err.message).toBe("Habit is not formed: habit-456");
    expect(err.name).toBe("HabitNotFormedError");
    expect(err).toBeInstanceOf(HabitNotFormedError);
    expect(err).toBeInstanceOf(Error);
  });

  it("interpolates a different id end-to-end", () => {
    const err = new HabitNotFormedError("second-id");
    expect(err.message).toBe("Habit is not formed: second-id");
  });
});

describe("HabitAlreadyFormedError", () => {
  it("builds the exact 'Habit is already formed: <id>' message and sets name", () => {
    const err = new HabitAlreadyFormedError("habit-789");
    expect(err.message).toBe("Habit is already formed: habit-789");
    expect(err.name).toBe("HabitAlreadyFormedError");
    expect(err).toBeInstanceOf(HabitAlreadyFormedError);
    expect(err).toBeInstanceOf(Error);
  });

  it("interpolates a different id end-to-end", () => {
    const err = new HabitAlreadyFormedError("other-id");
    expect(err.message).toBe("Habit is already formed: other-id");
  });
});
