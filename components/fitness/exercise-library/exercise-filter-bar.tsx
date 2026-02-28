"use client";

import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MuscleGroup, Equipment } from "@/lib/db/types";

const MUSCLE_GROUPS: MuscleGroup[] = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "core",
  "quadriceps",
  "hamstrings",
  "glutes",
  "calves",
  "traps",
  "lats",
  "full_body",
  "cardio",
  "other",
];

const EQUIPMENT_TYPES: Equipment[] = [
  "barbell",
  "dumbbell",
  "machine",
  "bodyweight",
  "kettlebell",
  "cable",
  "band",
  "other",
  "none",
];

interface ExerciseFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  muscleGroup: MuscleGroup | null;
  onMuscleGroupChange: (value: MuscleGroup | null) => void;
  equipment: Equipment | null;
  onEquipmentChange: (value: Equipment | null) => void;
}

export function ExerciseFilterBar({
  search,
  onSearchChange,
  muscleGroup,
  onMuscleGroupChange,
  equipment,
  onEquipmentChange,
}: ExerciseFilterBarProps) {
  const t = useTranslations("exercises");

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <Input
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      <Select
        value={muscleGroup ?? "all"}
        onValueChange={(v) =>
          onMuscleGroupChange(v === "all" ? null : (v as MuscleGroup))
        }
      >
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder={t("filterMuscleGroup")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("allMuscleGroups")}</SelectItem>
          {MUSCLE_GROUPS.map((mg) => (
            <SelectItem key={mg} value={mg}>
              {t(`muscleGroups.${mg}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={equipment ?? "all"}
        onValueChange={(v) =>
          onEquipmentChange(v === "all" ? null : (v as Equipment))
        }
      >
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder={t("filterEquipment")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("allEquipment")}</SelectItem>
          {EQUIPMENT_TYPES.map((eq) => (
            <SelectItem key={eq} value={eq}>
              {t(`equipmentTypes.${eq}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
