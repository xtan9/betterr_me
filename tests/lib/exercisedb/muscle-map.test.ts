import { describe, it, expect } from "vitest";
import { mapToMuscleGroup, mapEquipment } from "@/lib/exercisedb/muscle-map";

describe("mapToMuscleGroup", () => {
  it("maps back + lats → lats", () => {
    expect(mapToMuscleGroup("back", "lats")).toBe("lats");
  });

  it("maps back + traps → traps", () => {
    expect(mapToMuscleGroup("back", "traps")).toBe("traps");
  });

  it("maps back + other target → back", () => {
    expect(mapToMuscleGroup("back", "upper back")).toBe("back");
  });

  it("maps cardio → cardio", () => {
    expect(mapToMuscleGroup("cardio", "cardiovascular system")).toBe("cardio");
  });

  it("maps chest → chest", () => {
    expect(mapToMuscleGroup("chest", "pectorals")).toBe("chest");
  });

  it("maps lower arms → forearms", () => {
    expect(mapToMuscleGroup("lower arms", "forearms")).toBe("forearms");
  });

  it("maps lower legs → calves", () => {
    expect(mapToMuscleGroup("lower legs", "calves")).toBe("calves");
  });

  it("maps neck → traps", () => {
    expect(mapToMuscleGroup("neck", "levator scapulae")).toBe("traps");
  });

  it("maps shoulders → shoulders", () => {
    expect(mapToMuscleGroup("shoulders", "delts")).toBe("shoulders");
  });

  it("maps upper arms + biceps → biceps", () => {
    expect(mapToMuscleGroup("upper arms", "biceps")).toBe("biceps");
  });

  it("maps upper arms + triceps → triceps", () => {
    expect(mapToMuscleGroup("upper arms", "triceps")).toBe("triceps");
  });

  it("maps upper arms + other → biceps (default)", () => {
    expect(mapToMuscleGroup("upper arms", "brachialis")).toBe("biceps");
  });

  it("maps upper legs + glutes → glutes", () => {
    expect(mapToMuscleGroup("upper legs", "glutes")).toBe("glutes");
  });

  it("maps upper legs + hamstrings → hamstrings", () => {
    expect(mapToMuscleGroup("upper legs", "hamstrings")).toBe("hamstrings");
  });

  it("maps upper legs + other → quadriceps (default)", () => {
    expect(mapToMuscleGroup("upper legs", "quads")).toBe("quadriceps");
  });

  it("maps waist → core", () => {
    expect(mapToMuscleGroup("waist", "abs")).toBe("core");
  });

  it("maps unknown body part → other", () => {
    expect(mapToMuscleGroup("eyeballs", "iris")).toBe("other");
  });

  it("is case-insensitive for bodyPart", () => {
    expect(mapToMuscleGroup("BACK", "Lats")).toBe("lats");
    expect(mapToMuscleGroup("Upper Arms", "BICEPS")).toBe("biceps");
  });

  it("is case-insensitive for target", () => {
    expect(mapToMuscleGroup("upper legs", "GLUTES")).toBe("glutes");
  });
});

describe("mapEquipment", () => {
  it("maps known equipment strings directly", () => {
    expect(mapEquipment("barbell")).toBe("barbell");
    expect(mapEquipment("dumbbell")).toBe("dumbbell");
    expect(mapEquipment("cable")).toBe("cable");
    expect(mapEquipment("band")).toBe("band");
    expect(mapEquipment("kettlebell")).toBe("kettlebell");
  });

  it("maps body weight → bodyweight", () => {
    expect(mapEquipment("body weight")).toBe("bodyweight");
  });

  it("collapses all machine variants to machine", () => {
    expect(mapEquipment("leverage machine")).toBe("machine");
    expect(mapEquipment("smith machine")).toBe("machine");
    expect(mapEquipment("sled machine")).toBe("machine");
  });

  it("maps unknown equipment → other", () => {
    expect(mapEquipment("medicine ball")).toBe("other");
  });

  it("is case-insensitive", () => {
    expect(mapEquipment("BARBELL")).toBe("barbell");
    expect(mapEquipment("Body Weight")).toBe("bodyweight");
  });
});
