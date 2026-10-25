"use client";

import { useState } from "react";
import type { WeightUnitPreference } from "@/lib/preferences/types";
import { parseLoadInput, weightInputText } from "@/lib/fitness/units";

type Draft = { text: string; unit: WeightUnitPreference; anchorKg: number | null };
type InputState = { id: string; preference: WeightUnitPreference; unit: WeightUnitPreference; draft: Draft | null };

/** Unit changes alter representation; only typing replaces the canonical anchor. */
export function useWeightInput(id: string, storedKg: number | null, preference: WeightUnitPreference) {
  const [state, setState] = useState<InputState>({ id, preference, unit: preference, draft: null });
  let current = state;
  if (state.id !== id) {
    current = { id, preference, unit: preference, draft: null };
    setState(current);
  } else if (state.preference !== preference) {
    const unfinished = state.draft !== null && state.draft.text !== "" && state.draft.anchorKg === null;
    current = { ...state, preference, unit: unfinished ? state.unit : preference };
    setState(current);
  }
  const { draft, unit } = current;
  const anchorKg = draft ? draft.anchorKg : storedKg;
  return {
    unit,
    edited: draft !== null,
    valid: draft === null || draft.text === "" || draft.anchorKg !== null,
    anchorKg,
    value: draft?.unit === unit ? draft.text : weightInputText(anchorKg, unit),
    change(text: string) {
      const actualUnit = text === "" ? preference : unit;
      setState({ id, preference, unit: actualUnit, draft: { text, unit: actualUnit, anchorKg: parseLoadInput(text, actualUnit) } });
    },
  };
}
