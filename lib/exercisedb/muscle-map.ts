import type { MuscleGroup, Equipment } from "@/lib/db/types";

/**
 * Maps ExerciseDB bodyPart + target to BetterR.Me MuscleGroup.
 * Uses `target` for disambiguation when a bodyPart maps to multiple muscle groups.
 */
export function mapToMuscleGroup(
  bodyPart: string,
  target: string
): MuscleGroup {
  const bp = bodyPart.toLowerCase();
  const tgt = target.toLowerCase();

  switch (bp) {
    case "back":
      if (tgt.includes("lats")) return "lats";
      if (tgt.includes("traps")) return "traps";
      return "back";

    case "cardio":
      return "cardio";

    case "chest":
      return "chest";

    case "lower arms":
      return "forearms";

    case "lower legs":
      return "calves";

    case "neck":
      return "traps";

    case "shoulders":
      return "shoulders";

    case "upper arms":
      if (tgt.includes("biceps")) return "biceps";
      if (tgt.includes("triceps")) return "triceps";
      return "biceps";

    case "upper legs":
      if (tgt.includes("glutes")) return "glutes";
      if (tgt.includes("hamstrings")) return "hamstrings";
      return "quadriceps";

    case "waist":
      return "core";

    default:
      return "other";
  }
}

/**
 * Maps ExerciseDB equipment strings to BetterR.Me Equipment.
 */
const EQUIPMENT_MAP: Record<string, Equipment> = {
  barbell: "barbell",
  dumbbell: "dumbbell",
  cable: "cable",
  band: "band",
  kettlebell: "kettlebell",
  "body weight": "bodyweight",
  "leverage machine": "machine",
  "smith machine": "machine",
  "sled machine": "machine",
};

export function mapEquipment(exercisedbEquipment: string): Equipment {
  const normalized = exercisedbEquipment.toLowerCase();
  return EQUIPMENT_MAP[normalized] ?? "other";
}
