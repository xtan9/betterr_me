"use client";

import { useFitnessPreference } from "@/lib/hooks/use-profile-preferences";
import type { UseCurrentProfileOptions } from "@/lib/hooks/use-current-profile";
import { DEFAULT_WEIGHT_UNIT_PREFERENCE } from "@/lib/preferences/owners";

export function useFitness(options?: UseCurrentProfileOptions) {
  const preference = useFitnessPreference(options);
  const weightUnitPreference = preference.weightUnit;
  const weightUnit =
    weightUnitPreference.status === "ready" ||
    weightUnitPreference.status === "pending"
      ? weightUnitPreference.value
      : DEFAULT_WEIGHT_UNIT_PREFERENCE;

  return {
    ...preference,
    weightUnit,
    weightUnitPreference,
  };
}
