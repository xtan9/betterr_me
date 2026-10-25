"use client";

import { useState } from "react";
import type { WeightUnitPreference } from "@/lib/preferences/types";
import { parseLoadInput, weightInputText } from "@/lib/fitness/units";

type Draft = { text: string; unit: WeightUnitPreference; anchorKg: number | null; acknowledged: boolean };
type InputState = { id: string; storedKg: number | null; preference: WeightUnitPreference; unit: WeightUnitPreference; draft: Draft | null };

/** Unit changes alter representation; only typing replaces the canonical anchor. */
export function useWeightInput(id: string, storedKg: number | null, preference: WeightUnitPreference) {
  const [state, setState] = useState<InputState>({ id, storedKg, preference, unit: preference, draft: null });
  let current = state;
  if (state.id !== id) {
    current = { id, storedKg, preference, unit: preference, draft: null };
  } else {
    if (state.storedKg !== storedKg) {
      // Keep accepted spelling until a later authoritative value replaces it.
      // Unsaved typing survives optimistic updates, rollbacks, and older writes.
      const replaced = state.draft?.acknowledged && state.draft.anchorKg !== storedKg;
      current = { ...state, storedKg, draft: replaced ? null : state.draft, unit: replaced ? preference : state.unit };
    }
    if (current.preference !== preference) {
      const unfinished = current.draft !== null && current.draft.text !== "" && current.draft.anchorKg === null;
      current = { ...current, preference, unit: unfinished ? current.unit : preference };
    }
  }
  if (current !== state) setState(current);
  const { draft, unit } = current;
  const anchorKg = draft ? draft.anchorKg : storedKg;
  return {
    unit,
    edited: draft !== null && (!draft.acknowledged || draft.anchorKg !== storedKg),
    valid: draft === null || draft.text === "" || draft.anchorKg !== null,
    anchorKg,
    value: draft?.unit === unit ? draft.text : weightInputText(anchorKg, unit),
    change(text: string) {
      const actualUnit = text === "" ? preference : unit;
      setState({ id, storedKg, preference, unit: actualUnit, draft: { text, unit: actualUnit, anchorKg: parseLoadInput(text, actualUnit), acknowledged: false } });
    },
    acknowledge() {
      if (!draft) return;
      setState(latest => {
        // This closure belongs to the submitted draft, never to newer typing.
        if (latest.id !== id || latest.draft !== draft) return latest;
        const replaced = latest.storedKg !== storedKg && latest.storedKg !== draft.anchorKg;
        return { ...latest, unit: replaced ? latest.preference : latest.unit,
          draft: replaced ? null : { ...draft, acknowledged: true } };
      });
    },
  };
}
